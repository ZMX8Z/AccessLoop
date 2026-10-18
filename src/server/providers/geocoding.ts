import { createHash } from 'node:crypto';
import { z } from 'zod';

import { AppError } from '../http/errors';
import { BBoxSchema, PositionSchema, type BBox, type Position } from '../../shared/contracts/common';
import { createProviderTransport, invalidProviderResult, type ProviderOptions } from './provider-error';

const GEOCODING_BASE = 'https://api.heigit.org/pelias/v1';
// HeiGIT hosted Pelias supports these sources; upstream Pelias can also host others.
const SOURCES = ['openstreetmap', 'whosonfirst', 'geonames'];
const SearchResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  geocoding: z.object({ errors: z.array(z.unknown()).max(0).optional() }).optional(),
  features: z.array(z.object({
    type: z.literal('Feature'),
    geometry: z.object({ type: z.literal('Point'), coordinates: PositionSchema }),
    properties: z.object({
      gid: z.string().trim().min(1).max(1000), source: z.string().trim().min(1).max(100),
      layer: z.string().trim().min(1).max(100), source_id: z.union([z.string().max(1000), z.number().finite()]).optional(),
      name: z.string().trim().min(1).max(1000), label: z.string().trim().min(1).max(2000).optional(),
    }),
  })).max(100),
});

export type SearchResult = { id: string; name: string; location: Position; source: string };

export function createGeocodingAdapter(options: ProviderOptions) {
  const transport = createProviderTransport(options, GEOCODING_BASE, 'geocoding');
  return {
    identity: `heigit-pelias:search-v1:${transport.baseUrl}`,
    keyFingerprint: transport.keyFingerprint,
    async search(query: string, bbox: BBox): Promise<SearchResult[]> {
      const normalizedQuery = typeof query === 'string' ? query.trim().replace(/\s+/gu, ' ') : '';
      if (Array.from(normalizedQuery).length < 2 || Array.from(normalizedQuery).length > 100 || !BBoxSchema.safeParse(bbox).success) {
        throw new AppError(400, 'INVALID_INPUT', 'Enter a search query between 2 and 100 characters within a valid region.');
      }
      const [west, south, east, north] = bbox;
      const parameters = new URLSearchParams({
        text: normalizedQuery, size: '5', sources: SOURCES.join(','),
        'boundary.rect.min_lon': String(west), 'boundary.rect.min_lat': String(south),
        'boundary.rect.max_lon': String(east), 'boundary.rect.max_lat': String(north),
      });
      const response = await transport.request(`/search?${parameters}`, { method: 'GET', headers: { Accept: 'application/geo+json, application/json' } });
      const parsed = SearchResponseSchema.safeParse(response);
      if (!parsed.success) throw invalidProviderResult();
      const results: SearchResult[] = [];
      const seen = new Set<string>();
      for (const feature of parsed.data.features) {
        const [lon, lat] = feature.geometry.coordinates;
        const properties = feature.properties;
        if (!SOURCES.includes(properties.source) || lon < west || lon > east || lat < south || lat > north) continue;
        const id = `search-${createHash('sha256').update(JSON.stringify([
          properties.source, properties.layer, properties.source_id === undefined ? properties.gid : String(properties.source_id),
        ])).digest('hex')}`;
        if (seen.has(id)) continue;
        seen.add(id);
        results.push({ id, name: Array.from(properties.label ?? properties.name).slice(0, 120).join(''), location: feature.geometry.coordinates, source: properties.source });
        if (results.length === 5) break;
      }
      return results;
    },
  };
}
