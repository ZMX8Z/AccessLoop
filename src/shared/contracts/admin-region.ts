import { z } from 'zod'

import { IdSchema, VersionSchema } from './common'
import { LineStringSchema } from './geo'
import { PresetPassageSchema, RegionSchema } from './region'

const ReasonSchema = z.string().trim().refine((value) => {
  const length = Array.from(value).length
  return length >= 1 && length <= 1000
}, 'A reason of 1 to 1000 characters is required.')

export const RegionPatchInputSchema = z.strictObject({
  expectedVersion: VersionSchema,
  reason: ReasonSchema,
  changes: z.strictObject({
    name: RegionSchema.shape.name.optional(),
    timezone: RegionSchema.shape.timezone.optional(),
    bbox: RegionSchema.shape.bbox.optional(),
    isDemo: z.boolean().optional(),
    avoidanceBufferM: RegionSchema.shape.avoidanceBufferM.optional(),
    presetPassages: z.array(z.strictObject({
      id: IdSchema.optional(), name: PresetPassageSchema.shape.name, geometry: LineStringSchema,
    })).optional(),
  }).refine((value) => Object.keys(value).length > 0, 'Provide at least one configuration change.'),
})

export const RegionAdminDTOSchema = z.strictObject({
  region: RegionSchema,
  presetPassages: z.array(PresetPassageSchema),
})

export type RegionPatchInput = z.infer<typeof RegionPatchInputSchema>
export type RegionAdminDTO = z.infer<typeof RegionAdminDTOSchema>
