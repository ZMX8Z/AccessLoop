import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import { sql } from '@payloadcms/db-postgres'
import type { CollectionBeforeChangeHook } from 'payload'

import { createHazardService } from '../src/features/hazards/server/service'
import { AppError } from '../src/server/http/errors'
import { createBusinessRepository } from '../src/server/storage/business-repository'
import { contextId } from '../src/server/storage/sessions'
import { withTransaction } from '../src/server/storage/transaction'
import type { PrivateReportDTO } from '../src/shared/contracts/hazards'
import { AnalysisDTOSchema } from '../src/shared/contracts/vision'
import { dRoutingFixture } from '../src/shared/fixtures/d-routing'

test('C1 report and personal avoidance commands use real PostgreSQL transactions without external services', {
  skip: process.env.ACCESSLOOP_STORAGE_TESTS !== '1', timeout: 120_000,
}, async (t) => {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const business = createBusinessRepository(payload)
  const runId = `hazards-${randomUUID()}`
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  const ownerA = hash(`${runId}:a`)
  const ownerB = hash(`${runId}:b`)
  const region = { ...dRoutingFixture.region, id: runId }
  const passage = { ...dRoutingFixture.passages[0], id: `${runId}-passage` }
  const passageRef = { presetPassageId: passage.id, passageVersion: 1 }
  const photoA = `${runId}-photo-a`
  const photoB = `${runId}-photo-b`
  const photoNext = `${runId}-photo-next`
  const photoStaging = `${runId}-photo-staging`
  const photoReview = `${runId}-photo-review`
  const imageHash = `sha256:${hash(runId)}`
  const visionConfig = { model: 'glm-4.6v', promptVersion: '1', schemaVersion: '1' }
  let clock = Date.parse('2032-01-01T00:00:00.000Z')
  const service = createHazardService(payload, {
    regionId: runId, sessionSecret: 'synthetic-hazards-secret-at-least-32-bytes', visionConfig, now: () => clock,
  })
  const facts = () => ({
    photoId: photoA, location: [151.2295, -33.917], category: 'construction',
    description: 'A synthetic barrier crosses the fixture passage.', observedAt: new Date(clock).toISOString(), passage: passageRef,
  })
  const errorCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code
  const create = async (suffix: string, extra: object = {}) => (await service.create({
    ownerSessionHash: ownerA, idempotencyKey: `${runId}-${suffix}`, input: { ...facts(), ...extra },
  })).result
  const getPrivate = async (id: string): Promise<PrivateReportDTO> => {
    const result = await service.get({ reportId: id, ownerSessionHash: ownerA })
    assert.ok('rowVersion' in result)
    return result
  }
  const counts = async () => ({
    personal: (await payload.findByID({ collection: 'session-contexts', id: contextId(runId, ownerA), overrideAccess: true })).personalVersion,
    public: (await business.requireRegion(runId)).hazardVersion,
    events: (await payload.count({ collection: 'report-events', where: { actorId: { equals: ownerA } }, overrideAccess: true })).totalDocs,
  })
  const eventCount = async (reportId: string) => (await payload.count({
    collection: 'report-events', where: { reportId: { equals: reportId } }, overrideAccess: true,
  })).totalDocs
  async function seedAnalysis(suffix: string, outcome: object, overrides: object = {}) {
    const id = `${runId}-${suffix}`
    const analysis = AnalysisDTOSchema.parse({
      analysisId: id, photoId: photoA, ...visionConfig, createdAt: new Date(clock).toISOString(), cacheHit: false, ...outcome, ...overrides,
    })
    await payload.create({
      collection: 'ai-analyses', data: { id, regionId: runId, ownerSessionHash: ownerA, photoId: photoA, imageHash, cacheKey: hash(id), analysis }, overrideAccess: true,
    })
    return id
  }

  try {
    await business.ensureSession(ownerA)
    await business.ensureSession(ownerB)
    await business.seedRegion({ region, presetPassages: [passage], source: { kind: 'synthetic', note: 'C1 database behavior fixture only, no file upload, survey or external AI.' } })
    await business.ensureSessionContext(runId, ownerA)
    await business.ensureSessionContext(runId, ownerB)
    // Evidence metadata only. Never call an OSS upload hook or pretend these rows prove file storage.
    await withTransaction(payload, async ({ execute }) => {
      for (const item of [
        { id: photoA, owner: ownerA, state: 'ready', purpose: 'report' },
        { id: photoB, owner: ownerB, state: 'ready', purpose: 'report' },
        { id: photoNext, owner: ownerA, state: 'ready', purpose: 'report' },
        { id: photoStaging, owner: ownerA, state: 'staging', purpose: 'report' },
        { id: photoReview, owner: ownerA, state: 'ready', purpose: 'review_evidence' },
      ]) await execute(sql`INSERT INTO photos (id, region_id, owner_session_hash, purpose, upload_state, image_hash, filename, mime_type)
        VALUES (${item.id}, ${runId}, ${item.owner}, ${item.purpose}, ${item.state}, ${imageHash}, ${`${item.id}.png`}, 'image/png')`)
    })

    await t.test('private creation replays before version checks and never activates avoidance or public disclosure', async () => {
      const input = { ownerSessionHash: ownerA, idempotencyKey: `${runId}-create-replay`, input: facts() }
      const before = await counts()
      const results = await Promise.all([service.create(input), service.create(input)])
      assert.equal(results.filter((value) => value.replayed).length, 1)
      assert.deepEqual(results[0].result, results[1].result)
      const report = results[0].result
      assert.equal(report.rowVersion, 1)
      assert.equal(report.status, 'pending')
      assert.equal(report.personalAvoidance, null)
      assert.equal(report.publicRevision, null)
      assert.equal((await counts()).personal, before.personal + 1)
      assert.equal((await counts()).public, before.public)
      assert.equal(await eventCount(report.id), 1)
      await assert.rejects(service.create({ ...input, input: { ...facts(), description: 'Different content' } }), errorCode('IDEMPOTENCY_CONFLICT'))
      await assert.rejects(service.get({ reportId: report.id, ownerSessionHash: ownerB }), errorCode('NOT_FOUND'))
      await assert.rejects(service.get({ reportId: report.id }), errorCode('NOT_FOUND'))
      assert.deepEqual((await service.list({ scope: 'mine', ownerSessionHash: ownerB })).items, [])
      assert.deepEqual((await service.list({ scope: 'public' })).items, [])
      await assert.rejects(service.list({ scope: 'mine' }), errorCode('UNAUTHENTICATED'))
    })

    await t.test('report idempotency cannot replay results from another configured region', async () => {
      const idempotencyKey = `${runId}-cross-region`
      const input = facts()
      const original = await service.create({ ownerSessionHash: ownerA, idempotencyKey, input })
      const otherRegionId = `${runId}-other-region`
      const otherPassage = { ...passage, id: `${otherRegionId}-passage` }
      await business.seedRegion({
        region: { ...region, id: otherRegionId }, presetPassages: [otherPassage],
        source: { kind: 'synthetic', note: 'A second configured region for idempotency isolation only.' },
      })
      const otherService = createHazardService(payload, {
        regionId: otherRegionId, sessionSecret: 'synthetic-hazards-secret-at-least-32-bytes', visionConfig, now: () => clock,
      })
      await assert.rejects(otherService.create({ ownerSessionHash: ownerA, idempotencyKey, input }), errorCode('NOT_FOUND'))
      const otherPhoto = `${otherRegionId}-photo`
      await withTransaction(payload, ({ execute }) => execute(sql`
        INSERT INTO photos (id, region_id, owner_session_hash, purpose, upload_state, image_hash, filename, mime_type)
        VALUES (${otherPhoto}, ${otherRegionId}, ${ownerA}, 'report', 'ready', ${imageHash}, ${`${otherPhoto}.png`}, 'image/png')
      `))
      const independent = await otherService.create({
        ownerSessionHash: ownerA, idempotencyKey,
        input: { ...input, photoId: otherPhoto, passage: { presetPassageId: otherPassage.id, passageVersion: 1 } },
      })
      assert.equal(independent.replayed, false)
      assert.equal(independent.result.regionId, otherRegionId)
      assert.notEqual(independent.result.id, original.result.id)
      assert.deepEqual((await service.create({ ownerSessionHash: ownerA, idempotencyKey, input })).result, original.result)
    })

    await t.test('photo ownership, readiness, purpose and current analysis configuration are enforced', async () => {
      for (const [suffix, photoId] of [['other', photoB], ['staging', photoStaging], ['review', photoReview]]) {
        await assert.rejects(create(`bad-photo-${suffix}`, { photoId }), errorCode('NOT_FOUND'))
      }
      const result = { image_quality: 'usable', hazard_present: true, category: 'construction', visible_passage: 'blocked', description: 'A synthetic barrier is visible.', evidence: ['A barrier spans the path.'], uncertainties: [] }
      const completed = await seedAnalysis('analysis-completed', { aiStatus: 'completed', result, unavailableReason: null })
      const unavailable = await seedAnalysis('analysis-unavailable', { aiStatus: 'unavailable', result: null, unavailableReason: 'provider_unavailable' })
      const uncertain = await seedAnalysis('analysis-uncertain', { aiStatus: 'uncertain', result: { ...result, hazard_present: null }, unavailableReason: null })
      const old = await seedAnalysis('analysis-old', { aiStatus: 'completed', result, unavailableReason: null }, { promptVersion: 'old' })
      assert.equal((await create('with-completed', { analysisId: completed })).status, 'ai_assessed')
      assert.equal((await create('with-unavailable', { analysisId: unavailable })).status, 'pending')
      assert.equal((await create('with-uncertain', { analysisId: uncertain })).status, 'pending')
      await assert.rejects(create('with-stale', { analysisId: old }), errorCode('ANALYSIS_STALE'))
      await assert.rejects(create('with-mismatched-photo', { photoId: photoNext, analysisId: completed }), errorCode('NOT_FOUND'))
      const aiReport = await create('ai-user-facts', { analysisId: completed })
      const corrected = await service.update({
        ownerSessionHash: ownerA, reportId: aiReport.id, idempotencyKey: `${runId}-correct-ai-facts`,
        input: { expectedVersion: 1, description: 'The author supplies a separate correction.' },
      })
      assert.equal(corrected.result.status, 'ai_assessed')
      assert.equal(corrected.result.analysis?.result?.description, result.description)
      assert.notEqual(corrected.result.description, corrected.result.analysis?.result?.description)
      const input = { expectedVersion: 2, observedAt: new Date(clock).toISOString(), passage: passageRef }
      const preview = await service.preview({ ownerSessionHash: ownerA, reportId: aiReport.id, input })
      const confirmed = await service.confirm({
        ownerSessionHash: ownerA, reportId: aiReport.id, idempotencyKey: `${runId}-confirm-ai`,
        input: { ...input, previewDigest: preview.previewDigest, consent: true },
      })
      assert.equal(confirmed.result.personalAvoidance?.decisionSource, 'ai_user_confirmed')
      assert.equal(AnalysisDTOSchema.parse((await payload.findByID({ collection: 'ai-analyses', id: completed, overrideAccess: true })).analysis).result?.description, result.description)
      const detached = await service.update({
        ownerSessionHash: ownerA, reportId: aiReport.id, idempotencyKey: `${runId}-detach-analysis`,
        input: { expectedVersion: 3, analysisId: null },
      })
      assert.equal(detached.result.status, 'pending')
      assert.equal(detached.result.analysis, null)
      assert.equal(detached.result.personalAvoidance?.active, false)
      assert.equal(detached.result.personalAvoidance?.effective, false)
      assert.equal(detached.result.personalAvoidance?.confirmationReportVersion, 3)
    })

    await t.test('preview is read-only; explicit confirmation is atomic, private and replayable', async () => {
      const report = await create('preview-confirm')
      const input = { expectedVersion: report.rowVersion, observedAt: new Date(clock).toISOString(), passage: passageRef }
      const before = await counts()
      const events = await eventCount(report.id)
      const preview = await service.preview({ ownerSessionHash: ownerA, reportId: report.id, input })
      assert.equal(Date.parse(preview.expiresAt), clock + 300_000)
      assert.equal(Date.parse(preview.validUntil), clock + 3_600_000)
      assert.deepEqual(await counts(), before)
      assert.equal(await eventCount(report.id), events)
      const command = { ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-confirm`, input: { ...input, previewDigest: preview.previewDigest, consent: true } }
      await assert.rejects(service.confirm({ ...command, input: { ...command.input, consent: false } }), errorCode('CONFIRMATION_REQUIRED'))
      await assert.rejects(service.confirm({ ...command, input: { ...command.input, previewDigest: 'forged' } }), errorCode('PREVIEW_STALE'))
      assert.deepEqual(await counts(), before)
      const confirmed = await service.confirm(command)
      assert.equal(confirmed.result.rowVersion, 2)
      assert.equal(confirmed.result.status, 'pending')
      assert.equal(confirmed.result.personalAvoidance?.active, true)
      assert.equal(confirmed.result.personalAvoidance?.effective, true)
      assert.equal(confirmed.result.personalAvoidance?.confirmationReportVersion, 2)
      assert.equal(confirmed.result.personalAvoidance?.decisionSource, 'user_manual')
      assert.equal((await counts()).personal, before.personal + 1)
      assert.equal((await counts()).public, before.public)
      assert.equal(await eventCount(report.id), events + 1)
      assert.deepEqual(await service.confirm(command), { replayed: true, result: confirmed.result })
      const a = await business.getEffectiveAvoidances({ regionId: runId, ownerSessionHash: ownerA, now: new Date(clock) })
      const b = await business.getEffectiveAvoidances({ regionId: runId, ownerSessionHash: ownerB, now: new Date(clock) })
      assert.ok(a.personalAvoidances.some((value) => value.id === report.id))
      assert.equal(b.personalAvoidances.length, 0)
    })

    await t.test('fact-only edits preserve a valid confirmation binding; observation and photo changes invalidate it', async () => {
      const report = await create('edit-confirmation')
      const input = { expectedVersion: 1, observedAt: new Date(clock).toISOString(), passage: passageRef }
      const preview = await service.preview({ ownerSessionHash: ownerA, reportId: report.id, input })
      await service.confirm({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-edit-confirm`, input: { ...input, previewDigest: preview.previewDigest, consent: true } })
      const corrected = await service.update({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-fact-only`, input: { expectedVersion: 2, description: 'The author corrected this description.' } })
      assert.equal(corrected.result.rowVersion, 3)
      assert.equal(corrected.result.personalAvoidance?.effective, true)
      assert.equal(corrected.result.personalAvoidance?.confirmationReportVersion, 3)
      const changedTime = await service.update({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-changed-time`, input: { expectedVersion: 3, observedAt: new Date(clock - 1000).toISOString() } })
      assert.equal(changedTime.result.personalAvoidance?.active, false)
      assert.equal(changedTime.result.personalAvoidance?.effective, false)
      await assert.rejects(service.update({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-missing-analysis`, input: { expectedVersion: 4, photoId: photoNext } }), errorCode('INVALID_INPUT'))
      const changedPhoto = await service.update({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-changed-photo`, input: { expectedVersion: 4, photoId: photoNext, analysisId: null } })
      assert.equal(changedPhoto.result.photoId, photoNext)
      assert.equal(changedPhoto.result.analysis, null)
      assert.equal(changedPhoto.result.status, 'pending')
      await assert.rejects(service.update({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-nothing-changed`, input: { expectedVersion: 5, photoId: photoNext } }), errorCode('INVALID_INPUT'))
    })

    await t.test('deactivation without an active confirmation does not add versions or audit events', async () => {
      const report = await create('noop-deactivate')
      const before = await counts()
      const result = await service.deactivate({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-noop-off`, input: { expectedVersion: 1 } })
      assert.equal(result.result.rowVersion, 1)
      assert.deepEqual(await counts(), before)
      assert.equal(await eventCount(report.id), 1)
    })

    await t.test('renewal updates only personal observation time and deactivation preserves original report facts', async () => {
      const report = await create('renew')
      const originalObservedAt = report.observedAt
      let input = { expectedVersion: 1, observedAt: originalObservedAt, passage: passageRef }
      let preview = await service.preview({ ownerSessionHash: ownerA, reportId: report.id, input })
      await service.confirm({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-renew-first`, input: { ...input, previewDigest: preview.previewDigest, consent: true } })
      clock += 1000
      input = { ...input, expectedVersion: 2, observedAt: new Date(clock).toISOString() }
      preview = await service.preview({ ownerSessionHash: ownerA, reportId: report.id, input })
      const renewed = await service.confirm({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-renew-second`, input: { ...input, previewDigest: preview.previewDigest, consent: true } })
      assert.equal(renewed.result.observedAt, originalObservedAt)
      assert.equal(renewed.result.personalAvoidance?.observedAt, input.observedAt)
      assert.equal(renewed.result.personalAvoidance?.confirmationReportVersion, 3)
      const off = await service.deactivate({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-off`, input: { expectedVersion: 3 } })
      assert.equal(off.result.rowVersion, 4)
      assert.equal(off.result.personalAvoidance?.active, false)
      assert.equal(off.result.observedAt, originalObservedAt)
      const before = await counts()
      await service.deactivate({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-off-again`, input: { expectedVersion: 4 } })
      assert.deepEqual(await counts(), before)
      await assert.rejects(service.deactivate({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-off-stale`, input: { expectedVersion: 3 } }), errorCode('VERSION_CONFLICT'))
    })

    await t.test('tokens bind observation time, session and report version and cannot outlive route references', async () => {
      const report = await create('token-binding')
      const input = { expectedVersion: 1, observedAt: new Date(clock).toISOString(), passage: passageRef }
      const preview = await service.preview({ ownerSessionHash: ownerA, reportId: report.id, input })
      await assert.rejects(service.confirm({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-alter-time`, input: { ...input, observedAt: new Date(clock - 500).toISOString(), previewDigest: preview.previewDigest, consent: true } }), errorCode('PREVIEW_STALE'))
      await assert.rejects(service.preview({ ownerSessionHash: ownerB, reportId: report.id, input }), errorCode('NOT_FOUND'))
      await service.update({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-change-version`, input: { expectedVersion: 1, description: 'Changed after preview.' } })
      await assert.rejects(service.confirm({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-old-preview`, input: { ...input, previewDigest: preview.previewDigest, consent: true } }), errorCode('VERSION_CONFLICT'))
      const routeId = `${runId}-route-short`
      await payload.create({ collection: 'route-snapshots', data: {
        id: routeId, regionId: runId, ownerSessionHash: ownerA, geometry: passage.geometry,
        context: { hazardVersion: 0, personalVersion: 0, configVersion: 1, activeDigest: 'synthetic' }, expiresAt: new Date(clock + 1000).toISOString(),
      }, overrideAccess: true })
      const routeInput = { expectedVersion: 2, observedAt: new Date(clock).toISOString(), passage: { routeRef: routeId, startIndex: 0, endIndex: 1 } }
      const short = await service.preview({ ownerSessionHash: ownerA, reportId: report.id, input: routeInput })
      assert.equal(Date.parse(short.expiresAt), clock + 1000)
      clock += 1000
      await assert.rejects(service.confirm({ ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-expired-route`, input: { ...routeInput, previewDigest: short.previewDigest, consent: true } }), errorCode('PREVIEW_STALE'))
    })

    await t.test('a preview expiring during database writes rolls back confirmation, versions, audit and idempotency', async () => {
      const report = await create('expires-during-write')
      const routeId = `${runId}-route-during-write`
      await payload.create({ collection: 'route-snapshots', data: {
        id: routeId, regionId: runId, ownerSessionHash: ownerA, geometry: passage.geometry,
        context: { hazardVersion: 0, personalVersion: 0, configVersion: 1, activeDigest: 'synthetic' },
        expiresAt: new Date(clock + 1000).toISOString(),
      }, overrideAccess: true })
      const input = { expectedVersion: 1, observedAt: new Date(clock).toISOString(), passage: { routeRef: routeId, startIndex: 0, endIndex: 1 } }
      const preview = await service.preview({ ownerSessionHash: ownerA, reportId: report.id, input })
      const before = await counts()
      const hooks = payload.collections['report-events'].config.hooks
      const previous = hooks.beforeChange ?? []
      const crossDeadline: CollectionBeforeChangeHook = ({ data }) => {
        if (data.reportId === report.id && data.action === 'confirm_avoidance') clock += 2000
        return data
      }
      hooks.beforeChange = [...previous, crossDeadline]
      try {
        await assert.rejects(service.confirm({
          ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-expires-during-write-confirm`,
          input: { ...input, previewDigest: preview.previewDigest, consent: true },
        }), errorCode('PREVIEW_STALE'))
      } finally { hooks.beforeChange = previous }
      assert.deepEqual(await counts(), before)
      const current = await getPrivate(report.id)
      assert.equal(current.rowVersion, 1)
      assert.equal(current.personalAvoidance, null)
      assert.equal(await eventCount(report.id), 1)
      const freshInput = { expectedVersion: 1, observedAt: new Date(clock).toISOString(), passage: passageRef }
      const freshPreview = await service.preview({ ownerSessionHash: ownerA, reportId: report.id, input: freshInput })
      const retried = await service.confirm({
        ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-expires-during-write-confirm`,
        input: { ...freshInput, previewDigest: freshPreview.previewDigest, consent: true },
      })
      assert.equal(retried.replayed, false)
      assert.equal(retried.result.rowVersion, 2)
    })

    await t.test('competing confirmations commit exactly once and a failed audit rolls all business writes back', async () => {
      const report = await create('concurrent')
      const input = { expectedVersion: 1, observedAt: new Date(clock).toISOString(), passage: passageRef }
      const preview = await service.preview({ ownerSessionHash: ownerA, reportId: report.id, input })
      const before = await counts()
      const outcomes = await Promise.allSettled([0, 1].map((number) => service.confirm({
        ownerSessionHash: ownerA, reportId: report.id, idempotencyKey: `${runId}-competing-${number}`,
        input: { ...input, previewDigest: preview.previewDigest, consent: true },
      })))
      assert.equal(outcomes.filter((value) => value.status === 'fulfilled').length, 1)
      const failure = outcomes.find((value) => value.status === 'rejected')
      assert.ok(failure?.status === 'rejected' && failure.reason instanceof AppError && failure.reason.code === 'VERSION_CONFLICT')
      assert.equal((await counts()).personal, before.personal + 1)
      assert.equal(await eventCount(report.id), 2)

      const rollbackReport = await create('rollback')
      const rollbackInput = { expectedVersion: 1, observedAt: new Date(clock).toISOString(), passage: passageRef }
      const rollbackPreview = await service.preview({ ownerSessionHash: ownerA, reportId: rollbackReport.id, input: rollbackInput })
      const command = { ownerSessionHash: ownerA, reportId: rollbackReport.id, idempotencyKey: `${runId}-rollback-confirm`, input: { ...rollbackInput, previewDigest: rollbackPreview.previewDigest, consent: true } }
      const beforeRollback = await counts()
      const hooks = payload.collections['report-events'].config.hooks
      const previous = hooks.beforeChange ?? []
      const failAudit: CollectionBeforeChangeHook = ({ data }) => {
        if (data.reportId === rollbackReport.id && data.action === 'confirm_avoidance') throw new Error('Deliberate C1 audit rollback probe')
        return data
      }
      hooks.beforeChange = [...previous, failAudit]
      try { await assert.rejects(service.confirm(command), /Deliberate C1 audit rollback probe/) }
      finally { hooks.beforeChange = previous }
      assert.deepEqual(await counts(), beforeRollback)
      assert.equal((await getPrivate(rollbackReport.id)).rowVersion, 1)
      assert.equal((await getPrivate(rollbackReport.id)).personalAvoidance, null)
      assert.equal(await eventCount(rollbackReport.id), 1)
      const retry = await service.confirm(command)
      assert.equal(retry.replayed, false)
      assert.equal(retry.result.rowVersion, 2)
    })
  } finally { await payload.destroy() }
})
