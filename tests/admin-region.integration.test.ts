import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { sql } from '@payloadcms/db-postgres'
import type { CollectionBeforeChangeHook } from 'payload'

import { createAdminRegionService } from '../src/server/admin/region-service'
import { createHazardService } from '../src/features/hazards/server/service'
import { createBusinessRepository } from '../src/server/storage/business-repository'
import { contextId } from '../src/server/storage/sessions'
import { withTransaction } from '../src/server/storage/transaction'
import { AppError } from '../src/server/http/errors'
import { fingerprint } from '../src/server/storage/value'
import { RegionAdminDTOSchema } from '../src/shared/contracts/admin-region'
import { RegionSeedSchema } from '../src/shared/contracts/storage'

const errorCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code

test('C3 region configuration uses operator authorization, complete active-data impact checks and atomic versioned commands', {
  skip: process.env.ACCESSLOOP_STORAGE_TESTS !== '1', timeout: 120_000,
}, async (t) => {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const business = createBusinessRepository(payload)
  const runId = `region-${randomUUID()}`
  const regionId = runId
  const source = RegionSeedSchema.parse(JSON.parse(await readFile(new URL('./fixtures/c0-synthetic-region.json', import.meta.url), 'utf8')))
  const seed = { ...source, region: { ...source.region, id: regionId }, presetPassages: source.presetPassages.map((passage, index) => ({ ...passage, id: `${runId}-passage-${index}` })) }
  const clock = Date.parse('2033-01-01T00:00:00Z')
  const ownerA = createHash('sha256').update(`${runId}-a`).digest('hex')
  const ownerB = createHash('sha256').update(`${runId}-b`).digest('hex')
  const email = `${runId}@example.invalid`
  const emailReviewer = `${runId}-reviewer@example.invalid`
  const service = createAdminRegionService(payload, { regionId, now: () => clock })
  const photoId = `${runId}-photo`
  const imageHash = `sha256:${'f'.repeat(64)}`
  const geometry = { type: 'Polygon', coordinates: [[[0.8, 0.8], [0.8001, 0.8], [0.8001, 0.8001], [0.8, 0.8]]] }
  const facts = (location: [number, number] = [0.8, 0.8]) => ({
    photoId, analysisId: null, location, category: 'construction', description: 'Synthetic configuration impact fixture.',
    observedAt: new Date(clock).toISOString(), passage: null,
  })

  try {
    await business.seedRegion(seed)
    await business.ensureSession(ownerA)
    await business.ensureSession(ownerB)
    await business.ensureSessionContext(regionId, ownerA)
    await business.ensureSessionContext(regionId, ownerB)
    // Trusted test-only setup: no password, real account login or external provider is involved.
    await withTransaction(payload, async ({ execute }) => {
      await execute(sql`INSERT INTO admins(email,role,enabled) VALUES (${email},'operator',true),(${emailReviewer},'report_admin',true)`)
      await execute(sql`INSERT INTO photos(id,region_id,owner_session_hash,purpose,upload_state,image_hash,filename,mime_type)
        VALUES (${photoId},${regionId},${ownerB},'report','ready',${imageHash},${`${photoId}.png`},'image/png')`)
    })
    const accounts = await payload.find({ collection: 'admins', where: { email: { in: [email, emailReviewer] } }, overrideAccess: true })
    const operator = accounts.docs.find((account) => account.email === email)
    const reviewer = accounts.docs.find((account) => account.email === emailReviewer)
    assert.ok(operator && reviewer)
    const actor = { id: String(operator.id), role: 'operator' } as const
    const reviewerActor = { id: String(reviewer.id), role: 'report_admin' } as const
    const get = async () => RegionAdminDTOSchema.parse(await service.get({ actor }))
    const countAudit = async () => (await payload.count({ collection: 'report-events', where: { reportId: { equals: `region:${regionId}` } }, overrideAccess: true })).totalDocs
    const personalVersions = async () => Promise.all([ownerA, ownerB].map(async (owner) => (await payload.findByID({ collection: 'session-contexts', id: contextId(regionId, owner), overrideAccess: true })).personalVersion))
    const patch = async (suffix: string, changes: unknown) => {
      const current = await get()
      return service.patch({ actor, idempotencyKey: `${runId}-${suffix}`, input: { expectedVersion: current.region.configVersion, reason: 'Controlled synthetic integration change.', changes } })
    }

    await t.test('only a currently enabled database operator can read or write the configuration', async () => {
      assert.equal((await get()).region.configVersion, 1)
      await assert.rejects(service.get({ actor: reviewerActor }), errorCode('FORBIDDEN'))
      await assert.rejects(service.get({ actor: { id: String(reviewer.id), role: 'operator' } }), errorCode('FORBIDDEN'))
      await assert.rejects(service.get({ actor: { id: 'not-a-database-id', role: 'operator' } }), errorCode('FORBIDDEN'))
      await assert.rejects(service.patch({ actor: reviewerActor, idempotencyKey: `${runId}-forbidden`, input: { expectedVersion: 1, reason: 'Forbidden request.', changes: { name: 'Not allowed' } } }), errorCode('FORBIDDEN'))
      assert.equal(await countAudit(), 0)
    })

    await t.test('display changes advance only configVersion and replay is authorized before cached results', async () => {
      const before = await get()
      const versions = await personalVersions()
      const input = { expectedVersion: before.region.configVersion, reason: 'Rename the synthetic region.', changes: { name: 'Renamed test region', timezone: 'UTC', isDemo: false } }
      const arguments_ = { actor, idempotencyKey: `${runId}-display`, input }
      const result = await service.patch(arguments_)
      assert.equal(result.result.region.configVersion, 2)
      assert.equal(result.result.region.hazardVersion, 0)
      assert.ok(result.result.presetPassages.every((passage) => passage.isDemo === false))
      assert.deepEqual(await personalVersions(), versions)
      assert.deepEqual(await service.patch(arguments_), { replayed: true, result: result.result })
      assert.equal(await countAudit(), 1)
      await assert.rejects(service.patch({ ...arguments_, input: { ...input, reason: 'Different request.' } }), errorCode('IDEMPOTENCY_CONFLICT'))
      await withTransaction(payload, async ({ execute }) => { await execute(sql`UPDATE admins SET enabled=false WHERE id=${operator.id}`) })
      try {
        await assert.rejects(service.get({ actor }), errorCode('FORBIDDEN'))
        await assert.rejects(service.patch(arguments_), errorCode('FORBIDDEN'))
      } finally { await withTransaction(payload, async ({ execute }) => { await execute(sql`UPDATE admins SET enabled=true WHERE id=${operator.id}`) }) }
      await withTransaction(payload, async ({ execute }) => { await execute(sql`UPDATE admins SET role='report_admin' WHERE id=${operator.id}`) })
      try { await assert.rejects(service.patch(arguments_), errorCode('FORBIDDEN')) }
      finally { await withTransaction(payload, async ({ execute }) => { await execute(sql`UPDATE admins SET role='operator' WHERE id=${operator.id}`) }) }
    })

    await t.test('no-ops, stale versions and client passage ids fail without partial changes', async () => {
      const current = await get()
      const audits = await countAudit()
      await assert.rejects(patch('same-name', { name: current.region.name }), errorCode('INVALID_INPUT'))
      await assert.rejects(patch('same-list', { presetPassages: current.presetPassages.slice().reverse().map(({ id, name, geometry }) => ({ id, name, geometry })) }), errorCode('INVALID_INPUT'))
      await assert.rejects(service.patch({ actor, idempotencyKey: `${runId}-stale`, input: { expectedVersion: 1, reason: 'Stale version.', changes: { name: 'Stale' } } }), errorCode('VERSION_CONFLICT'))
      await assert.rejects(patch('unknown-passage', { presetPassages: [{ id: 'foreign-or-client-generated', name: 'Not current', geometry: current.presetPassages[0].geometry }] }), errorCode('CONFIG_CONFLICT'))
      await assert.rejects(patch('duplicate-passage', { presetPassages: [current.presetPassages[0], current.presetPassages[0]].map(({ id, name, geometry }) => ({ id, name, geometry })) }), errorCode('CONFIG_CONFLICT'))
      assert.deepEqual(await get(), current)
      assert.equal(await countAudit(), audits)
    })

    await t.test('passage renames version the item without changing routing while add/delete replaces the full list', async () => {
      const before = await get()
      const primary = before.presetPassages[0]
      const renamed = await patch('rename-passage', { presetPassages: before.presetPassages.map(({ id, name, geometry }) => ({ id, name: id === primary.id ? `${name} renamed` : name, geometry })) })
      assert.equal(renamed.result.region.hazardVersion, before.region.hazardVersion)
      assert.equal(renamed.result.presetPassages.find((passage) => passage.id === primary.id)?.passageVersion, primary.passageVersion + 1)
      assert.equal(renamed.result.presetPassages[1].passageVersion, before.presetPassages[1].passageVersion)
      const kept = renamed.result.presetPassages.find((passage) => passage.id === primary.id)
      assert.ok(kept)
      const replaced = await patch('replace-passages', { presetPassages: [
        { id: kept.id, name: kept.name, geometry: kept.geometry },
        { name: 'A new server-generated passage', geometry: { type: 'LineString', coordinates: [[0.4, 0.4], [0.4001, 0.4001]] } },
      ] })
      const added = replaced.result.presetPassages.find((passage) => passage.id !== kept.id)
      assert.ok(added)
      assert.equal(added.passageVersion, 1)
      assert.equal(replaced.result.region.hazardVersion, before.region.hazardVersion + 1)
      assert.equal((await payload.count({ collection: 'preset-passages', where: { id: { equals: before.presetPassages[1].id } }, overrideAccess: true })).totalDocs, 0)
      assert.equal(replaced.result.presetPassages.find((passage) => passage.id === kept.id)?.passageVersion, kept.passageVersion)
    })

    let activeReportId = ''
    let activeConfirmationId = ''
    await t.test('an effective confirmation from another owner blocks changing or deleting its preset', async () => {
      const current = await get()
      const primary = current.presetPassages.find((passage) => passage.id === seed.presetPassages[0].id)
      assert.ok(primary)
      const hazards = createHazardService(payload, { regionId, sessionSecret: 'synthetic-region-secret-at-least-32-bytes', visionConfig: { model: 'glm-4.6v', promptVersion: '1', schemaVersion: '1' }, now: () => clock })
      const created = await hazards.create({ ownerSessionHash: ownerB, idempotencyKey: `${runId}-private-report`, input: {
        photoId, location: primary.geometry.coordinates[0], category: 'construction', description: 'Other-owner active fixture.', observedAt: new Date(clock).toISOString(),
      } })
      activeReportId = created.result.id
      const previewInput = { expectedVersion: 1, observedAt: new Date(clock).toISOString(), passage: { presetPassageId: primary.id, passageVersion: primary.passageVersion } }
      const preview = await hazards.preview({ ownerSessionHash: ownerB, reportId: activeReportId, input: previewInput })
      await hazards.confirm({ ownerSessionHash: ownerB, reportId: activeReportId, idempotencyKey: `${runId}-private-confirm`, input: { ...previewInput, previewDigest: preview.previewDigest, consent: true } })
      const confirmation = await payload.find({ collection: 'personal-avoidances', where: { reportId: { equals: activeReportId } }, overrideAccess: true })
      activeConfirmationId = confirmation.docs[0].id
      const audits = await countAudit()
      await assert.rejects(patch('delete-active-preset', { presetPassages: current.presetPassages.filter((passage) => passage.id !== primary.id).map(({ id, name, geometry }) => ({ id, name, geometry })) }), (error) => error instanceof AppError && error.code === 'CONFIG_CONFLICT' && JSON.stringify(error.details?.reportIds) === JSON.stringify([activeReportId]))
      await assert.rejects(patch('move-active-preset', { presetPassages: current.presetPassages.map(({ id, name, geometry }) => ({ id, name, geometry: id === primary.id ? { type: 'LineString', coordinates: [[0.45, 0.45], [0.4501, 0.4501]] } : geometry })) }), errorCode('CONFIG_CONFLICT'))
      assert.equal(await countAudit(), audits)
      assert.deepEqual(await get(), current)
    })

    await t.test('future buffer and preset name changes retain confirmed geometry and personal versions', async () => {
      const before = await get()
      const confirmation = await payload.findByID({ collection: 'personal-avoidances', id: activeConfirmationId, overrideAccess: true })
      const versions = await personalVersions()
      const changed = await patch('future-buffer', { avoidanceBufferM: 2.5 })
      assert.equal(changed.result.region.hazardVersion, before.region.hazardVersion + 1)
      const nameBefore = changed.result
      const primaryId = seed.presetPassages[0].id
      const renamed = await patch('active-name', { presetPassages: nameBefore.presetPassages.map(({ id, name, geometry }) => ({ id, name: id === primaryId ? `${name} again` : name, geometry })) })
      assert.equal(renamed.result.region.hazardVersion, nameBefore.region.hazardVersion)
      const preserved = await payload.findByID({ collection: 'personal-avoidances', id: activeConfirmationId, overrideAccess: true })
      assert.equal(fingerprint(preserved.avoidGeometry), fingerprint(confirmation.avoidGeometry))
      assert.equal(preserved.active, true)
      assert.equal(preserved.confirmationReportVersion, confirmation.confirmationReportVersion)
      assert.deepEqual(await personalVersions(), versions)
      assert.ok((await business.getEffectiveAvoidances({ regionId, ownerSessionHash: ownerB, now: new Date(clock) })).personalAvoidances.some((item) => item.id === activeReportId))
    })

    await t.test('all active public snapshots constrain bounds while hidden, expired and invalidated histories do not', async () => {
      const published = (status: 'verified' | 'resolved' | 'rejected', visible: boolean, validUntil: string) => ({
        status, visible, publicRevision: 1, location: [0.8, 0.8], category: 'construction', description: 'Independently checked synthetic fixture.',
        observedAt: new Date(clock).toISOString(), publicAvoidGeometry: geometry, validUntil,
        publicVerification: { source: 'admin_field_check', verifiedAt: new Date(clock).toISOString(), validUntil, resolvedAt: status === 'verified' ? null : new Date(clock).toISOString() },
      })
      const future = new Date(clock + 3600000).toISOString()
      const expired = new Date(clock - 1).toISOString()
      const publicId = `${runId}-public-active`
      for (const [suffix, status, visible, until] of [
        ['active', 'verified', true, future], ['hidden', 'verified', false, future],
        ['expired', 'verified', true, expired], ['resolved', 'resolved', true, future], ['rejected', 'rejected', true, future],
      ] as const) await payload.create({ collection: 'hazard-reports', data: {
        id: `${runId}-public-${suffix}`, regionId, ownerSessionHash: ownerA, rowVersion: 1, status,
        facts: facts(), publicSnapshot: published(status, visible, until),
      }, overrideAccess: true })
      for (const kind of ['disabled', 'expired', 'stale', 'resolved', 'rejected'] as const) {
        const id = `${runId}-personal-${kind}`
        await payload.create({ collection: 'hazard-reports', data: { id, regionId, ownerSessionHash: ownerA, rowVersion: 2, status: kind === 'resolved' || kind === 'rejected' ? kind : 'pending', facts: facts() }, overrideAccess: true })
        await payload.create({ collection: 'personal-avoidances', data: {
          id: `${id}-confirmation`, reportId: id, regionId, ownerSessionHash: ownerA, active: kind !== 'disabled',
          confirmedPath: { passage: { routeRef: `${runId}-historical-route`, startIndex: 0, endIndex: 1 }, geometry: { type: 'LineString', coordinates: [[0.8, 0.8], [0.8001, 0.8001]] } },
          avoidGeometry: geometry, decisionSource: 'user_manual', observedAt: new Date(clock - 1000).toISOString(), confirmedAt: new Date(clock - 1000).toISOString(),
          validUntil: kind === 'expired' ? expired : future, confirmationReportVersion: kind === 'stale' ? 1 : 2,
        }, overrideAccess: true })
      }
      await assert.rejects(patch('public-bounds-conflict', { bbox: [0.05, 0.05, 0.5, 0.5] }), (error) => error instanceof AppError && error.code === 'CONFIG_CONFLICT' && JSON.stringify(error.details?.reportIds) === JSON.stringify([publicId]))
      await payload.update({ collection: 'hazard-reports', id: publicId, data: { publicSnapshot: published('verified', false, future) }, overrideAccess: true })
      const changed = await patch('ignore-histories', { bbox: [0.05, 0.05, 0.5, 0.5] })
      assert.deepEqual(changed.result.region.bbox, [0.05, 0.05, 0.5, 0.5])
    })

    await t.test('audit failure rolls back region, passage, version and idempotency changes', async () => {
      const before = await get()
      const audits = await countAudit()
      const versions = await personalVersions()
      const command = { actor, idempotencyKey: `${runId}-rollback`, input: {
        expectedVersion: before.region.configVersion, reason: 'Deliberately test rollback.', changes: { name: 'Rollback candidate', presetPassages: [
          ...before.presetPassages.map(({ id, name, geometry }) => ({ id, name, geometry })),
          { name: 'Rollback new passage', geometry: { type: 'LineString', coordinates: [[0.35, 0.35], [0.3501, 0.3501]] } },
        ] },
      } }
      const hooks = payload.collections['report-events'].config.hooks
      const previous = hooks.beforeChange ?? []
      const fail: CollectionBeforeChangeHook = ({ data }) => {
        if (data.reportId === `region:${regionId}`) throw new Error('Deliberate region audit failure')
        return data
      }
      hooks.beforeChange = [...previous, fail]
      try { await assert.rejects(service.patch(command), /Deliberate region audit failure/) }
      finally { hooks.beforeChange = previous }
      assert.deepEqual(await get(), before)
      assert.equal(await countAudit(), audits)
      assert.deepEqual(await personalVersions(), versions)
      const retried = await service.patch(command)
      assert.equal(retried.replayed, false)
      assert.equal(retried.result.region.configVersion, before.region.configVersion + 1)
      assert.equal(retried.result.presetPassages.length, before.presetPassages.length + 1)
    })

    await t.test('simultaneous edits serialize at the region version and commit one audit', async () => {
      const before = await get()
      const audits = await countAudit()
      const outcomes = await Promise.allSettled([0, 1].map((number) => service.patch({ actor, idempotencyKey: `${runId}-concurrent-${number}`, input: {
        expectedVersion: before.region.configVersion, reason: 'Concurrent version probe.', changes: { name: `Concurrent name ${number}` },
      } })))
      assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1)
      assert.ok(outcomes.some((item) => item.status === 'rejected' && item.reason instanceof AppError && item.reason.code === 'VERSION_CONFLICT'))
      assert.equal((await get()).region.configVersion, before.region.configVersion + 1)
      assert.equal(await countAudit(), audits + 1)
    })

    await t.test('legacy routing-only public snapshots permit display changes but still block spatial changes', async () => {
      const reportId = `${runId}-legacy-public`
      const publicSnapshot = {
        status: 'verified', publicRevision: 1, publicAvoidGeometry: {
          type: 'Polygon', coordinates: [[[0.2, 0.2], [0.2001, 0.2], [0.2001, 0.2001], [0.2, 0.2]]],
        }, validUntil: new Date(clock + 3600000).toISOString(),
      }
      await payload.create({ collection: 'hazard-reports', data: {
        id: reportId, regionId, ownerSessionHash: ownerA, rowVersion: 1, status: 'verified', publicSnapshot,
      }, overrideAccess: true })
      try {
        const before = await get()
        const versions = await personalVersions()
        const changed = await patch('legacy-public-display', { name: 'Legacy-compatible display', timezone: 'Australia/Sydney', isDemo: true })
        assert.equal(changed.result.region.configVersion, before.region.configVersion + 1)
        assert.equal(changed.result.region.hazardVersion, before.region.hazardVersion)
        assert.deepEqual(await personalVersions(), versions)
        const primary = changed.result.presetPassages[0]
        const renamed = await patch('legacy-public-passage-name', { presetPassages: changed.result.presetPassages.map(({ id, name, geometry }) => ({
          id, name: id === primary.id ? `${name} display-only` : name, geometry,
        })) })
        assert.equal(renamed.result.region.configVersion, changed.result.region.configVersion + 1)
        assert.equal(renamed.result.region.hazardVersion, before.region.hazardVersion)
        assert.equal(renamed.result.presetPassages.find((passage) => passage.id === primary.id)?.passageVersion, primary.passageVersion + 1)
        const audits = await countAudit()
        await assert.rejects(patch('legacy-public-buffer', { avoidanceBufferM: 2.6 }), (error) => error instanceof AppError
          && error.code === 'CONFIG_CONFLICT' && JSON.stringify(error.details?.reportIds) === JSON.stringify([reportId]))
        assert.deepEqual(await get(), renamed.result)
        assert.equal(await countAudit(), audits)
        assert.deepEqual(await personalVersions(), versions)
      } finally {
        await payload.update({ collection: 'hazard-reports', id: reportId, data: { publicSnapshot: { ...publicSnapshot, visible: false } }, overrideAccess: true })
      }
    })

    await t.test('legacy effective personal records without facts permit display changes but still block spatial changes', async () => {
      const reportId = `${runId}-legacy-personal`
      const confirmationId = `${reportId}-confirmation`
      await payload.create({ collection: 'hazard-reports', data: {
        id: reportId, regionId, ownerSessionHash: ownerA, rowVersion: 1, status: 'pending',
      }, overrideAccess: true })
      await payload.create({ collection: 'personal-avoidances', data: {
        id: confirmationId, reportId, regionId, ownerSessionHash: ownerA, active: true,
        confirmedPath: { type: 'LineString', coordinates: [[0.2, 0.2], [0.2001, 0.2001]] },
        avoidGeometry: { type: 'Polygon', coordinates: [[[0.2, 0.2], [0.2001, 0.2], [0.2001, 0.2001], [0.2, 0.2]]] },
        decisionSource: 'user_manual', observedAt: new Date(clock).toISOString(), confirmedAt: new Date(clock).toISOString(),
        validUntil: new Date(clock + 3600000).toISOString(), confirmationReportVersion: 1,
      }, overrideAccess: true })
      try {
        const before = await get()
        const versions = await personalVersions()
        const audits = await countAudit()
        const confirmation = await payload.findByID({ collection: 'personal-avoidances', id: confirmationId, overrideAccess: true })
        const changed = await patch('legacy-personal-display', { name: 'Legacy personal display compatible' })
        assert.equal(changed.result.region.configVersion, before.region.configVersion + 1)
        assert.equal(changed.result.region.hazardVersion, before.region.hazardVersion)
        assert.deepEqual(await personalVersions(), versions)
        assert.equal(await countAudit(), audits + 1)
        await assert.rejects(patch('legacy-personal-bounds', { bbox: [0.04, 0.04, 0.5, 0.5] }), (error) => error instanceof AppError
          && error.code === 'CONFIG_CONFLICT' && JSON.stringify(error.details?.reportIds) === JSON.stringify([reportId]))
        assert.deepEqual(await get(), changed.result)
        assert.equal(await countAudit(), audits + 1)
        assert.deepEqual(await personalVersions(), versions)
        const preserved = await payload.findByID({ collection: 'personal-avoidances', id: confirmationId, overrideAccess: true })
        assert.equal(fingerprint(preserved.confirmedPath), fingerprint(confirmation.confirmedPath))
        assert.equal(fingerprint(preserved.avoidGeometry), fingerprint(confirmation.avoidGeometry))
        assert.equal(preserved.confirmationReportVersion, confirmation.confirmationReportVersion)
      } finally {
        await payload.update({ collection: 'personal-avoidances', id: confirmationId, data: { active: false }, overrideAccess: true })
      }
    })
  } finally { await payload.destroy() }
})
