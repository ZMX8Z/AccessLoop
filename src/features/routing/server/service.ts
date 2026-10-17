import { z } from 'zod';
import { AppError } from '../../../server/http/errors';
import { ProviderGate } from '../../../server/providers/gate';
import {
  LineStringSchema,
  PassageRefSchema,
  RouteInputSchema,
  RouteResultSchema,
} from '../../../shared/contracts';
import type {
  AvoidGeometry,
  LineString,
  PassageRef,
  Position,
  RouteDTO,
  RouteInput,
  RoutingContextDTO,
} from '../../../shared/contracts';
import type { RoutingRepository } from './repository';
import {
  bufferPassage,
  containsPosition,
  mergeAvoidances,
  pointInBbox,
  validateReportPassage,
  validateRouteGeometry,
} from './geometry';
import { beforeDeadline } from './deadline';
import { contextsMatch, digest, evaluateContext } from './context';

export type DirectionsResult = {
  geometry: LineString;
  distanceM: number;
  durationS: number;
};
export type DirectionsAdapter = {
  identity: string;
  keyFingerprint: string;
  directions(
    input: RouteInput,
    avoidance?: AvoidGeometry,
  ): Promise<DirectionsResult>;
};
const CacheSchema = z.strictObject({
  geometry: LineStringSchema,
  distanceM: z.number().finite().nonnegative(),
  durationS: z.number().finite().nonnegative(),
  computedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export class RoutingService {
  private readonly inFlight = new Map<
    string,
    Promise<DirectionsResult & { computedAt: string }>
  >();
  private readonly now: () => number;
  private readonly gate: ProviderGate;
  private readonly policy: { minuteLimit: number; dayLimit: number };
  constructor(
    private readonly repository: RoutingRepository,
    private readonly adapter: DirectionsAdapter,
    options: {
      now?: () => number;
      policy?: { minuteLimit: number; dayLimit: number };
      gate?: ProviderGate;
    } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.gate = options.gate ?? new ProviderGate(repository, { now: this.now });
    this.policy = options.policy ?? { minuteLimit: 30, dayLimit: 1800 };
  }
  async context(sessionKey: string): Promise<RoutingContextDTO> {
    return evaluateContext(
      await this.repository.readSnapshot(sessionKey),
      this.now(),
    ).context;
  }
  async route(sessionKey: string, raw: unknown): Promise<RouteDTO> {
    const parsed = RouteInputSchema.safeParse(raw);
    if (!parsed.success)
      throw new AppError(400, 'INVALID_INPUT', 'Check the route parameters.');
    const input = parsed.data;
    const deadlineAt = this.now() + 15000;
    const timed = <T>(pending: Promise<T>) =>
      beforeDeadline(pending, deadlineAt, this.now);
    for (let recomputation = 0; recomputation < 2; recomputation++) {
      let cleanup: (() => void) | undefined;
      try {
        const snapshot = await timed(this.repository.readSnapshot(sessionKey));
        const effective = evaluateContext(snapshot, this.now());
        const { region } = snapshot;
        if (
          !pointInBbox(input.start, region.bbox) ||
          !pointInBbox(input.end, region.bbox)
        )
          throw new AppError(
            422,
            'OUT_OF_COVERAGE',
            'Choose points within the supported area.',
          );
        for (const key of Object.keys(
          input.restrictions,
        ) as (keyof RouteInput['restrictions'])[]) {
          if (
            !region.routing.supportedRestrictions[key].includes(
              input.restrictions[key],
            )
          )
            throw new AppError(
              400,
              'INVALID_INPUT',
              'Choose supported wheelchair restrictions.',
            );
        }
        const personal = effective.personalAvoidances.length > 0;
        const geometries = [
          ...effective.publicAvoidances.map((x) => x.publicAvoidGeometry),
          ...effective.personalAvoidances.map((x) => x.avoidGeometry),
        ];
        const merged = mergeAvoidances(geometries, region.bbox);
        if (
          merged &&
          (containsPosition(input.start, merged) ||
            containsPosition(input.end, merged))
        )
          throw new AppError(
            422,
            'ENDPOINT_BLOCKED',
            'Choose an entrance outside the blocked area.',
          );
        const key = digest({
          adapter: this.adapter.identity,
          regionId: region.id,
          input,
          scope: personal ? digest(sessionKey) : 'public',
          hazardVersion: region.hazardVersion,
          configVersion: region.configVersion,
          personalVersion: personal ? snapshot.personalVersion : 0,
          activeDigest: personal
            ? effective.context.activeDigest
            : effective.publicDigest,
        });
        const cached = CacheSchema.safeParse(
          await timed(this.repository.getCache(key)),
        );
        let selected: DirectionsResult & { computedAt: string };
        let cacheHit = false;
        try {
          if (
            cached.success &&
            Date.parse(cached.data.expiresAt) > this.now()
          ) {
            validateRouteGeometry(
              cached.data.geometry,
              input.start,
              input.end,
              region.bbox,
              merged ? [merged] : [],
            );
            selected = cached.data;
            cacheHit = true;
          } else {
            const existing = this.inFlight.get(key);
            if (existing) {
              selected = await timed(existing);
              cacheHit = true;
            } else {
              const request = this.gate.run({
                service: 'ors',
                keyFingerprint: this.adapter.keyFingerprint,
                policy: this.policy,
                deadlineAt,
                operation: async () => {
                  const output = await this.adapter.directions(input, merged);
                  if (
                    !Number.isFinite(output.distanceM) ||
                    output.distanceM < 0 ||
                    !Number.isFinite(output.durationS) ||
                    output.durationS < 0
                  )
                    throw new AppError(
                      502,
                      'INVALID_PROVIDER_RESULT',
                      'The route service returned an invalid result.',
                    );
                  validateRouteGeometry(
                    output.geometry,
                    input.start,
                    input.end,
                    region.bbox,
                    merged ? [merged] : [],
                  );
                  return {
                    ...output,
                    computedAt: new Date(this.now()).toISOString(),
                  };
                },
              });
              this.inFlight.set(key, request);
              cleanup = () => {
                if (this.inFlight.get(key) === request)
                  this.inFlight.delete(key);
              };
              selected = await timed(request);
            }
          }
        } catch (error) {
          if (
            recomputation > 0 &&
            error instanceof AppError &&
            ['RATE_LIMITED', 'QUOTA_EXHAUSTED', 'PROVIDER_TIMEOUT'].includes(
              error.code,
            )
          )
            throw stale();
          throw error;
        }
        const latest = evaluateContext(
          await timed(this.repository.readSnapshot(sessionKey)),
          this.now(),
        );
        if (!contextsMatch(effective.context, latest.context)) {
          if (recomputation === 0) continue;
          throw stale();
        }
        const expiresAt = new Date(
          Math.min(
            Date.parse(selected.computedAt) + 60000,
            latest.context.nextExpiryAt
              ? Date.parse(latest.context.nextExpiryAt)
              : Infinity,
          ),
        ).toISOString();
        if (Date.parse(expiresAt) <= this.now()) {
          if (recomputation === 0) continue;
          throw stale();
        }
        if (!cacheHit)
          await timed(
            this.repository.putCache(
              key,
              { ...selected, expiresAt },
              expiresAt,
            ),
          );
        else
          await timed(
            this.repository.recordUsage({
              service: 'ors',
              event: 'cacheHit',
              at: new Date(this.now()).toISOString(),
            }),
          );
        const routeRefExpiresAt = new Date(
          Math.min(
            this.now() + 900000,
            latest.context.nextExpiryAt
              ? Date.parse(latest.context.nextExpiryAt)
              : Infinity,
          ),
        ).toISOString();
        const ref = await timed(
          this.repository.publishRouteReference({
            sessionKey,
            regionId: region.id,
            geometry: selected.geometry,
            expiresAt: routeRefExpiresAt,
            context: {
              hazardVersion: latest.context.hazardVersion,
              personalVersion: latest.context.personalVersion,
              configVersion: latest.context.configVersion,
              activeDigest: latest.context.activeDigest,
            },
          }),
        );
        if (!ref) {
          if (recomputation === 0) continue;
          throw stale();
        }
        const personalExpiry = latest.personalAvoidances.map((x) =>
          Date.parse(x.validUntil),
        );
        return RouteResultSchema.parse({
          route: {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', geometry: selected.geometry, properties: {} },
            ],
          },
          distanceM: selected.distanceM,
          durationS: selected.durationS,
          hazardVersion: latest.context.hazardVersion,
          personalVersion: latest.context.personalVersion,
          configVersion: latest.context.configVersion,
          activeDigest: latest.context.activeDigest,
          routeRef: ref.id,
          routeRefExpiresAt: ref.expiresAt,
          routingScope: personal ? 'personal' : 'public',
          personalValidUntil: personalExpiry.length
            ? new Date(Math.min(...personalExpiry)).toISOString()
            : null,
          avoidedReportIds: [
            ...new Set(
              [...latest.publicAvoidances, ...latest.personalAvoidances].map(
                (x) => x.id,
              ),
            ),
          ].sort(),
          computedAt: selected.computedAt,
          source: 'ors',
          cacheHit,
          warnings: [
            ...(personal
              ? [
                  'This route includes your temporary avoidance, which is not publicly verified.',
                ]
              : []),
            'Some path information may be incomplete.',
          ],
        });
      } catch (error) {
        if (
          recomputation > 0 &&
          error instanceof AppError &&
          ['RATE_LIMITED', 'QUOTA_EXHAUSTED', 'PROVIDER_TIMEOUT'].includes(
            error.code,
          )
        )
          throw stale();
        throw error;
      } finally {
        cleanup?.();
      }
    }
    throw stale();
  }
}
function stale() {
  return new AppError(
    409,
    'ROUTE_STALE',
    'The routing context has changed. Please plan again.',
  );
}

/** Call the same function for preview and confirmation, using C's transaction-bound repository. */
export async function resolvePassage(
  repository: RoutingRepository,
  sessionKey: string,
  raw: PassageRef,
  location: Position,
  now = Date.now(),
): Promise<AvoidGeometry> {
  const parsed = PassageRefSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError(422, 'INVALID_PASSAGE', 'Choose a valid passage.');
  const ref = parsed.data;
  const region = await repository.getRegion();
  let line: LineString;
  if ('routeRef' in ref) {
    const route = await repository.getRouteReference(sessionKey, ref.routeRef);
    if (
      !route ||
      route.sessionKey !== sessionKey ||
      route.regionId !== region.id ||
      Date.parse(route.expiresAt) <= now ||
      route.context.configVersion !== region.configVersion ||
      ref.endIndex >= route.geometry.coordinates.length
    )
      throw new AppError(
        422,
        'INVALID_PASSAGE',
        'The selected route is no longer available.',
      );
    line = {
      type: 'LineString',
      coordinates: route.geometry.coordinates.slice(
        ref.startIndex,
        ref.endIndex + 1,
      ),
    };
  } else {
    const preset = (await repository.getPassages()).find(
      (p) =>
        p.id === ref.presetPassageId && p.passageVersion === ref.passageVersion,
    );
    if (!preset)
      throw new AppError(
        422,
        'INVALID_PASSAGE',
        'The selected passage has changed.',
      );
    line = preset.geometry;
  }
  try {
    validateReportPassage(location, line, region.bbox);
  } catch (error) {
    if (error instanceof AppError)
      throw new AppError(
        422,
        'INVALID_PASSAGE',
        'Choose a passage within 20 metres of the report.',
      );
    throw error;
  }
  return bufferPassage(line, region.avoidanceBufferM, region.bbox);
}
