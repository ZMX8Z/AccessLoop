import { z } from 'zod'

import { BBoxSchema, IdSchema, PositionSchema, VersionSchema } from './common'
import { AvoidGeometrySchema } from './geo'
import { InstantSchema } from './region'
import { PassageRefSchema } from './routing'
import { AnalysisDTOSchema } from './vision'
import { ReportStatusSchema } from './storage'

export { ReportStatusSchema } from './storage'

const ReportInstantSchema = InstantSchema.transform((value) => new Date(value).toISOString())
const DescriptionSchema = z.string().trim().refine((value) => {
  const length = Array.from(value).length
  return length >= 1 && length <= 1000
}, 'A description of 1 to 1000 characters is required.')

export const ReportCategorySchema = z.enum(['construction', 'steps_or_kerb', 'surface_damage', 'obstruction', 'other'])

const EditableFacts = {
  photoId: IdSchema,
  location: PositionSchema,
  category: ReportCategorySchema,
  description: DescriptionSchema,
  observedAt: ReportInstantSchema,
}

export const CreateReportInputSchema = z.strictObject({
  ...EditableFacts,
  analysisId: IdSchema.optional(),
  passage: PassageRefSchema.optional(),
})
export const UpdateReportInputSchema = z.strictObject({
  expectedVersion: VersionSchema,
  photoId: IdSchema.optional(),
  location: PositionSchema.optional(),
  category: ReportCategorySchema.optional(),
  description: DescriptionSchema.optional(),
  observedAt: ReportInstantSchema.optional(),
  analysisId: IdSchema.nullable().optional(),
  passage: PassageRefSchema.nullable().optional(),
}).refine((input) => Object.keys(input).some((key) => key !== 'expectedVersion'), 'Change at least one report field.')

export const ReportFactsSchema = z.strictObject({
  ...EditableFacts,
  analysisId: IdSchema.nullable(),
  passage: PassageRefSchema.nullable(),
})
export const PreviewInputSchema = z.strictObject({
  expectedVersion: VersionSchema,
  observedAt: ReportInstantSchema,
  passage: PassageRefSchema,
})
export const ConfirmAvoidanceInputSchema = PreviewInputSchema.extend({
  previewDigest: z.string().min(1).max(4096),
  consent: z.literal(true),
})
export const DeactivateAvoidanceInputSchema = z.strictObject({ expectedVersion: VersionSchema })

export const PersonalAvoidanceDTOSchema = z.strictObject({
  active: z.boolean(),
  effective: z.boolean(),
  passage: PassageRefSchema,
  avoidGeometry: AvoidGeometrySchema,
  decisionSource: z.enum(['ai_user_confirmed', 'user_manual']),
  observedAt: ReportInstantSchema,
  confirmedAt: ReportInstantSchema,
  validUntil: ReportInstantSchema,
  confirmationReportVersion: VersionSchema,
})
export const PublicVerificationDTOSchema = z.strictObject({
  source: z.enum(['admin_field_check', 'trusted_maintainer']),
  verifiedAt: ReportInstantSchema,
  validUntil: ReportInstantSchema,
  resolvedAt: ReportInstantSchema.nullable(),
})
const PublicFacts = {
  status: z.enum(['verified', 'resolved', 'rejected']),
  publicRevision: VersionSchema,
  location: PositionSchema,
  category: ReportCategorySchema,
  description: DescriptionSchema,
  observedAt: ReportInstantSchema,
  publicAvoidGeometry: AvoidGeometrySchema,
  publicVerification: PublicVerificationDTOSchema,
}

// This is a published snapshot, never a projection assembled from the author's current facts.
export const PublishedReportSnapshotSchema = z.strictObject({
  ...PublicFacts,
  validUntil: ReportInstantSchema,
  visible: z.boolean(),
}).refine((value) => value.validUntil === value.publicVerification.validUntil, 'Publication validity must match its verification.')

export const PublicReportDTOSchema = z.strictObject({
  id: IdSchema,
  regionId: IdSchema,
  ...PublicFacts,
  publicActivity: z.enum(['active', 'expired', 'inactive']),
  isDemo: z.boolean(),
})
export const PrivateReportDTOSchema = z.strictObject({
  id: IdSchema,
  regionId: IdSchema,
  rowVersion: VersionSchema,
  status: ReportStatusSchema,
  publicRevision: VersionSchema.nullable(),
  photoId: IdSchema,
  analysis: AnalysisDTOSchema.nullable(),
  location: PositionSchema,
  category: ReportCategorySchema,
  description: DescriptionSchema,
  observedAt: ReportInstantSchema,
  passage: PassageRefSchema.nullable(),
  personalAvoidance: PersonalAvoidanceDTOSchema.nullable(),
  publicAvoidGeometry: AvoidGeometrySchema.nullable(),
  publicVerification: PublicVerificationDTOSchema.nullable(),
  publicActivity: z.enum(['active', 'expired', 'inactive']),
  createdAt: ReportInstantSchema,
  updatedAt: ReportInstantSchema,
  isDemo: z.boolean(),
})
export const PreviewDTOSchema = PreviewInputSchema.extend({
  configVersion: VersionSchema,
  avoidGeometry: AvoidGeometrySchema,
  validUntil: ReportInstantSchema,
  previewDigest: z.string().min(1),
  expiresAt: ReportInstantSchema,
})
export const ReportListInputSchema = z.strictObject({
  scope: z.enum(['public', 'mine']).default('public'),
  bbox: BBoxSchema.optional(),
})

export type CreateReportInput = z.infer<typeof CreateReportInputSchema>
export type UpdateReportInput = z.infer<typeof UpdateReportInputSchema>
export type ReportFacts = z.infer<typeof ReportFactsSchema>
export type PreviewInput = z.infer<typeof PreviewInputSchema>
export type ConfirmAvoidanceInput = z.infer<typeof ConfirmAvoidanceInputSchema>
export type PrivateReportDTO = z.infer<typeof PrivateReportDTOSchema>
export type PublicReportDTO = z.infer<typeof PublicReportDTOSchema>
export type PublishedReportSnapshot = z.infer<typeof PublishedReportSnapshotSchema>
export type PersonalAvoidanceDTO = z.infer<typeof PersonalAvoidanceDTOSchema>
export type PreviewDTO = z.infer<typeof PreviewDTOSchema>
