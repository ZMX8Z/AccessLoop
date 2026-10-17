import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AnalysisDTOSchema,
  AvoidanceConfirmInputSchema,
  AvoidancePreviewDTOSchema,
  CreateReportInputSchema,
  PrivateReportDTOSchema,
  PublicReportDTOSchema,
  ReviewInputSchema,
  UploadResponseDataSchema,
  UsageSummaryDataSchema,
  VisionResultSchema,
} from '../src/shared/contracts';
import {
  fixtureAvoidancePreview,
  fixtureCompletedAnalysis,
  fixtureCreateReportInput,
  fixturePrivateReport,
  fixturePublicReport,
  fixtureReviewVerifyInput,
  fixtureUnavailableAnalysis,
  fixtureUncertainAnalysis,
  fixtureUploadResponse,
  fixtureUsageSummary,
} from '../src/shared/fixtures/hazard-fixtures';

test('uploads contract parses valid upload response data and rejects invalid formats', () => {
  assert.deepEqual(UploadResponseDataSchema.parse(fixtureUploadResponse), fixtureUploadResponse);

  assert.equal(
    UploadResponseDataSchema.safeParse({
      ...fixtureUploadResponse,
      mime: '',
    }).success,
    false,
  );

  assert.equal(
    UploadResponseDataSchema.safeParse({
      ...fixtureUploadResponse,
      bytes: -1,
    }).success,
    false,
  );
});

test('vision result validates required enum fields and rejects uncertain as a report category', () => {
  assert.deepEqual(VisionResultSchema.parse(fixtureCompletedAnalysis.result), fixtureCompletedAnalysis.result);

  // 'uncertain' is valid in VisionResultSchema, but invalid in CreateReportInputSchema
  assert.equal(
    CreateReportInputSchema.safeParse({
      ...fixtureCreateReportInput,
      category: 'uncertain',
    }).success,
    false,
  );
});

test('analysis DTO parses completed, uncertain and unavailable variants', () => {
  assert.deepEqual(AnalysisDTOSchema.parse(fixtureCompletedAnalysis), fixtureCompletedAnalysis);
  assert.deepEqual(AnalysisDTOSchema.parse(fixtureUncertainAnalysis), fixtureUncertainAnalysis);
  assert.deepEqual(AnalysisDTOSchema.parse(fixtureUnavailableAnalysis), fixtureUnavailableAnalysis);

  // Unavailable without reason is rejected if not matching schema
  assert.equal(
    AnalysisDTOSchema.safeParse({
      ...fixtureUnavailableAnalysis,
      unavailableReason: 'arbitrary_fake_reason',
    }).success,
    false,
  );
});

test('avoidance preview requires valid geometry and previewDigest', () => {
  assert.deepEqual(AvoidancePreviewDTOSchema.parse(fixtureAvoidancePreview), fixtureAvoidancePreview);

  assert.equal(
    AvoidancePreviewDTOSchema.safeParse({
      ...fixtureAvoidancePreview,
      previewDigest: '',
    }).success,
    false,
  );
});

test('avoidance confirmation strictly requires consent=true', () => {
  const validInput = {
    expectedVersion: 1,
    observedAt: '2026-10-17T06:00:00.000Z',
    passage: {
      presetPassageId: 'passage-library-walk',
      passageVersion: 1,
    },
    previewDigest: 'sig_preview_unsw_test_digest_12345',
    consent: true as const,
  };

  assert.deepEqual(AvoidanceConfirmInputSchema.parse(validInput), validInput);

  assert.equal(
    AvoidanceConfirmInputSchema.safeParse({
      ...validInput,
      consent: false,
    }).success,
    false,
  );

  const missingConsent = { ...validInput } as Record<string, unknown>;
  delete missingConsent.consent;
  assert.equal(AvoidanceConfirmInputSchema.safeParse(missingConsent).success, false);
});

test('public report DTO is an exact whitelist and rejects internal private fields', () => {
  assert.deepEqual(PublicReportDTOSchema.parse(fixturePublicReport), fixturePublicReport);

  // Public DTO must reject photoId and raw analysis
  assert.equal(
    PublicReportDTOSchema.safeParse({
      ...fixturePublicReport,
      photoId: 'photo-unsw-01',
    }).success,
    false,
  );

  assert.equal(
    PublicReportDTOSchema.safeParse({
      ...fixturePublicReport,
      analysis: fixtureCompletedAnalysis,
    }).success,
    false,
  );

  // Private DTO accepts full details
  assert.deepEqual(PrivateReportDTOSchema.parse(fixturePrivateReport), fixturePrivateReport);
});

test('admin review input validates all 5 discriminated actions', () => {
  // 1. verify
  assert.deepEqual(ReviewInputSchema.parse(fixtureReviewVerifyInput), fixtureReviewVerifyInput);

  // 2. correct
  const correctInput = {
    action: 'correct' as const,
    expectedVersion: 1,
    reason: 'Refined description and coordinates based on student feedback.',
    corrections: {
      description: 'Partially blocked ramp.',
    },
  };
  assert.deepEqual(ReviewInputSchema.parse(correctInput), correctInput);

  // 3. reject
  const rejectInput = {
    action: 'reject' as const,
    expectedVersion: 1,
    reason: 'Photo is from last year; currently open.',
  };
  assert.deepEqual(ReviewInputSchema.parse(rejectInput), rejectInput);

  // 4. resolve
  const resolveInput = {
    action: 'resolve' as const,
    expectedVersion: 2,
    reason: 'Construction completed and barricades removed.',
    extraEvidence: {
      kind: 'field_observation' as const,
      observedAt: '2026-10-17T08:00:00.000Z',
      summary: 'Maintenance team confirmed clearance.',
    },
  };
  assert.deepEqual(ReviewInputSchema.parse(resolveInput), resolveInput);

  // 5. reopen
  const reopenInput = {
    action: 'reopen' as const,
    expectedVersion: 3,
    reason: 'Obstruction reported again by multiple callers.',
  };
  assert.deepEqual(ReviewInputSchema.parse(reopenInput), reopenInput);

  // Reject empty reason
  assert.equal(
    ReviewInputSchema.safeParse({
      action: 'reject',
      expectedVersion: 1,
      reason: '',
    }).success,
    false,
  );
});

test('usage summary metrics validate non-negative integers', () => {
  assert.deepEqual(UsageSummaryDataSchema.parse(fixtureUsageSummary), fixtureUsageSummary);

  assert.equal(
    UsageSummaryDataSchema.safeParse({
      ...fixtureUsageSummary,
      services: {
        ...fixtureUsageSummary.services,
        ors: {
          ...fixtureUsageSummary.services.ors,
          calls: -1,
        },
      },
    }).success,
    false,
  );
});
