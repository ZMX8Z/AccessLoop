import { z } from 'zod';

import { normalizeAccessibility } from '../../features/places/server/accessibility';
import { pointInBbox } from '../../features/routing/server/geometry';
import { BBoxSchema, PositionSchema, type BBox } from '../../shared/contracts/common';
import { PlaceSchema, type PlaceDTO } from '../../shared/contracts/region';
import { AppError } from '../http/errors';
import { createProviderTransport, invalidProviderResult, type ProviderOptions } from './provider-error';

const POI_BASE = 'https://api.heigit.org/openpoiservice/v0';
const MAX_RESPONSE_BYTES = 1_048_576;
const OSM_TYPES = { 1: 'node', 2: 'way', 3: 'relation' } as const;
const CategorySchema = z.object({ category_name: z.string().trim().min(1).max(120) });
// Official source: GIScience/openpoiservice server/api/query_builder.py.
const PoiResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.object({
    type: z.literal('Feature'),
    geometry: z.object({ type: z.literal('Point'), coordinates: PositionSchema }),
    properties: z.object({
      osm_id: z.number().int().positive().safe(),
      osm_type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      category_ids: z.record(z.string().regex(/^\d{1,6}$/), CategorySchema)
        .refine((categories) => Object.keys(categories).length <= 100),
      osm_tags: z.object({
        name: z.string().trim().max(2000).optional(),
        wheelchair: z.string().max(100).optional(),
        'toilets:wheelchair': z.string().max(100).optional(),
      }).optional(),
    }),
  })).max(102),
});

function category(names: string[]): PlaceDTO['category'] {
  if (names.includes('toilets')) return 'toilet';
  if (names.some((name) => ['entrance', 'parking_entrance'].includes(name))) return 'entrance';
  if (names.some((name) => ['bench', 'shelter', 'picnic_site', 'picnic_table', 'rest_area'].includes(name))) return 'rest_area';
  return 'other';
}

/** Keep the shared transport's timeout/error policy while bounding decoded JSON bytes. */
function boundedResponse(response: Response): Response {
  if (!response.body || response.redirected || (response.status >= 300 && response.status < 400)) return response;
  const reader = response.body.getReader();
  let bytes = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const declared = response.headers.get('Content-Length');
        if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          controller.error(new SyntaxError('The provider response exceeds the allowed size.'));
          return;
        }
        const chunk = await reader.read();
        if (chunk.done) { controller.close(); return; }
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          controller.error(new SyntaxError('The provider response exceeds the allowed size.'));
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) { controller.error(error); }
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export function createPoiAdapter(options: ProviderOptions & { now?: () => number }) {
  const fetcher = options.fetch ?? fetch;
  // HeiGIT POI uses the same HTTP auth/quota semantics as its geocoding service.
  const transport = createProviderTransport({
    ...options, fetch: async (url, init) => boundedResponse(await fetcher(url, init)),
  }, POI_BASE, 'geocoding');
  const now = options.now ?? Date.now;
  return {
    identity: `heigit-openpoiservice:osm-places-v1:${transport.baseUrl}`,
    keyFingerprint: transport.keyFingerprint,
    timeoutMs: options.timeoutMs ?? 6000,
    async fetchPlaces(bbox: BBox, isDemo: boolean): Promise<{ items: PlaceDTO[]; truncated: boolean }> {
      if (!BBoxSchema.safeParse(bbox).success || typeof isDemo !== 'boolean') {
        throw new AppError(400, 'INVALID_INPUT', 'Choose a valid place search area.');
      }
      const [west, south, east, north] = bbox;
      const response = await transport.request('/pois', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json, application/json' },
        // Current upstream versions return limit - 1. 102 gives bounded lookahead
        // on both versions; retain at most 101 so callers can return 100 honestly.
        body: JSON.stringify({ request: 'pois', geometry: { bbox: [[west, south], [east, north]] }, limit: 102 }),
      });
      const parsed = PoiResponseSchema.safeParse(response);
      if (!parsed.success) throw invalidProviderResult();
      const fetchedAt = new Date(now()).toISOString();
      const items: PlaceDTO[] = [];
      const seen = new Set<string>();
      for (const feature of parsed.data.features) {
        if (!pointInBbox(feature.geometry.coordinates, bbox)) continue;
        const properties = feature.properties;
        const sourceId = `${OSM_TYPES[properties.osm_type]}/${properties.osm_id}`;
        if (seen.has(sourceId)) continue;
        seen.add(sourceId);
        const names = Object.values(properties.category_ids).map((entry) => entry.category_name);
        const mappedCategory = category(names);
        const tags = properties.osm_tags;
        const rawAccessibility = {
          wheelchair: tags?.wheelchair ?? null, toiletWheelchair: tags?.['toilets:wheelchair'] ?? null,
        };
        items.push(PlaceSchema.parse({
          id: `osm-${OSM_TYPES[properties.osm_type]}-${properties.osm_id}`,
          name: Array.from(tags?.name || `OpenStreetMap ${names[0] ?? 'point'} (${sourceId})`).slice(0, 120).join(''),
          category: mappedCategory, location: feature.geometry.coordinates,
          accessibility: normalizeAccessibility(mappedCategory, rawAccessibility), accessibilityNote: null,
          source: 'openstreetmap', sourceId, fetchedAt, isDemo, rawAccessibility,
        }));
        if (items.length === 101) break;
      }
      // The raw source boundary survives spatial filtering and OSM deduplication.
      // A capped response cannot establish that the remaining region is complete.
      return { items, truncated: parsed.data.features.length >= 101 };
    },
  };
}
