import { z } from 'zod';
import {
  AvoidGeometrySchema, LineStringSchema, PlaceSchema,
  PresetPassageSchema, RegionSchema, RouteResultSchema, RoutingContextSchema,
  SearchQuerySchema, SearchResultSchema, PublicReportDTOSchema, PrivateReportDTOSchema,
} from '@/shared/contracts';
// D-owned responses use the same executable contract on both sides of the API.
export const lineSchema = LineStringSchema;
export const geometrySchema = AvoidGeometrySchema;
export const regionSchema = RegionSchema;
export const contextSchema = RoutingContextSchema;
export const placeSchema = PlaceSchema;
export const passageSchema = PresetPassageSchema;
export const searchSchema = z.strictObject({ query: SearchQuerySchema, items: z.array(SearchResultSchema).max(5) });
// Validate C's complete response, then retain only the author map layer projection.
export const publicReportSchema = PublicReportDTOSchema;
export const mineSchema = PrivateReportDTOSchema.transform(({ id, location, description, status, personalAvoidance }) => ({
  id, location, description, status,
  personalAvoidance: personalAvoidance ? {
    effective: personalAvoidance.effective, validUntil: personalAvoidance.validUntil, avoidGeometry: personalAvoidance.avoidGeometry,
  } : null,
}));
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
