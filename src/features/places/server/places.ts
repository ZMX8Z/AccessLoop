import { z } from 'zod';

import { AppError } from '../../../server/http/errors';
import { ProviderGate } from '../../../server/providers/gate';
import { invalidProviderResult } from '../../../server/providers/provider-error';
import { BBoxSchema, PlaceSchema, RegionSchema, type BBox, type PlaceDTO, type RegionDTO } from '../../../shared/contracts';
import { digest } from '../../routing/server/context';
import { pointInBbox } from '../../routing/server/geometry';
import type { RoutingRepository } from '../../routing/server/repository';

export type PoiPlaces = { items: PlaceDTO[]; truncated: boolean };
export type PoiAdapter = {
  identity: string;
  keyFingerprint: string;
  fetchPlaces(bbox: BBox, isDemo: boolean): Promise<PoiPlaces>;
};
const PlacesSchema = z.array(PlaceSchema).max(101);
const SourceSchema = z.strictObject({ items: PlacesSchema, truncated: z.boolean() });
const CacheSchema = SourceSchema.extend({ expiresAt: z.iso.datetime() });
const CACHE_LIFETIME_MS = 86_400_000;

export class PlacesService {
  private readonly inFlight = new Map<string, Promise<PoiPlaces>>();
  private readonly now: () => number;
  private readonly gate: ProviderGate;
  private readonly policy: { minuteLimit: number; dayLimit: number };

  constructor(
    private readonly repository: RoutingRepository,
    private readonly adapter: PoiAdapter,
    options: { now?: () => number; policy?: { minuteLimit: number; dayLimit: number } } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.gate = new ProviderGate(repository, { now: this.now });
    this.policy = options.policy ?? { minuteLimit: 30, dayLimit: 450 };
  }

  private async requireCurrentRegion(region: RegionDTO): Promise<void> {
    const current = RegionSchema.parse(await this.repository.getRegion());
    if (current.id !== region.id || current.configVersion !== region.configVersion
      || current.isDemo !== region.isDemo || digest(current.bbox) !== digest(region.bbox)) {
      throw new AppError(409, 'ROUTE_STALE', 'The place search area has changed. Reload the area before trying again.');
    }
  }

  async getPlaces(rawBBox: BBox): Promise<{ items: PlaceDTO[]; truncated: boolean }> {
    const parsed = BBoxSchema.safeParse(rawBBox);
    if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', 'Choose a valid place search area.');
    const bbox = parsed.data;
    const region = RegionSchema.parse(await this.repository.getRegion());
    if (!pointInBbox([bbox[0], bbox[1]], region.bbox) || !pointInBbox([bbox[2], bbox[3]], region.bbox)) {
      throw new AppError(422, 'OUT_OF_COVERAGE', 'Choose a place search area within the supported region.');
    }
    const key = digest({
      service: 'places-v2', adapter: this.adapter.identity, regionId: region.id,
      bbox: region.bbox, configVersion: region.configVersion,
    });
    const cached = CacheSchema.safeParse(await this.repository.getCache(key));
    let source: PoiPlaces;
    let hit = false;
    if (cached.success && Date.parse(cached.data.expiresAt) > this.now()) {
      source = { items: cached.data.items, truncated: cached.data.truncated };
      hit = true;
    } else {
      let pending = this.inFlight.get(key);
      if (pending) hit = true;
      else {
        pending = (async () => {
          const result = await this.gate.run({
            service: 'poi', keyFingerprint: this.adapter.keyFingerprint, policy: this.policy,
            operation: async () => {
              const places = SourceSchema.safeParse(await this.adapter.fetchPlaces(region.bbox, region.isDemo));
              if (!places.success || places.data.items.some((item) => item.source !== 'openstreetmap' || item.isDemo !== region.isDemo)) {
                throw invalidProviderResult();
              }
              return { ...places.data, items: places.data.items.filter((item) => pointInBbox(item.location, region.bbox)) };
            },
          });
          await this.requireCurrentRegion(region);
          const expiresAt = new Date(this.now() + CACHE_LIFETIME_MS).toISOString();
          await this.repository.putCache(key, { ...result, expiresAt }, expiresAt);
          return result;
        })();
        this.inFlight.set(key, pending);
        const request = pending;
        // Keep the same promise through cache persistence, including its failure.
        void request.finally(() => {
          if (this.inFlight.get(key) === request) this.inFlight.delete(key);
        }).catch(() => {});
      }
      source = await pending;
    }
    if (hit) await this.repository.recordUsage({ service: 'poi', event: 'cacheHit', at: new Date(this.now()).toISOString() });
    await this.requireCurrentRegion(region);
    const visible = source.items.filter((item) => pointInBbox(item.location, bbox));
    return { items: visible.slice(0, 100), truncated: source.truncated || visible.length > 100 };
  }
}
