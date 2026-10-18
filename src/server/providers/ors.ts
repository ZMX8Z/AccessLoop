import { z } from 'zod';

import { AppError } from '../http/errors';
import { AvoidGeometrySchema, LineStringSchema, type AvoidGeometry, type LineString } from '../../shared/contracts/geo';
import { RouteInputSchema, type RouteInput } from '../../shared/contracts/routing';
import { createProviderTransport, invalidProviderResult, type ProviderOptions } from './provider-error';

const ORS_BASE = 'https://api.heigit.org/openrouteservice';
const ResultSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.object({
    type: z.literal('Feature'),
    geometry: LineStringSchema,
    properties: z.object({ summary: z.object({ distance: z.number().finite().nonnegative(), duration: z.number().finite().nonnegative() }) }),
  })).length(1),
});

export function createOrsAdapter(options: ProviderOptions) {
  const transport = createProviderTransport(options, ORS_BASE, 'ors');
  return {
    identity: `ors:geojson-v1:${transport.baseUrl}`,
    keyFingerprint: transport.keyFingerprint,
    async directions(input: RouteInput, avoidance?: AvoidGeometry): Promise<{ geometry: LineString; distanceM: number; durationS: number }> {
      const parsedInput = RouteInputSchema.safeParse(input);
      const parsedAvoidance = avoidance === undefined ? undefined : AvoidGeometrySchema.safeParse(avoidance);
      if (!parsedInput.success || (parsedAvoidance && !parsedAvoidance.success)) {
        throw new AppError(400, 'INVALID_INPUT', 'The route parameters are invalid.');
      }
      const { start, end, restrictions } = parsedInput.data;
      const response = await transport.request('/v2/directions/wheelchair/geojson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json' },
        body: JSON.stringify({
          coordinates: [start, end], instructions: false, elevation: false, units: 'm',
          options: {
            profile_params: { restrictions },
            ...(parsedAvoidance?.success ? { avoid_polygons: parsedAvoidance.data } : {}),
          },
        }),
      });
      const parsed = ResultSchema.safeParse(response);
      if (!parsed.success) throw invalidProviderResult();
      const feature = parsed.data.features[0];
      return { geometry: feature.geometry, distanceM: feature.properties.summary.distance, durationS: feature.properties.summary.duration };
    },
  };
}
