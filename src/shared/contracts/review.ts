import { z } from 'zod'

import { IdSchema, PositionSchema, VersionSchema } from './common'
import { AvoidGeometrySchema } from './geo'
import { ReportCategorySchema } from './hazards'
import { InstantSchema } from './region'

const text = (maximum: number) => z.string().trim().refine((value) => {
  const length = Array.from(value).length
  return length >= 1 && length <= maximum
}, `Provide 1 to ${maximum} characters.`)
const instant = InstantSchema.transform((value) => new Date(value).toISOString())

export const MaintainerReferenceSchema = text(500).refine((value) => {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return true
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password }
  catch { return false }
}, 'Use a record identifier or an HTTPS reference without embedded credentials.')

export const ReviewActorSchema = z.strictObject({ id: IdSchema, role: z.enum(['operator', 'report_admin']) })
export const ExtraEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('field_observation'), observedAt: instant, summary: text(1000), photoId: IdSchema.optional() }),
  z.strictObject({ kind: z.literal('trusted_maintainer'), observedAt: instant, summary: text(1000), sourceReference: MaintainerReferenceSchema }),
])
export const CorrectedFieldsSchema = z.strictObject({
  location: PositionSchema.optional(), category: ReportCategorySchema.optional(),
  description: text(1000).optional(), observedAt: instant.optional(),
}).refine((value) => Object.keys(value).length > 0, 'Correct at least one report fact.')

const base = { expectedVersion: VersionSchema, reason: text(1000) }
export const ReviewInputSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...base, action: z.literal('verify'), extraEvidence: ExtraEvidenceSchema, publicAvoidGeometry: AvoidGeometrySchema, validUntil: instant.optional() }),
  z.strictObject({ ...base, action: z.literal('correct'), corrections: CorrectedFieldsSchema.optional(), extraEvidence: ExtraEvidenceSchema.optional(), publicAvoidGeometry: AvoidGeometrySchema.optional(), validUntil: instant.optional() }),
  z.strictObject({ ...base, action: z.literal('reject') }),
  z.strictObject({ ...base, action: z.literal('resolve'), extraEvidence: ExtraEvidenceSchema }),
  z.strictObject({ ...base, action: z.literal('reopen') }),
])

export type ReviewActor = z.infer<typeof ReviewActorSchema>
export type ExtraEvidence = z.infer<typeof ExtraEvidenceSchema>
export type CorrectedFields = z.infer<typeof CorrectedFieldsSchema>
export type ReviewInput = z.infer<typeof ReviewInputSchema>
