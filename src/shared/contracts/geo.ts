import { z } from 'zod';
import { PositionSchema } from './common';

export const LineStringSchema = z.strictObject({
  type: z.literal('LineString'),
  coordinates: z.array(PositionSchema).min(2).max(10000),
});
const RingSchema = z.array(PositionSchema).min(4).max(201);
export const AvoidGeometrySchema = z.union([
  z.strictObject({
    type: z.literal('Polygon'),
    coordinates: z.array(RingSchema).min(1).max(20),
  }),
  z.strictObject({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(RingSchema).min(1).max(20)).min(1).max(20),
  }),
]);
export type LineString = z.infer<typeof LineStringSchema>;
export type AvoidGeometry = z.infer<typeof AvoidGeometrySchema>;
