import { z } from 'zod';

// These are the minimal executable contracts from docs/authority/API_CONTRACTS.md.
export const IdSchema = z.string().min(1);
export const VersionSchema = z.number().int().min(1);

const LongitudeSchema = z.number().finite().min(-180).max(180);
const LatitudeSchema = z.number().finite().min(-90).max(90);

export const PositionSchema = z.tuple([LongitudeSchema, LatitudeSchema]);

export const BBoxSchema = z
  .tuple([LongitudeSchema, LatitudeSchema, LongitudeSchema, LatitudeSchema])
  .refine(([west, , east]) => west < east, {
    message: 'West must be less than east.',
    path: [2],
  })
  .refine(([, south, , north]) => south < north, {
    message: 'South must be less than north.',
    path: [3],
  });

export const HealthDataSchema = z.strictObject({ status: z.literal('ok') });
export const HealthResponseSchema = z.strictObject({
  data: HealthDataSchema,
  requestId: IdSchema,
});

export type Id = z.infer<typeof IdSchema>;
export type Version = z.infer<typeof VersionSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type BBox = z.infer<typeof BBoxSchema>;
export type HealthData = z.infer<typeof HealthDataSchema>;
export type SuccessEnvelope<T> = { data: T; requestId: string };
