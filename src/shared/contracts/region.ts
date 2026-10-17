import { z } from 'zod';
import { BBoxSchema, IdSchema, PositionSchema, VersionSchema } from './common';
import { LineStringSchema } from './geo';
import { RestrictionsSchema } from './routing';

export const InstantSchema = z.iso.datetime({ offset: true });
const NonnegativeInteger = z.number().int().nonnegative();
export const RegionSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  bbox: BBoxSchema,
  timezone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
  isDemo: z.boolean(),
  hazardVersion: NonnegativeInteger,
  configVersion: VersionSchema,
  personalValiditySec: z.number().int().positive(),
  publicValiditySec: z.number().int().positive(),
  avoidanceBufferM: z.number().min(0.5).max(5),
  routing: z.strictObject({
    profile: z.literal('wheelchair'),
    defaultRestrictions: RestrictionsSchema,
    supportedRestrictions: z.strictObject({
      maximum_incline: z.array(z.number().finite()).min(1),
      maximum_sloped_kerb: z.array(z.number().finite()).min(1),
      minimum_width: z.array(z.number().finite()).min(1),
    }),
  }),
});
export const PresetPassageSchema = z.strictObject({
  id: IdSchema,
  passageVersion: VersionSchema,
  name: z.string().trim().min(1).max(120),
  geometry: LineStringSchema,
  isDemo: z.boolean(),
});
export const PlaceSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  category: z.enum(['toilet', 'entrance', 'rest_area', 'other']),
  location: PositionSchema,
  accessibility: z.enum(['yes', 'limited', 'no', 'unknown']),
  accessibilityNote: z.string().nullable(),
  source: z.string().min(1),
  sourceId: z.string().min(1),
  fetchedAt: InstantSchema,
  isDemo: z.boolean(),
  rawAccessibility: z.strictObject({
    wheelchair: z.string().nullable(),
    toiletWheelchair: z.string().nullable(),
  }),
});
export const SearchResultSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  location: PositionSchema,
  source: z.string().min(1),
});
export const SearchQuerySchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/gu, ' '))
  .refine(
    (value) => Array.from(value).length >= 2 && Array.from(value).length <= 100,
  );
export const RoutingContextSchema = z.strictObject({
  regionId: IdSchema,
  hazardVersion: NonnegativeInteger,
  personalVersion: NonnegativeInteger,
  configVersion: VersionSchema,
  activeDigest: z.string().min(1),
  nextExpiryAt: InstantSchema.nullable(),
  evaluatedAt: InstantSchema,
});
export type RegionDTO = z.infer<typeof RegionSchema>;
export type PresetPassageDTO = z.infer<typeof PresetPassageSchema>;
export type PlaceDTO = z.infer<typeof PlaceSchema>;
export type SearchResultDTO = z.infer<typeof SearchResultSchema>;
export type RoutingContextDTO = z.infer<typeof RoutingContextSchema>;
