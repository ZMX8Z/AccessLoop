import { z } from 'zod';
import { BBoxSchema, PositionSchema, RestrictionsSchema } from '@/shared/contracts';
// Consumer validators implement API_CONTRACTS §§4,6,9 until C/D publish full DTO schemas.
const instant = z.iso.datetime();
const version = z.number().int().nonnegative();
export const lineSchema = z.strictObject({ type: z.literal('LineString'), coordinates: z.array(PositionSchema).min(2) });
export const geometrySchema = z.union([
  z.strictObject({ type: z.literal('Polygon'), coordinates: z.array(z.array(PositionSchema)) }),
  z.strictObject({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(PositionSchema))) }),
]);
export const regionSchema = z.strictObject({
  id: z.string(), name: z.string(), bbox: BBoxSchema, timezone: z.string(), isDemo: z.boolean(),
  hazardVersion: version, configVersion: version, personalValiditySec: z.number(), publicValiditySec: z.number(), avoidanceBufferM: z.number(),
  routing: z.strictObject({ profile: z.literal('wheelchair'), defaultRestrictions: RestrictionsSchema,
    supportedRestrictions: z.strictObject({ maximum_incline: z.array(z.number()).min(1), maximum_sloped_kerb: z.array(z.number()).min(1), minimum_width: z.array(z.number()).min(1) }) }),
});
export const contextSchema = z.strictObject({ regionId: z.string(), hazardVersion: version, personalVersion: version, configVersion: version, activeDigest: z.string(), nextExpiryAt: instant.nullable(), evaluatedAt: instant });
export const placeSchema = z.strictObject({ id: z.string(), name: z.string(), category: z.enum(['toilet','entrance','rest_area','other']), location: PositionSchema,
  accessibility: z.enum(['yes','limited','no','unknown']), accessibilityNote: z.string().nullable(), source: z.string(), sourceId: z.string(), fetchedAt: instant, isDemo: z.boolean(),
  rawAccessibility: z.strictObject({ wheelchair: z.string().nullable(), toiletWheelchair: z.string().nullable() }) });
export const passageSchema = z.strictObject({ id: z.string(), passageVersion: version, name: z.string(), geometry: lineSchema, isDemo: z.boolean() });
export const searchSchema = z.strictObject({ query: z.string(), items: z.array(z.strictObject({ id: z.string(), name: z.string(), location: PositionSchema, source: z.string() })).max(5) });
const verification = z.strictObject({ source: z.enum(['admin_field_check','trusted_maintainer']), verifiedAt: instant, validUntil: instant, resolvedAt: instant.nullable() });
export const publicReportSchema = z.strictObject({ id: z.string(), regionId: z.string(), publicRevision: version, status: z.enum(['verified','resolved','rejected']), location: PositionSchema,
  category: z.enum(['construction','steps_or_kerb','surface_damage','obstruction','other']), description: z.string(), observedAt: instant, publicAvoidGeometry: geometrySchema,
  publicVerification: verification, publicActivity: z.enum(['active','expired','inactive']), isDemo: z.boolean() });
// Only the author layer projection is retained, never photos, AI evidence or admin details.
export const mineSchema = z.object({ id: z.string(), location: PositionSchema, description: z.string(), status: z.enum(['pending','ai_assessed','verified','resolved','rejected']),
  personalAvoidance: z.object({ effective: z.boolean(), validUntil: instant, avoidGeometry: geometrySchema }).nullable() });
export const routeSchema = z.strictObject({ route: z.strictObject({ type: z.literal('FeatureCollection'), features: z.tuple([z.strictObject({ type: z.literal('Feature'), geometry: lineSchema, properties: z.record(z.string(), z.never()) })]) }),
  distanceM: z.number().finite().nonnegative(), durationS: z.number().finite().nonnegative(), hazardVersion: version, personalVersion: version, configVersion: version, activeDigest: z.string(),
  routeRef: z.string(), routeRefExpiresAt: instant, routingScope: z.enum(['public','personal']), personalValidUntil: instant.nullable(), avoidedReportIds: z.array(z.string()), computedAt: instant, source: z.literal('ors'), cacheHit: z.boolean(), warnings: z.array(z.string()) });
export type Region = z.infer<typeof regionSchema>;
export type Context = z.infer<typeof contextSchema>;
export type Place = z.infer<typeof placeSchema>;
export type Passage = z.infer<typeof passageSchema>;
export type PublicReport = z.infer<typeof publicReportSchema>;
export type Mine = z.infer<typeof mineSchema>;
export type Route = z.infer<typeof routeSchema>;
export type AvoidGeometry = z.infer<typeof geometrySchema>;
export type SearchResult = z.infer<typeof searchSchema>['items'][number];
