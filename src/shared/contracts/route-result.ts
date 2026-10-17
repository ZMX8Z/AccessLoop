import { z } from 'zod';
import { IdSchema, VersionSchema } from './common';
import { LineStringSchema } from './geo';
import { InstantSchema } from './region';

export const RouteResultSchema = z.strictObject({
  route: z.strictObject({
    type: z.literal('FeatureCollection'),
    features: z.tuple([
      z.strictObject({
        type: z.literal('Feature'),
        geometry: LineStringSchema,
        properties: z.strictObject({}),
      }),
    ]),
  }),
  distanceM: z.number().finite().nonnegative(),
  durationS: z.number().finite().nonnegative(),
  hazardVersion: z.number().int().nonnegative(),
  personalVersion: z.number().int().nonnegative(),
  configVersion: VersionSchema,
  activeDigest: z.string().min(1),
  routeRef: IdSchema,
  routeRefExpiresAt: InstantSchema,
  routingScope: z.enum(['public', 'personal']),
  personalValidUntil: InstantSchema.nullable(),
  avoidedReportIds: z.array(IdSchema),
  computedAt: InstantSchema,
  source: z.literal('ors'),
  cacheHit: z.boolean(),
  warnings: z.array(z.string()),
});
const CountsSchema = z.strictObject({
  calls: z.number().int().nonnegative(),
  waits: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
});
export const UsageSummarySchema = z.strictObject({
  windowStart: InstantSchema,
  windowEnd: InstantSchema,
  services: z.strictObject({ ors: CountsSchema, vision: CountsSchema }),
});
export type RouteDTO = z.infer<typeof RouteResultSchema>;
export type UsageSummaryDTO = z.infer<typeof UsageSummarySchema>;
