import { z } from 'zod';
import { hasMatchingOrigin } from '../../../server/http/origin';
import { AppError, errorResponse } from '../../../server/http/errors';
import { successResponse } from '../../../server/http/responses';
import {
  BBoxSchema,
  PlaceSchema,
  PlacesResultSchema,
  type PlacesResultDTO,
  PresetPassageSchema,
  RegionSchema,
} from '../../../shared/contracts';
import type { RoutingRepository } from './repository';
import type { RoutingService } from './service';
import type { SearchService } from '../../places/server/search';
import { pointInBbox, bufferPassage } from './geometry';
import { normalizeAccessibility } from '../../places/server/accessibility';

type Dependencies = {
  repository: RoutingRepository;
  routes: RoutingService;
  search: SearchService;
  places?: { getPlaces(bbox: import('../../../shared/contracts').BBox): Promise<PlacesResultDTO> };
  applicationOrigin: string;
  now?: () => number;
  requireProvider?: (name: 'ors' | 'geocoding') => void;
};
function parameters(request: Request, allowed: string[] = []): URLSearchParams {
  const params = new URL(request.url).searchParams;
  if (
    [...params.keys()].some(
      (key) => !allowed.includes(key) || params.getAll(key).length !== 1,
    )
  )
    throw new AppError(400, 'INVALID_INPUT', 'Check the request parameters.');
  return params;
}
async function body(request: Request): Promise<unknown> {
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  )
    throw new AppError(400, 'INVALID_INPUT', 'Send a JSON request body.');
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError(400, 'INVALID_INPUT', 'Send a JSON request body.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new AppError(
          400,
          'INVALID_INPUT',
          'The request body is too large.',
        );
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_INPUT', 'Send a valid JSON request body.');
  }
}
export function createRoutingHandlers(deps: Dependencies) {
  const { repository, routes, search, applicationOrigin } = deps;
  const protect =
    (handler: (request: Request) => Promise<unknown>) =>
    async (request: Request) => {
      try {
        return successResponse(await handler(request));
      } catch (error) {
        return errorResponse(error);
      }
    };
  const session = async (request: Request) => {
    const key = await repository.resolveSession(request);
    if (!key)
      throw new AppError(
        401,
        'UNAUTHENTICATED',
        'Start a session before planning a route.',
      );
    return key;
  };
  return {
    region: protect(async (request) => {
      parameters(request);
      return RegionSchema.parse(await repository.getRegion());
    }),
    passages: protect(async (request) => {
      parameters(request);
      const region = RegionSchema.parse(await repository.getRegion());
      const items = z
        .array(PresetPassageSchema)
        .parse(await repository.getPassages());
      for (const p of items)
        bufferPassage(p.geometry, region.avoidanceBufferM, region.bbox);
      const latest = await repository.getRegion();
      if (region.configVersion !== latest.configVersion)
        throw new AppError(
          409,
          'ROUTE_STALE',
          'The passages have changed. Please reload.',
        );
      return {
        configVersion: region.configVersion,
        items: items.map((item) => ({ ...item, isDemo: region.isDemo })),
      };
    }),
    places: protect(async (request) => {
      const params = parameters(request, ['bbox']);
      const raw = params.get('bbox')?.split(',');
      const parsed =
        raw?.length === 4 && raw.every((s) => s.trim().length > 0)
          ? BBoxSchema.safeParse(raw.map(Number))
          : null;
      if (!parsed?.success)
        throw new AppError(
          400,
          'INVALID_INPUT',
          'Choose a valid bounding box.',
        );
      const bbox = parsed.data;
      const region = RegionSchema.parse(await repository.getRegion());
      if (
        !pointInBbox([bbox[0], bbox[1]], region.bbox) ||
        !pointInBbox([bbox[2], bbox[3]], region.bbox)
      )
        throw new AppError(
          422,
          'OUT_OF_COVERAGE',
          'Choose an area inside the supported region.',
        );
      const source = deps.places
        ? await deps.places.getPlaces(bbox)
        : { items: await repository.getPlaces(bbox), truncated: false };
      const places = z.array(PlaceSchema).parse(source.items);
      const items = places.filter((item) => pointInBbox(item.location, bbox));
      const latest = await repository.getRegion();
      if (latest.configVersion !== region.configVersion)
        throw new AppError(
          409,
          'ROUTE_STALE',
          'The supported area has changed. Please reload.',
        );
      return {
        items: items
          .slice(0, 100)
          .map((item) => ({
            ...item,
            accessibility: item.source === 'accessibility.cloud' ? item.accessibility : normalizeAccessibility(
              item.category,
              item.rawAccessibility,
            ),
          })),
        truncated: source.truncated || items.length > 100,
        ...('sources' in source ? { sources: PlacesResultSchema.parse({ ...source, items: source.items.slice(0, 100) }).sources } : {}),
      };
    }),
    context: protect(async (request) => {
      parameters(request);
      return routes.context(await session(request));
    }),
    routes: protect(async (request) => {
      parameters(request);
      if (!hasMatchingOrigin(request, applicationOrigin))
        throw new AppError(403, 'FORBIDDEN', 'This request is not permitted.');
      const key = await session(request);
      const input = await body(request);
      deps.requireProvider?.('ors');
      return routes.route(key, input);
    }),
    search: protect(async (request) => {
      const params = parameters(request, ['q']);
      const query = params.get('q');
      if (query === null)
        throw new AppError(400, 'INVALID_INPUT', 'Enter a search query.');
      deps.requireProvider?.('geocoding');
      return search.search(query);
    }),
  };
}
export function methodNotAllowed(allowed: string): Response {
  const response = errorResponse(
    new AppError(405, 'INVALID_INPUT', 'This method is not supported.'),
  );
  response.headers.set('Allow', allowed);
  return response;
}
