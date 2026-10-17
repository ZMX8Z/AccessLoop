import { z } from 'zod';

import {
  BBoxSchema,
  IdSchema,
  PositionSchema,
  VersionSchema,
} from './common';
import { PassageRefSchema } from './routing';

// ISO 8601 UTC Instant Schema
export const InstantSchema = z.string().datetime();

// Geometry schemas
export const PolygonGeometrySchema = z.strictObject({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(PositionSchema)).min(1),
});

export const MultiPolygonGeometrySchema = z.strictObject({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(PositionSchema))).min(1),
});

export const AvoidGeometrySchema = z.union([
  PolygonGeometrySchema,
  MultiPolygonGeometrySchema,
]);

// 1. Uploads
export const UploadPurposeSchema = z.enum(['report', 'review_evidence']);

export const UploadResponseDataSchema = z.strictObject({
  photoId: IdSchema,
  purpose: UploadPurposeSchema,
  mime: z.string().min(1),
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

// 2. Vision & AI Analysis
export const AIStatusSchema = z.enum(['completed', 'uncertain', 'unavailable']);

export const VisionCategorySchema = z.enum([
  'construction',
  'steps_or_kerb',
  'surface_damage',
  'obstruction',
  'other',
  'uncertain',
]);

export const VisiblePassageSchema = z.enum([
  'blocked',
  'partially_blocked',
  'clear',
  'unknown',
]);

export const VisionResultSchema = z.strictObject({
  image_quality: z.enum(['usable', 'poor', 'unusable']),
  hazard_present: z.boolean().nullable(),
  category: VisionCategorySchema,
  visible_passage: VisiblePassageSchema,
  description: z.string().min(1).max(1000),
  evidence: z.array(z.string().min(1).max(300)).max(10),
  uncertainties: z.array(z.string().min(1).max(300)).max(10),
});

export const UnavailableReasonSchema = z.enum([
  'no_valid_tool_result',
  'invalid_output',
  'refused',
  'provider_timeout',
  'provider_unavailable',
]).nullable();

export const AnalysisDTOSchema = z.strictObject({
  analysisId: IdSchema,
  photoId: IdSchema,
  aiStatus: AIStatusSchema,
  result: VisionResultSchema.nullable(),
  unavailableReason: UnavailableReasonSchema,
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  createdAt: InstantSchema,
  cacheHit: z.boolean(),
});

export const AnalyzeInputSchema = z.strictObject({
  photoId: IdSchema,
  consent: z.literal(true),
});

// 3. Hazard Reports
export const ReportCategorySchema = z.enum([
  'construction',
  'steps_or_kerb',
  'surface_damage',
  'obstruction',
  'other',
]);

export const ReportStatusSchema = z.enum([
  'pending',
  'ai_assessed',
  'verified',
  'resolved',
  'rejected',
]);

export const CreateReportInputSchema = z.strictObject({
  photoId: IdSchema,
  analysisId: IdSchema.optional(),
  location: PositionSchema,
  category: ReportCategorySchema,
  description: z.string().trim().min(1).max(1000),
  observedAt: InstantSchema,
  passage: PassageRefSchema.optional(),
});

export const PatchReportInputSchema = z.strictObject({
  expectedVersion: VersionSchema,
  photoId: IdSchema.optional(),
  analysisId: IdSchema.nullable().optional(),
  location: PositionSchema.optional(),
  category: ReportCategorySchema.optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  observedAt: InstantSchema.optional(),
  passage: PassageRefSchema.nullable().optional(),
});

// 4. Personal Avoidance & Preview
export const AvoidancePreviewInputSchema = z.strictObject({
  expectedVersion: VersionSchema,
  observedAt: InstantSchema,
  passage: PassageRefSchema,
});

export const AvoidancePreviewDTOSchema = z.strictObject({
  expectedVersion: VersionSchema,
  observedAt: InstantSchema,
  passage: PassageRefSchema,
  configVersion: VersionSchema,
  avoidGeometry: AvoidGeometrySchema,
  validUntil: InstantSchema,
  previewDigest: z.string().min(1),
  expiresAt: InstantSchema,
});

export const AvoidanceConfirmInputSchema = z.strictObject({
  expectedVersion: VersionSchema,
  observedAt: InstantSchema,
  passage: PassageRefSchema,
  previewDigest: z.string().min(1),
  consent: z.literal(true),
});

export const AvoidanceDeleteInputSchema = z.strictObject({
  expectedVersion: VersionSchema,
});

// 5. Output DTOs
export const PersonalAvoidanceDTOSchema = z.strictObject({
  active: z.boolean(),
  effective: z.boolean(),
  passage: PassageRefSchema,
  avoidGeometry: AvoidGeometrySchema,
  decisionSource: z.enum(['ai_user_confirmed', 'user_manual']),
  observedAt: InstantSchema,
  confirmedAt: InstantSchema,
  validUntil: InstantSchema,
  confirmationReportVersion: VersionSchema,
});

export const PublicVerificationDTOSchema = z.strictObject({
  source: z.enum(['admin_field_check', 'trusted_maintainer']),
  verifiedAt: InstantSchema,
  validUntil: InstantSchema,
  resolvedAt: InstantSchema.nullable(),
});

export const PublicActivitySchema = z.enum(['active', 'expired', 'inactive']);

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
  description: z.string(),
  observedAt: InstantSchema,
  passage: PassageRefSchema.nullable(),
  personalAvoidance: PersonalAvoidanceDTOSchema.nullable(),
  publicAvoidGeometry: AvoidGeometrySchema.nullable(),
  publicVerification: PublicVerificationDTOSchema.nullable(),
  publicActivity: PublicActivitySchema,
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
  isDemo: z.boolean(),
});

// Whitelist-only schema for PublicReportDTO
export const PublicReportDTOSchema = z.strictObject({
  id: IdSchema,
  regionId: IdSchema,
  publicRevision: VersionSchema,
  status: z.enum(['verified', 'resolved', 'rejected']),
  location: PositionSchema,
  category: ReportCategorySchema,
  description: z.string(),
  observedAt: InstantSchema,
  publicAvoidGeometry: AvoidGeometrySchema,
  publicVerification: PublicVerificationDTOSchema,
  publicActivity: PublicActivitySchema,
  isDemo: z.boolean(),
});

export const ReportsQuerySchema = z.strictObject({
  bbox: BBoxSchema.optional(),
  scope: z.enum(['public', 'mine']).default('public'),
});

// 6. Admin Actions (Review)
export const ExtraEvidenceFieldObservationSchema = z.strictObject({
  kind: z.literal('field_observation'),
  observedAt: InstantSchema,
  summary: z.string().trim().min(1).max(1000),
  photoId: IdSchema.optional(),
});

export const ExtraEvidenceTrustedMaintainerSchema = z.strictObject({
  kind: z.literal('trusted_maintainer'),
  observedAt: InstantSchema,
  summary: z.string().trim().min(1).max(1000),
  sourceReference: z.string().trim().min(1).max(500),
});

export const ExtraEvidenceSchema = z.union([
  ExtraEvidenceFieldObservationSchema,
  ExtraEvidenceTrustedMaintainerSchema,
]);

export const CorrectedFieldsSchema = z.strictObject({
  location: PositionSchema.optional(),
  category: ReportCategorySchema.optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  observedAt: InstantSchema.optional(),
});

export const ReviewVerifyInputSchema = z.strictObject({
  action: z.literal('verify'),
  expectedVersion: VersionSchema,
  reason: z.string().trim().min(1).max(1000),
  extraEvidence: ExtraEvidenceSchema,
  publicAvoidGeometry: AvoidGeometrySchema,
  validUntil: InstantSchema.optional(),
});

export const ReviewCorrectInputSchema = z.strictObject({
  action: z.literal('correct'),
  expectedVersion: VersionSchema,
  reason: z.string().trim().min(1).max(1000),
  corrections: CorrectedFieldsSchema.optional(),
  extraEvidence: ExtraEvidenceSchema.optional(),
  publicAvoidGeometry: AvoidGeometrySchema.optional(),
  validUntil: InstantSchema.optional(),
});

export const ReviewRejectInputSchema = z.strictObject({
  action: z.literal('reject'),
  expectedVersion: VersionSchema,
  reason: z.string().trim().min(1).max(1000),
});

export const ReviewResolveInputSchema = z.strictObject({
  action: z.literal('resolve'),
  expectedVersion: VersionSchema,
  reason: z.string().trim().min(1).max(1000),
  extraEvidence: ExtraEvidenceSchema,
});

export const ReviewReopenInputSchema = z.strictObject({
  action: z.literal('reopen'),
  expectedVersion: VersionSchema,
  reason: z.string().trim().min(1).max(1000),
});

export const ReviewInputSchema = z.discriminatedUnion('action', [
  ReviewVerifyInputSchema,
  ReviewCorrectInputSchema,
  ReviewRejectInputSchema,
  ReviewResolveInputSchema,
  ReviewReopenInputSchema,
]);

// 7. Admin Usage Metrics
export const ServiceUsageMetricsSchema = z.strictObject({
  calls: z.number().int().nonnegative(),
  waits: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
});

export const UsageSummaryDataSchema = z.strictObject({
  windowStart: InstantSchema,
  windowEnd: InstantSchema,
  services: z.strictObject({
    ors: ServiceUsageMetricsSchema,
    vision: ServiceUsageMetricsSchema,
  }),
});

// Infer TypeScript types
export type Instant = z.infer<typeof InstantSchema>;
export type PolygonGeometry = z.infer<typeof PolygonGeometrySchema>;
export type MultiPolygonGeometry = z.infer<typeof MultiPolygonGeometrySchema>;
export type AvoidGeometry = z.infer<typeof AvoidGeometrySchema>;
export type UploadPurpose = z.infer<typeof UploadPurposeSchema>;
export type UploadResponseData = z.infer<typeof UploadResponseDataSchema>;
export type AIStatus = z.infer<typeof AIStatusSchema>;
export type VisionCategory = z.infer<typeof VisionCategorySchema>;
export type VisiblePassage = z.infer<typeof VisiblePassageSchema>;
export type VisionResult = z.infer<typeof VisionResultSchema>;
export type UnavailableReason = z.infer<typeof UnavailableReasonSchema>;
export type AnalysisDTO = z.infer<typeof AnalysisDTOSchema>;
export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;
export type ReportCategory = z.infer<typeof ReportCategorySchema>;
export type ReportStatus = z.infer<typeof ReportStatusSchema>;
export type CreateReportInput = z.infer<typeof CreateReportInputSchema>;
export type PatchReportInput = z.infer<typeof PatchReportInputSchema>;
export type AvoidancePreviewInput = z.infer<typeof AvoidancePreviewInputSchema>;
export type AvoidancePreviewDTO = z.infer<typeof AvoidancePreviewDTOSchema>;
export type AvoidanceConfirmInput = z.infer<typeof AvoidanceConfirmInputSchema>;
export type AvoidanceDeleteInput = z.infer<typeof AvoidanceDeleteInputSchema>;
export type PersonalAvoidanceDTO = z.infer<typeof PersonalAvoidanceDTOSchema>;
export type PublicVerificationDTO = z.infer<typeof PublicVerificationDTOSchema>;
export type PublicActivity = z.infer<typeof PublicActivitySchema>;
export type PrivateReportDTO = z.infer<typeof PrivateReportDTOSchema>;
export type PublicReportDTO = z.infer<typeof PublicReportDTOSchema>;
export type ReportsQuery = z.infer<typeof ReportsQuerySchema>;
export type ExtraEvidence = z.infer<typeof ExtraEvidenceSchema>;
export type CorrectedFields = z.infer<typeof CorrectedFieldsSchema>;
export type ReviewInput = z.infer<typeof ReviewInputSchema>;
export type ServiceUsageMetrics = z.infer<typeof ServiceUsageMetricsSchema>;
export type UsageSummaryData = z.infer<typeof UsageSummaryDataSchema>;
