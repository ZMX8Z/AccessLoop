import { sql } from '@payloadcms/db-postgres'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import { createLocalReq, type CollectionBeforeChangeHook } from 'payload'

import { createHazardService } from '../src/features/hazards/server/service'
import { createReviewService } from '../src/features/hazards/server/review'
import { bufferPassage } from '../src/features/routing/server/geometry'
import { evaluateContext } from '../src/features/routing/server/context'
import { AppError } from '../src/server/http/errors'
import { createBusinessRepository } from '../src/server/storage/business-repository'
import { createAdminRegionService } from '../src/server/admin/region-service'
import { contextId } from '../src/server/storage/sessions'
import { fingerprint } from '../src/server/storage/value'
import type { PrivateReportDTO } from '../src/shared/contracts/hazards'
import type { ReviewActor } from '../src/shared/contracts/review'
import { dRoutingFixture } from '../src/shared/fixtures/d-routing'

test('C2 review commands enforce independent evidence, publication history and atomic PostgreSQL state', {
  skip: process.env.ACCESSLOOP_STORAGE_TESTS !== '1', timeout: 120_000,
}, async (t) => {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const business = createBusinessRepository(payload)
  const run = `review-${randomUUID()}`
  const hash = (text: string) => createHash('sha256').update(text).digest('hex')
  const owner = hash(`${run}-author`)
  const otherOwner = hash(`${run}-other`)
  const region = { ...dRoutingFixture.region, id: run }
  const passage = { ...dRoutingFixture.passages[0], id: `${run}-passage` }
  const passageRef = { presetPassageId: passage.id, passageVersion: 1 }
  const imageHash = `sha256:${hash(run)}`
  const photoId = `${run}-original-photo`
  const evidencePhoto = `${run}-review-photo`
  const foreignEvidencePhoto = `${run}-foreign-review-photo`
  const stagingEvidence = `${run}-staging-review-photo`
  const visionConfig = { model: 'glm-4.6v-flash', promptVersion: '1', schemaVersion: '1' }
  let clock = Date.parse('2033-01-01T00:00:00.000Z')
  const serviceOptions = { regionId: run, sessionSecret: 'review-fixture-secret-at-least-32-bytes', visionConfig, now: () => clock }
  const hazards = createHazardService(payload, serviceOptions)
  const reviews = createReviewService(payload, serviceOptions)
  const geometry = bufferPassage(passage.geometry, 2, region.bbox)
  const widerGeometry = bufferPassage(passage.geometry, 3, region.bbox)
  const code = (value: string) => (error: unknown) => error instanceof AppError && error.code === value
  let reviewer: ReviewActor
  let operatorActor: ReviewActor
  let reviewerId: number

  const facts = () => ({ photoId, location: [151.2295, -33.917], category: 'construction', description: 'Synthetic reported barrier, not a campus observation.', observedAt: new Date(clock).toISOString(), passage: passageRef })
  const fieldEvidence = () => ({ kind: 'field_observation', observedAt: new Date(clock).toISOString(), summary: 'Synthetic independent review record, not an actual field check.', photoId: evidencePhoto })
  const makeReport = async (suffix: string) => (await hazards.create({ ownerSessionHash: owner, idempotencyKey: `${run}-create-${suffix}`, input: facts() })).result
  const review = (report: PrivateReportDTO, input: object, key: string = randomUUID(), actor?: ReviewActor) => reviews.review({
    actor: actor ?? reviewer, reportId: report.id, idempotencyKey: key, input: { expectedVersion: report.rowVersion, reason: 'Synthetic C2 verification scenario.', ...input },
  })
  const publish = async (suffix: string) => (await review(await makeReport(suffix), { action: 'verify', extraEvidence: fieldEvidence(), publicAvoidGeometry: geometry })).result
  const counts = async (reportId: string) => ({
    hazardVersion: (await business.requireRegion(run)).hazardVersion,
    personalVersion: (await payload.findByID({ collection: 'session-contexts', id: contextId(run, owner), overrideAccess: true })).personalVersion,
    otherVersion: (await payload.findByID({ collection: 'session-contexts', id: contextId(run, otherOwner), overrideAccess: true })).personalVersion,
    events: (await payload.count({ collection: 'report-events', where: { reportId: { equals: reportId } }, overrideAccess: true })).totalDocs,
  })
  const confirmPersonal = async (report: PrivateReportDTO) => {
    const input = { expectedVersion: report.rowVersion, observedAt: new Date(clock).toISOString(), passage: passageRef }
    const preview = await hazards.preview({ ownerSessionHash: owner, reportId: report.id, input })
    return (await hazards.confirm({ ownerSessionHash: owner, reportId: report.id, idempotencyKey: randomUUID(), input: { ...input, previewDigest: preview.previewDigest, consent: true } })).result
  }

  try {
    await business.ensureSession(owner)
    await business.ensureSession(otherOwner)
    await business.seedRegion({ region, presetPassages: [passage], source: { kind: 'synthetic', note: 'C2 transaction fixtures only, no network, real photographs or field verification.' } })
    await business.ensureSessionContext(run, owner)
    await business.ensureSessionContext(run, otherOwner)
    const existing = await payload.find({ collection: 'admins', where: { and: [{ role: { equals: 'operator' } }, { enabled: { equals: true } }] }, limit: 1, overrideAccess: true })
    const operator = existing.docs[0] ?? await payload.create({
      collection: 'admins', data: { email: `${run}-operator@example.invalid`, password: randomUUID(), role: 'operator', enabled: true }, context: { bootstrapAdmin: true }, overrideAccess: true,
    })
    operatorActor = { id: String(operator.id), role: 'operator' }
    const operatorReq = await createLocalReq({ user: { ...operator, collection: 'admins' } }, payload)
    const admin = await payload.create({ collection: 'admins', data: { email: `${run}-reviewer@example.invalid`, password: randomUUID(), role: 'report_admin', enabled: true }, overrideAccess: true, req: operatorReq })
    const otherAdmin = await payload.create({ collection: 'admins', data: { email: `${run}-other-reviewer@example.invalid`, password: randomUUID(), role: 'report_admin', enabled: true }, overrideAccess: true, req: operatorReq })
    reviewerId = admin.id
    reviewer = { id: String(admin.id), role: 'report_admin' }
    await business.withTransaction(async ({ execute }) => {
      for (const photo of [
        { id: photoId, purpose: 'report', session: owner, admin: null, state: 'ready' },
        { id: evidencePhoto, purpose: 'review_evidence', session: null, admin: reviewer.id, state: 'ready' },
        { id: foreignEvidencePhoto, purpose: 'review_evidence', session: null, admin: String(otherAdmin.id), state: 'ready' },
        { id: stagingEvidence, purpose: 'review_evidence', session: null, admin: reviewer.id, state: 'staging' },
      ]) await execute(sql`INSERT INTO photos (id, region_id, purpose, owner_session_hash, owner_admin_id, image_hash, upload_state)
        VALUES (${photo.id}, ${run}, ${photo.purpose}, ${photo.session}, ${photo.admin}, ${imageHash}, ${photo.state})`)
    })

    await t.test('first verification publishes a strict independent snapshot and invalidates old personal confirmation', async () => {
      const report = await confirmPersonal(await makeReport('first-verify'))
      const before = await counts(report.id)
      const input = { action: 'verify', extraEvidence: fieldEvidence(), publicAvoidGeometry: geometry }
      const key = `${run}-first-verify`
      const verified = await review(report, input, key)
      assert.equal(verified.result.status, 'verified')
      assert.equal(verified.result.publicRevision, 1)
      assert.equal(verified.result.personalAvoidance?.active, false)
      assert.equal(verified.result.publicActivity, 'active')
      const after = await counts(report.id)
      assert.equal(after.hazardVersion, before.hazardVersion + 1)
      assert.equal(after.personalVersion, before.personalVersion + 1)
      assert.equal(after.otherVersion, before.otherVersion)
      assert.equal(after.events, before.events + 1)
      const publicReport = await hazards.get({ reportId: report.id, ownerSessionHash: otherOwner })
      assert.ok(!('rowVersion' in publicReport))
      assert.equal(publicReport.publicVerification?.source, 'admin_field_check')
      const serialized = JSON.stringify(publicReport)
      for (const privateValue of [photoId, evidencePhoto, owner, reviewer.id, 'extraEvidence']) {
        if (privateValue === reviewer.id) continue
        assert.ok(!serialized.includes(privateValue))
      }
      const a = await business.getEffectiveAvoidances({ regionId: run, ownerSessionHash: owner, now: new Date(clock) })
      const b = await business.getEffectiveAvoidances({ regionId: run, ownerSessionHash: otherOwner, now: new Date(clock) })
      assert.deepEqual(a.publicAvoidances, b.publicAvoidances)
      assert.ok(b.publicAvoidances.some((item) => item.id === report.id))
      assert.ok(!a.personalAvoidances.some((item) => item.id === report.id))
      assert.deepEqual(await review(report, input, key), { replayed: true, result: verified.result })
      assert.deepEqual(await counts(report.id), after)
      await assert.rejects(review(report, { ...input, reason: 'A different reason.' }, key), code('IDEMPOTENCY_CONFLICT'))
      const event = await payload.find({ collection: 'report-events', where: { and: [{ reportId: { equals: report.id } }, { action: { equals: 'verify' } }] }, limit: 1, overrideAccess: true })
      assert.equal(event.docs[0].actorId, reviewer.id)
      assert.ok(JSON.stringify(event.docs[0].after).includes(evidencePhoto))
      assert.ok(JSON.stringify(event.docs[0].after).includes('verifiedBy'))
    })

    await t.test('reverification and public-only correction preserve a legal personal binding and public isolation', async () => {
      let report = await confirmPersonal(await publish('reverify'))
      const before = await counts(report.id)
      const oldGeometry = fingerprint(report.personalAvoidance?.avoidGeometry)
      report = (await review(report, { action: 'verify', extraEvidence: fieldEvidence(), publicAvoidGeometry: geometry })).result
      assert.equal(report.personalAvoidance?.active, true)
      assert.equal(report.personalAvoidance?.effective, true)
      assert.equal(report.personalAvoidance?.confirmationReportVersion, report.rowVersion)
      assert.equal(report.publicRevision, 2)
      assert.equal((await counts(report.id)).personalVersion, before.personalVersion + 1)
      report = (await review(report, { action: 'correct', publicAvoidGeometry: widerGeometry, extraEvidence: fieldEvidence() })).result
      assert.equal(report.publicRevision, 3)
      assert.equal(report.personalAvoidance?.effective, true)
      assert.equal(report.personalAvoidance?.confirmationReportVersion, report.rowVersion)
      assert.equal(fingerprint(report.personalAvoidance?.avoidGeometry), oldGeometry)
      const publicBefore = evaluateContext(await business.getEffectiveAvoidances({ regionId: run, ownerSessionHash: otherOwner, now: new Date(clock) }), clock).publicDigest
      const hazardsBefore = (await counts(report.id)).hazardVersion
      await hazards.deactivate({ ownerSessionHash: owner, reportId: report.id, idempotencyKey: randomUUID(), input: { expectedVersion: report.rowVersion } })
      const publicAfter = evaluateContext(await business.getEffectiveAvoidances({ regionId: run, ownerSessionHash: otherOwner, now: new Date(clock) }), clock).publicDigest
      assert.equal(publicAfter, publicBefore)
      assert.equal((await counts(report.id)).hazardVersion, hazardsBefore)
    })

    await t.test('independent evidence, supported source, final geometry and validity failures leave no partial write', async () => {
      const report = await publish('invalid-review')
      const before = await counts(report.id)
      const invalid = [
        { action: 'correct', corrections: { description: 'Changed without new evidence.' } },
        { action: 'verify', extraEvidence: { ...fieldEvidence(), photoId }, publicAvoidGeometry: geometry },
        { action: 'verify', extraEvidence: { ...fieldEvidence(), photoId: foreignEvidencePhoto }, publicAvoidGeometry: geometry },
        { action: 'verify', extraEvidence: { ...fieldEvidence(), photoId: stagingEvidence }, publicAvoidGeometry: geometry },
        { action: 'verify', extraEvidence: { ...fieldEvidence(), observedAt: new Date(clock + 1).toISOString() }, publicAvoidGeometry: geometry },
        { action: 'verify', extraEvidence: { kind: 'trusted_maintainer', observedAt: new Date(clock).toISOString(), summary: 'Not approved.', sourceReference: 'https://unapproved.example.invalid/ticket' }, publicAvoidGeometry: geometry },
        { action: 'verify', extraEvidence: fieldEvidence(), publicAvoidGeometry: geometry, validUntil: new Date(clock).toISOString() },
        { action: 'verify', extraEvidence: fieldEvidence(), publicAvoidGeometry: geometry, validUntil: new Date(clock + 86400_001).toISOString() },
      ]
      for (const input of invalid) await assert.rejects(review(report, input), code('EVIDENCE_REQUIRED'))
      await assert.rejects(review(report, {
        action: 'correct', corrections: { location: [151.235, -33.917] }, extraEvidence: fieldEvidence(),
      }), code('INVALID_GEOMETRY'))
      await assert.rejects(review(report, { action: 'correct', corrections: { description: report.description }, extraEvidence: fieldEvidence() }), code('INVALID_INPUT'))
      assert.deepEqual(await counts(report.id), before)
      const trusted = createReviewService(payload, { ...serviceOptions, trustedMaintainerReferences: ['maintenance-fixture-123'] })
      const approved = await trusted.review({ actor: reviewer, reportId: report.id, idempotencyKey: randomUUID(), input: {
        expectedVersion: report.rowVersion, action: 'verify', reason: 'Synthetic approved maintainer record.',
        extraEvidence: { kind: 'trusted_maintainer', observedAt: new Date(clock).toISOString(), summary: 'Synthetic fixture reference.', sourceReference: 'maintenance-fixture-123' }, publicAvoidGeometry: geometry,
      } })
      assert.equal(approved.result.publicVerification?.source, 'trusted_maintainer')
      assert.ok(!JSON.stringify(await hazards.get({ reportId: report.id, ownerSessionHash: otherOwner })).includes('maintenance-fixture-123'))
    })

    await t.test('private rejection and reopening never publish a report or revive old confirmation', async () => {
      let report = await confirmPersonal(await makeReport('reject-private'))
      const before = await counts(report.id)
      report = (await review(report, { action: 'reject' })).result
      assert.equal(report.status, 'rejected')
      assert.equal(report.publicRevision, null)
      assert.equal(report.personalAvoidance?.active, false)
      assert.equal((await counts(report.id)).hazardVersion, before.hazardVersion)
      await assert.rejects(hazards.get({ reportId: report.id, ownerSessionHash: otherOwner }), code('NOT_FOUND'))
      report = (await review(report, { action: 'reopen' })).result
      assert.equal(report.status, 'pending')
      assert.equal(report.personalAvoidance?.active, false)
      assert.equal(report.publicRevision, null)
      assert.equal((await counts(report.id)).hazardVersion, before.hazardVersion)
    })

    await t.test('expiry is not resolution; historical independent closure, inactive correction and withdrawal keep publication history', async () => {
      let report = await confirmPersonal(await publish('resolve-history'))
      clock += 86400_001
      const expired = await hazards.get({ reportId: report.id, ownerSessionHash: otherOwner })
      assert.equal(expired.status, 'verified')
      assert.equal(expired.publicActivity, 'expired')
      await assert.rejects(review(report, { action: 'resolve' }), code('EVIDENCE_REQUIRED'))
      report = (await review(report, {
        action: 'resolve', extraEvidence: { kind: 'field_observation', observedAt: '2030-01-01T00:00:00.000Z', summary: 'Explicit synthetic historical closure evidence, not inferred from expiry.' },
      })).result
      assert.equal(report.status, 'resolved')
      assert.equal(report.publicActivity, 'inactive')
      assert.equal(report.publicVerification?.resolvedAt, new Date(clock).toISOString())
      assert.equal(report.personalAvoidance?.active, false)
      let before = await counts(report.id)
      const revision = report.publicRevision
      assert.ok(revision)
      report = (await review(report, { action: 'correct', corrections: { description: 'Corrected inactive published record.' } })).result
      assert.equal(report.status, 'resolved')
      assert.equal(report.publicRevision, revision + 1)
      assert.equal((await counts(report.id)).hazardVersion, before.hazardVersion + 1)
      await assert.rejects(review(report, { action: 'correct', publicAvoidGeometry: widerGeometry }), code('INVALID_INPUT'))
      report = (await review(report, { action: 'reopen' })).result
      assert.equal(report.status, 'pending')
      assert.equal(report.personalAvoidance?.active, false)
      await assert.rejects(hazards.get({ reportId: report.id, ownerSessionHash: otherOwner }), code('NOT_FOUND'))
      before = await counts(report.id)
      const withdrawnRevision = report.publicRevision
      report = (await review(report, { action: 'correct', corrections: { description: 'Private correction after withdrawal.' } })).result
      assert.equal(report.publicRevision, withdrawnRevision)
      assert.equal((await counts(report.id)).hazardVersion, before.hazardVersion)
      report = (await review(report, { action: 'verify', extraEvidence: fieldEvidence(), publicAvoidGeometry: geometry })).result
      assert.equal(report.status, 'verified')
      assert.ok(report.publicRevision && withdrawnRevision && report.publicRevision > withdrawnRevision)
      assert.equal(report.personalAvoidance?.active, false)
    })

    await t.test('disabled and forged administrators cannot mutate or replay a prior successful result', async () => {
      const report = await makeReport('authorization')
      const body = { action: 'correct', corrections: { description: 'An authorized private correction.' } }
      const key = `${run}-authorization`
      const original = await review(report, body, key)
      const before = await counts(report.id)
      await assert.rejects(review(original.result, { action: 'reject' }, randomUUID(), { id: reviewer.id, role: 'operator' }), code('FORBIDDEN'))
      await assert.rejects(review(original.result, { action: 'reject' }, randomUUID(), { id: 'not-an-admin', role: 'report_admin' }), code('FORBIDDEN'))
      await payload.update({ collection: 'admins', id: reviewerId, data: { enabled: false }, overrideAccess: true, req: operatorReq })
      try { await assert.rejects(review(report, body, key), code('FORBIDDEN')) }
      finally { await payload.update({ collection: 'admins', id: reviewerId, data: { enabled: true }, overrideAccess: true, req: operatorReq }) }
      assert.deepEqual(await review(report, body, key), { replayed: true, result: original.result })
      const otherRegion = createReviewService(payload, { ...serviceOptions, regionId: `${run}-unconfigured-region` })
      await assert.rejects(otherRegion.review({ actor: reviewer, reportId: report.id, idempotencyKey: key, input: { expectedVersion: report.rowVersion, reason: 'Synthetic C2 verification scenario.', ...body } }), code('NOT_FOUND'))
      assert.deepEqual(await counts(report.id), before)
      assert.equal((await review(original.result, { action: 'reject' }, randomUUID(), operatorActor)).result.status, 'rejected')
    })

    await t.test('competing review versions serialize and an audit failure rolls every scope and idempotency result back', async () => {
      const report = await makeReport('concurrency')
      const before = await counts(report.id)
      const input = { action: 'verify', extraEvidence: fieldEvidence(), publicAvoidGeometry: geometry }
      const outcomes = await Promise.allSettled([review(report, input), review(report, input)])
      assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1)
      const rejected = outcomes.find((result) => result.status === 'rejected')
      assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof AppError && rejected.reason.code === 'VERSION_CONFLICT')
      assert.equal((await counts(report.id)).hazardVersion, before.hazardVersion + 1)
      assert.equal((await counts(report.id)).events, before.events + 1)
      const rollback = await confirmPersonal(await makeReport('rollback'))
      const rollbackBefore = await counts(rollback.id)
      const hooks = payload.collections['report-events'].config.hooks
      const previous = hooks.beforeChange ?? []
      const failAudit: CollectionBeforeChangeHook = ({ data }) => {
        if (data.reportId === rollback.id && data.action === 'verify') throw new Error('Deliberate C2 review audit failure')
        return data
      }
      hooks.beforeChange = [...previous, failAudit]
      const key = `${run}-rollback-review`
      try { await assert.rejects(review(rollback, input, key), /Deliberate C2 review audit failure/) }
      finally { hooks.beforeChange = previous }
      assert.deepEqual(await counts(rollback.id), rollbackBefore)
      const current = await hazards.get({ reportId: rollback.id, ownerSessionHash: owner })
      assert.ok('rowVersion' in current)
      assert.equal(current.rowVersion, rollback.rowVersion)
      assert.equal(current.publicRevision, null)
      assert.equal(current.personalAvoidance?.effective, true)
      assert.equal((await review(rollback, input, key)).replayed, false)
    })

    await t.test('a legal region reduction preserves historical reads, resolution, reopening and private corrections', async () => {
      let report = await confirmPersonal(await publish('historical-coverage'))
      clock += 86400_001
      const administration = createAdminRegionService(payload, { regionId: run, now: () => clock })
      const previous = await administration.get({ actor: operatorActor })
      const changed = await administration.patch({
        actor: operatorActor, idempotencyKey: `${run}-reduce-coverage`, input: {
          expectedVersion: previous.region.configVersion, reason: 'Synthetic legal coverage reduction after all old ranges expired.',
          changes: {
            bbox: [151.232, -33.92, 151.238, -33.912],
            presetPassages: [{ name: 'Replacement synthetic passage', geometry: { type: 'LineString', coordinates: [[151.234, -33.917], [151.236, -33.917]] } }],
          },
        },
      })
      assert.equal(changed.result.region.configVersion, previous.region.configVersion + 1)
      const historical = await hazards.get({ reportId: report.id, ownerSessionHash: owner })
      assert.ok('rowVersion' in historical)
      assert.equal(historical.personalAvoidance?.effective, false)
      assert.deepEqual(historical.personalAvoidance?.avoidGeometry, report.personalAvoidance?.avoidGeometry)
      const historicalPublic = await hazards.get({ reportId: report.id, ownerSessionHash: otherOwner })
      assert.equal(historicalPublic.status, 'verified')
      assert.equal(historicalPublic.publicActivity, 'expired')
      report = (await review(report, { action: 'resolve', extraEvidence: fieldEvidence() })).result
      assert.equal(report.status, 'resolved')
      assert.equal(report.personalAvoidance?.active, false)
      report = (await review(report, { action: 'reopen' })).result
      assert.equal(report.status, 'pending')
      const before = await counts(report.id)
      const revision = report.publicRevision
      report = (await review(report, {
        action: 'correct', corrections: { description: 'Updated historical facts outside the replacement coverage.', category: 'other', observedAt: new Date(clock).toISOString() },
      })).result
      assert.equal(report.publicRevision, revision)
      assert.equal((await counts(report.id)).hazardVersion, before.hazardVersion)
      assert.equal(report.personalAvoidance?.effective, false)
      assert.equal((await hazards.get({ reportId: report.id, ownerSessionHash: owner })).description, report.description)
      await assert.rejects(hazards.get({ reportId: report.id, ownerSessionHash: otherOwner }), code('NOT_FOUND'))
      const final = await counts(report.id)
      await assert.rejects(review(report, { action: 'verify', extraEvidence: fieldEvidence(), publicAvoidGeometry: geometry }), code('OUT_OF_COVERAGE'))
      await assert.rejects(review(report, { action: 'correct', corrections: { location: facts().location } }), code('OUT_OF_COVERAGE'))
      assert.deepEqual(await counts(report.id), final)
    })
  } finally { await payload.destroy() }
})
