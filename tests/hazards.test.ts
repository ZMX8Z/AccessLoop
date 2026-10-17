import assert from 'node:assert/strict'
import test from 'node:test'

import { AppError } from '../src/server/http/errors'
import {
  ConfirmAvoidanceInputSchema, CreateReportInputSchema, PreviewInputSchema,
  PublicReportDTOSchema, UpdateReportInputSchema,
} from '../src/shared/contracts/hazards'
import { dRoutingFixture } from '../src/shared/fixtures/d-routing'
import { publicReportDTO } from '../src/features/hazards/server/dto'
import { issuePreviewToken, readPreviewToken, verifyPreviewToken } from '../src/features/hazards/server/preview'

const facts = {
  photoId: 'photo-synthetic', location: [151.2295, -33.917], category: 'construction',
  description: 'A barrier crosses the path.', observedAt: '2026-10-17T03:00:00Z',
}
const secret = 'synthetic-preview-secret-with-at-least-32-bytes'
const now = Date.parse('2026-10-17T03:00:00Z')
const polygon = {
  type: 'Polygon', coordinates: [[[151.229, -33.917], [151.2291, -33.917], [151.2291, -33.9171], [151.229, -33.917]]],
}

test('report input schemas reject client ownership, lifecycle, AI results and arbitrary avoidance geometry', () => {
  assert.equal(CreateReportInputSchema.safeParse(facts).success, true)
  for (const extra of [
    { ownerSessionHash: 'a'.repeat(64) }, { status: 'verified' }, { rowVersion: 12 },
    { analysis: { aiStatus: 'completed' } }, { publicAvoidGeometry: polygon }, { avoidGeometry: polygon },
  ]) assert.equal(CreateReportInputSchema.safeParse({ ...facts, ...extra }).success, false)
  assert.equal(UpdateReportInputSchema.safeParse({ expectedVersion: 1 }).success, false)
  assert.equal(UpdateReportInputSchema.safeParse({ expectedVersion: 1, description: '   ' }).success, false)
  assert.equal(UpdateReportInputSchema.safeParse({ expectedVersion: 1, analysisId: null, passage: null }).success, true)
  assert.equal(CreateReportInputSchema.safeParse({ ...facts, description: '😀'.repeat(1000) }).success, true)
  assert.equal(CreateReportInputSchema.safeParse({ ...facts, description: '😀'.repeat(1001) }).success, false)
})

test('preview and confirmation accept only server passage references and explicit consent', () => {
  const input = { expectedVersion: 1, observedAt: facts.observedAt, passage: { presetPassageId: 'synthetic-passage', passageVersion: 1 } }
  assert.equal(PreviewInputSchema.safeParse(input).success, true)
  assert.equal(PreviewInputSchema.safeParse({ ...input, avoidGeometry: polygon }).success, false)
  assert.equal(PreviewInputSchema.safeParse({ ...input, passage: { ...input.passage, routeRef: 'forged', startIndex: 0, endIndex: 1 } }).success, false)
  assert.equal(ConfirmAvoidanceInputSchema.safeParse({ ...input, previewDigest: 'opaque-token', consent: true }).success, true)
  assert.equal(ConfirmAvoidanceInputSchema.safeParse({ ...input, previewDigest: 'opaque-token', consent: false }).success, false)
})

test('preview tokens authenticate the complete binding and expire at the signed deadline', () => {
  const binding = { owner: 'a'.repeat(64), report: 'report-1', version: 1, geometry: polygon, observedAt: facts.observedAt }
  const token = issuePreviewToken({ binding, now, expiresAt: now + 1000, secret })
  assert.equal(verifyPreviewToken({ token, binding, now: now + 999, secret }).expiresAt, now + 1000)
  const stale = (error: unknown) => error instanceof AppError && error.code === 'PREVIEW_STALE'
  assert.throws(() => verifyPreviewToken({ token, binding, now: now + 1000, secret }), stale)
  assert.throws(() => verifyPreviewToken({ token, binding: { ...binding, owner: 'b'.repeat(64) }, now, secret }), stale)
  assert.throws(() => verifyPreviewToken({ token, binding: { ...binding, version: 2 }, now, secret }), stale)
  assert.throws(() => verifyPreviewToken({ token: `${token.slice(0, -1)}!`, binding, now, secret }), stale)
  assert.throws(() => verifyPreviewToken({ token, binding, now, secret: `${secret}-other` }), stale)
  assert.throws(() => readPreviewToken({ token, now: now - 1, secret }), stale)
  const tooLong = issuePreviewToken({ binding, now, expiresAt: now + 300_001, secret })
  assert.throws(() => readPreviewToken({ token: tooLong, now, secret }), stale)
})

test('public reports use the complete publication whitelist and never borrow private facts', () => {
  const published = {
    publicRevision: 4, status: 'verified', location: [151.2295, -33.917], category: 'construction',
    description: 'Independently checked public description.', observedAt: facts.observedAt,
    publicAvoidGeometry: polygon, validUntil: '2026-10-18T03:00:00Z', visible: true,
    publicVerification: { source: 'admin_field_check', verifiedAt: facts.observedAt, validUntil: '2026-10-18T03:00:00Z', resolvedAt: null },
  }
  const report = {
    id: 'report-synthetic', regionId: dRoutingFixture.region.id, publicSnapshot: published,
    facts: { ...facts, description: 'Private edits must not leak.', photoId: 'private-photo' }, ownerSessionHash: 'a'.repeat(64), rowVersion: 99,
  }
  const result = publicReportDTO({ report, region: dRoutingFixture.region, now })
  assert.ok(result)
  assert.equal(result.description, published.description)
  assert.equal(result.publicActivity, 'active')
  assert.deepEqual(Object.keys(result).sort(), [
    'id', 'regionId', 'publicRevision', 'status', 'location', 'category', 'description', 'observedAt',
    'publicAvoidGeometry', 'publicVerification', 'publicActivity', 'isDemo',
  ].sort())
  assert.equal(PublicReportDTOSchema.safeParse({ ...result, photoId: 'private-photo' }).success, false)
  const expired = publicReportDTO({ report, region: dRoutingFixture.region, now: Date.parse(published.validUntil) })
  assert.equal(expired?.status, 'verified')
  assert.equal(expired?.publicActivity, 'expired')
  assert.equal(publicReportDTO({ report: { ...report, publicSnapshot: { ...published, visible: false } }, region: dRoutingFixture.region, now }), null)
  assert.equal(publicReportDTO({
    report: { ...report, publicSnapshot: { status: 'verified', publicRevision: 4, publicAvoidGeometry: polygon, validUntil: published.validUntil } },
    region: dRoutingFixture.region, now,
  }), null)
})
