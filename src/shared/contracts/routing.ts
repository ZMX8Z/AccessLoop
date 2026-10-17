import { z } from 'zod';

import { IdSchema, PositionSchema, VersionSchema } from './common';

const RoutePassageRefSchema = z
  .strictObject({
    routeRef: IdSchema,
    startIndex: z.number().int().min(0),
    endIndex: z.number().int().min(0),
  })
  .refine(({ startIndex, endIndex }) => startIndex < endIndex, {
    message: 'The end index must be greater than the start index.',
    path: ['endIndex'],
  });

const PresetPassageRefSchema = z.strictObject({
  presetPassageId: IdSchema,
  passageVersion: VersionSchema,
});

export const PassageRefSchema = z.union([RoutePassageRefSchema, PresetPassageRefSchema]);

// Region whitelist membership and route/session ownership need runtime data.
// These schemas validate structure only; D must enforce those checks later.
export const RestrictionsSchema = z.strictObject({
  maximum_incline: z.number().finite(),
  maximum_sloped_kerb: z.number().finite(),
  minimum_width: z.number().finite(),
});

export const RouteInputSchema = z.strictObject({
  start: PositionSchema,
  end: PositionSchema,
  profile: z.literal('wheelchair'),
  restrictions: RestrictionsSchema,
});

export type PassageRef = z.infer<typeof PassageRefSchema>;
export type Restrictions = z.infer<typeof RestrictionsSchema>;
export type RouteInput = z.infer<typeof RouteInputSchema>;
