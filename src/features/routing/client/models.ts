import { z } from 'zod';
import {
  PositionSchema, AvoidGeometrySchema, InstantSchema, LineStringSchema, PlaceSchema,
  PresetPassageSchema, RegionSchema, RouteResultSchema, RoutingContextSchema,
  SearchQuerySchema, SearchResultSchema, VersionSchema,
} from '@/shared/contracts';
// D-owned responses use the same executable contract on both sides of the API.
export const lineSchema = LineStringSchema;
export const geometrySchema = AvoidGeometrySchema;
export const regionSchema = RegionSchema;
export const contextSchema = RoutingContextSchema;
export const placeSchema = PlaceSchema;
export const passageSchema = PresetPassageSchema;
export const searchSchema = z.strictObject({ query: SearchQuerySchema, items: z.array(SearchResultSchema).max(5) });
const instant = InstantSchema;
const version = VersionSchema;
// C has not published full report schemas yet; retain only these client projections.
const verification = z.strictObject({ source: z.enum(['admin_field_check','trusted_maintainer']), verifiedAt: instant, validUntil: instant, resolvedAt: instant.nullable() });
export const publicReportSchema = z.strictObject({ id: z.string(), regionId: z.string(), publicRevision: version, status: z.enum(['verified','resolved','rejected']), location: PositionSchema,
  category: z.enum(['construction','steps_or_kerb','surface_damage','obstruction','other']), description: z.string(), observedAt: instant, publicAvoidGeometry: geometrySchema,
  publicVerification: verification, publicActivity: z.enum(['active','expired','inactive']), isDemo: z.boolean() });
// Only the author layer projection is retained, never photos, AI evidence or admin details.
export const mineSchema = z.object({ id: z.string(), location: PositionSchema, description: z.string(), status: z.enum(['pending','ai_assessed','verified','resolved','rejected']),
  personalAvoidance: z.object({ effective: z.boolean(), validUntil: instant, avoidGeometry: geometrySchema }).nullable() });
export const routeSchema = RouteResultSchema;
export type Region = z.infer<typeof regionSchema>;
export type Context = z.infer<typeof contextSchema>;
export type Place = z.infer<typeof placeSchema>;
export type Passage = z.infer<typeof passageSchema>;
export type PublicReport = z.infer<typeof publicReportSchema>;
export type Mine = z.infer<typeof mineSchema>;
export type Route = z.infer<typeof routeSchema>;
export type AvoidGeometry = z.infer<typeof geometrySchema>;
export type SearchResult = z.infer<typeof searchSchema>['items'][number];
