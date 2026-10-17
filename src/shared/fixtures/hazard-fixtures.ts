import type {
  AnalysisDTO,
  AvoidancePreviewDTO,
  CreateReportInput,
  PrivateReportDTO,
  PublicReportDTO,
  ReviewInput,
  UploadResponseData,
  UsageSummaryData,
} from '../contracts';

export const fixtureUploadResponse: UploadResponseData = {
  photoId: 'photo-unsw-01',
  purpose: 'report',
  mime: 'image/jpeg',
  bytes: 183204,
  width: 1536,
  height: 2048,
};

export const fixtureCompletedAnalysis: AnalysisDTO = {
  analysisId: 'analysis-01',
  photoId: 'photo-unsw-01',
  aiStatus: 'completed',
  result: {
    image_quality: 'usable',
    hazard_present: true,
    category: 'construction',
    visible_passage: 'blocked',
    description: 'A temporary barrier blocks the ramp access completely.',
    evidence: ['A metal barricade spans the entire width of the curb cut.'],
    uncertainties: ['Work duration is not indicated on the sign.'],
  },
  unavailableReason: null,
  model: 'glm-4.6v-flash',
  promptVersion: '1.0.0',
  schemaVersion: '1.0.0',
  createdAt: '2026-10-17T06:00:00.000Z',
  cacheHit: false,
};

export const fixtureUncertainAnalysis: AnalysisDTO = {
  analysisId: 'analysis-02',
  photoId: 'photo-unsw-02',
  aiStatus: 'uncertain',
  result: {
    image_quality: 'poor',
    hazard_present: null,
    category: 'uncertain',
    visible_passage: 'unknown',
    description: 'Glare and distance prevent clear assessment of the curb.',
    evidence: [],
    uncertainties: ['Image is overexposed and distant.'],
  },
  unavailableReason: null,
  model: 'glm-4.6v-flash',
  promptVersion: '1.0.0',
  schemaVersion: '1.0.0',
  createdAt: '2026-10-17T06:05:00.000Z',
  cacheHit: false,
};

export const fixtureUnavailableAnalysis: AnalysisDTO = {
  analysisId: 'analysis-03',
  photoId: 'photo-unsw-03',
  aiStatus: 'unavailable',
  result: null,
  unavailableReason: 'provider_timeout',
  model: 'glm-4.6v-flash',
  promptVersion: '1.0.0',
  schemaVersion: '1.0.0',
  createdAt: '2026-10-17T06:10:00.000Z',
  cacheHit: false,
};

export const fixtureCreateReportInput: CreateReportInput = {
  photoId: 'photo-unsw-01',
  analysisId: 'analysis-01',
  location: [151.2313, -33.9173],
  category: 'construction',
  description: 'Construction fencing fully blocking the walkway near Library Walk.',
  observedAt: '2026-10-17T06:00:00.000Z',
  passage: {
    presetPassageId: 'passage-library-walk',
    passageVersion: 1,
  },
};

export const fixtureAvoidancePreview: AvoidancePreviewDTO = {
  expectedVersion: 1,
  observedAt: '2026-10-17T06:00:00.000Z',
  passage: {
    presetPassageId: 'passage-library-walk',
    passageVersion: 1,
  },
  configVersion: 1,
  avoidGeometry: {
    type: 'Polygon',
    coordinates: [
      [
        [151.231, -33.917],
        [151.2315, -33.917],
        [151.2315, -33.9175],
        [151.231, -33.9175],
        [151.231, -33.917],
      ],
    ],
  },
  validUntil: '2026-10-17T07:00:00.000Z',
  previewDigest: 'sig_preview_unsw_test_digest_12345',
  expiresAt: '2026-10-17T06:05:00.000Z',
};

export const fixturePrivateReport: PrivateReportDTO = {
  id: 'rep-001',
  regionId: 'reg-unsw-kensington',
  rowVersion: 1,
  status: 'ai_assessed',
  publicRevision: null,
  photoId: 'photo-unsw-01',
  analysis: fixtureCompletedAnalysis,
  location: [151.2313, -33.9173],
  category: 'construction',
  description: 'Construction fencing fully blocking the walkway near Library Walk.',
  observedAt: '2026-10-17T06:00:00.000Z',
  passage: {
    presetPassageId: 'passage-library-walk',
    passageVersion: 1,
  },
  personalAvoidance: {
    active: true,
    effective: true,
    passage: {
      presetPassageId: 'passage-library-walk',
      passageVersion: 1,
    },
    avoidGeometry: fixtureAvoidancePreview.avoidGeometry,
    decisionSource: 'ai_user_confirmed',
    observedAt: '2026-10-17T06:00:00.000Z',
    confirmedAt: '2026-10-17T06:01:00.000Z',
    validUntil: '2026-10-17T07:00:00.000Z',
    confirmationReportVersion: 1,
  },
  publicAvoidGeometry: null,
  publicVerification: null,
  publicActivity: 'inactive',
  createdAt: '2026-10-17T06:00:30.000Z',
  updatedAt: '2026-10-17T06:01:00.000Z',
  isDemo: true,
};

export const fixturePublicReport: PublicReportDTO = {
  id: 'rep-001',
  regionId: 'reg-unsw-kensington',
  publicRevision: 1,
  status: 'verified',
  location: [151.2313, -33.9173],
  category: 'construction',
  description: 'Verified construction barrier across Library Walk entrance.',
  observedAt: '2026-10-17T06:00:00.000Z',
  publicAvoidGeometry: fixtureAvoidancePreview.avoidGeometry,
  publicVerification: {
    source: 'admin_field_check',
    verifiedAt: '2026-10-17T06:15:00.000Z',
    validUntil: '2026-10-18T06:15:00.000Z',
    resolvedAt: null,
  },
  publicActivity: 'active',
  isDemo: true,
};

export const fixtureReviewVerifyInput: ReviewInput = {
  action: 'verify',
  expectedVersion: 1,
  reason: 'Field check on Kensington campus verified fence blocks passage.',
  extraEvidence: {
    kind: 'field_observation',
    observedAt: '2026-10-17T06:15:00.000Z',
    summary: 'Campus security confirmed temporary closure until tomorrow.',
    photoId: 'photo-admin-evidence-01',
  },
  publicAvoidGeometry: fixtureAvoidancePreview.avoidGeometry,
  validUntil: '2026-10-18T06:15:00.000Z',
};

export const fixtureUsageSummary: UsageSummaryData = {
  windowStart: '2026-10-16T06:00:00.000Z',
  windowEnd: '2026-10-17T06:00:00.000Z',
  services: {
    ors: {
      calls: 28,
      waits: 1,
      errors: 0,
      cacheHits: 14,
    },
    vision: {
      calls: 12,
      waits: 0,
      errors: 1,
      cacheHits: 5,
    },
  },
};
