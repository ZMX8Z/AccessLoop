import assert from 'node:assert/strict'
import test from 'node:test'

import { requireReviewTransition, verifiedPublicValidity } from '../src/features/hazards/server/review'
import { AppError } from '../src/server/http/errors'
import { ExtraEvidenceSchema, ReviewInputSchema } from '../src/shared/contracts/review'

const now = Date.parse('2033-01-01T00:00:00.000Z')
const evidence = { kind: 'field_observation', observedAt: new Date(now).toISOString(), summary: 'Independent synthetic observation.' }
const geometry = { type: 'Polygon', coordinates: [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0]]] }

test('review commands strictly separate evidence, facts, lifecycle and server ownership', () => {
  const input = { action: 'verify', expectedVersion: 1, reason: 'Independent synthetic check.', extraEvidence: evidence, publicAvoidGeometry: geometry }
  assert.equal(ReviewInputSchema.safeParse(input).success, true)
  for (const extra of [{ status: 'verified' }, { actor: { id: '1' } }, { verifiedBy: '1' }, { ownerSessionHash: 'x' }, { analysis: {} }]) {
    assert.equal(ReviewInputSchema.safeParse({ ...input, ...extra }).success, false)
  }
  assert.equal(ReviewInputSchema.safeParse({ action: 'correct', expectedVersion: 1, reason: 'Correction.', corrections: { description: 'Separate human facts.' } }).success, true)
  assert.equal(ReviewInputSchema.safeParse({ action: 'correct', expectedVersion: 1, reason: 'Correction.', corrections: { photoId: 'replace-original' } }).success, false)
  assert.equal(ReviewInputSchema.safeParse({ action: 'reject', expectedVersion: 1, reason: '   ' }).success, false)
  assert.equal(ExtraEvidenceSchema.safeParse({ ...evidence, summary: '\u3000' }).success, false)
  assert.equal(ExtraEvidenceSchema.safeParse({ ...evidence, sourceReference: 'extra' }).success, false)
})

test('maintainer evidence accepts identifiers or HTTPS references and never needs a fetchable URL', () => {
  const base = { kind: 'trusted_maintainer', observedAt: evidence.observedAt, summary: 'Operator-approved fixture source.' }
  assert.equal(ExtraEvidenceSchema.safeParse({ ...base, sourceReference: 'maintenance-ticket-123' }).success, true)
  assert.equal(ExtraEvidenceSchema.safeParse({ ...base, sourceReference: 'https://maintainer.example.invalid/tickets/123' }).success, true)
  for (const sourceReference of ['http://maintainer.example.invalid/123', 'https://user:password@example.invalid/123', ' ', 'x'.repeat(501)]) {
    assert.equal(ExtraEvidenceSchema.safeParse({ ...base, sourceReference }).success, false)
  }
})

test('review transitions preserve explicit publication and reopening rules', () => {
  const matrix = {
    verify: ['pending', 'ai_assessed', 'verified'], correct: ['pending', 'ai_assessed', 'verified', 'resolved', 'rejected'],
    reject: ['pending', 'ai_assessed', 'verified'], resolve: ['verified'], reopen: ['resolved', 'rejected'],
  } as const
  for (const action of ['verify', 'correct', 'reject', 'resolve', 'reopen'] as const) {
    const permitted: readonly string[] = matrix[action]
    for (const status of ['pending', 'ai_assessed', 'verified', 'resolved', 'rejected'] as const) {
      if (permitted.includes(status)) assert.doesNotThrow(() => requireReviewTransition(status, action))
      else assert.throws(() => requireReviewTransition(status, action), (error) => error instanceof AppError && error.code === 'INVALID_TRANSITION')
    }
  }
})

test('public validity uses evidence observation time and preserves an omitted correction expiry', () => {
  const input = { observedAt: new Date(now - 1000).toISOString(), publicValiditySec: 86400, now }
  const maximum = new Date(now - 1000 + 86400_000).toISOString()
  assert.equal(verifiedPublicValidity(input), maximum)
  assert.equal(verifiedPublicValidity({ ...input, previousValidUntil: new Date(now + 5000).toISOString() }), new Date(now + 5000).toISOString())
  assert.equal(verifiedPublicValidity({ ...input, validUntil: new Date(now + 10_000).toISOString() }), new Date(now + 10_000).toISOString())
  for (const validUntil of [new Date(now).toISOString(), new Date(Date.parse(maximum) + 1).toISOString()]) {
    assert.throws(() => verifiedPublicValidity({ ...input, validUntil }), (error) => error instanceof AppError && error.code === 'EVIDENCE_REQUIRED')
  }
})
