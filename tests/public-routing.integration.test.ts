import { sql } from '@payloadcms/db-postgres'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import { createLocalReq } from 'payload'

import { createHazardService } from '../src/features/hazards/server/service'
import { createReviewService } from '../src/features/hazards/server/review'
import { routeOutdated } from '../src/features/routing/client/state'
import { bufferPassage } from '../src/features/routing/server/geometry'
import { RoutingService, type DirectionsAdapter } from '../src/features/routing/server/service'
import { createBusinessRepository } from '../src/server/storage/business-repository'
import { createRoutingRepository } from '../src/server/storage/routing-repository'
import { fingerprint } from '../src/server/storage/value'
import type { PrivateReportDTO } from '../src/shared/contracts/hazards'
import type { RouteDTO } from '../src/shared/contracts'
import { dRoutingFixture } from '../src/shared/fixtures/d-routing'

// Catches a broken C -> D -> A boundary: private data leaking into B's routes,
// public review not invalidating routes, or natural expiry relying only on versions.
test('real report commands propagate private and public effective sets to both sessions and stale-route detection', {
  skip: process.env.ACCESSLOOP_STORAGE_TESTS !== '1', timeout: 120_000,
}, async () => {
  let database: URL
  try { database = new URL(process.env.DATABASE_URL ?? '') }
  catch { throw new Error('A local dedicated _test database is required.') }
  assert.ok(['postgres:', 'postgresql:'].includes(database.protocol)
    && ['localhost', '127.0.0.1'].includes(database.hostname)
    && /^[A-Za-z0-9_]*_test[A-Za-z0-9_]*$/.test(decodeURIComponent(database.pathname.slice(1))),
  'A local dedicated _test database is required.')

  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config: { ...await config, telemetry: false } })
  const business = createBusinessRepository(payload)
  const run = `public-routing-${randomUUID()}`
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  const owners = [hash(`${run}-a`), hash(`${run}-b`)] as const
  const keyFingerprint = hash(`${run}-synthetic-ors-key`)
  const usageCategory = `TEST_PUBLIC_ROUTING_${randomUUID().replaceAll('-', '').toUpperCase()}`
  const cacheIds = new Set<string>()
  const ownAdmins: { id: number; email: string }[] = []
  let clock = Date.parse('2037-01-01T00:00:00.000Z')
  const options = {
    regionId: run, sessionSecret: 'public-routing-test-secret-at-least-32-bytes',
    visionConfig: { model: 'glm-4.6v', promptVersion: '1', schemaVersion: '1' }, now: () => clock,
  }
  const region = { ...dRoutingFixture.region, id: run }
  const passage = { ...dRoutingFixture.passages[0], id: `${run}-passage` }
  const passageRef = { presetPassageId: passage.id, passageVersion: 1 }
  const photoId = `${run}-synthetic-photo`
  const hazards = createHazardService(payload, options)
  const reviews = createReviewService(payload, options)
  const repository = createRoutingRepository(payload, options)
  // Observe the real writes so cleanup can target only this run's cache and events.
  const routingRepository = {
    ...repository,
    async putCache(...args: Parameters<typeof repository.putCache>) {
      cacheIds.add(fingerprint(args[0]))
      return repository.putCache(...args)
    },
    recordUsage: (event: Parameters<typeof repository.recordUsage>[0]) => repository.recordUsage({ ...event, category: usageCategory }),
  }
  const input = {
    start: [151.225, -33.917], end: [151.235, -33.917], profile: 'wheelchair' as const,
    restrictions: region.routing.defaultRestrictions,
  }
  const directCoordinates = [input.start, input.end]
  const detourCoordinates = [input.start, [151.228, -33.918], [151.232, -33.918], input.end]
  // Deterministic external adapter only; all C/D persistence and publication stay real.
  const adapter: DirectionsAdapter = {
    identity: `${run}-synthetic-ors`, keyFingerprint: `sha256:${keyFingerprint}`,
    directions: async (_input, avoidance) => ({
      geometry: { type: 'LineString', coordinates: (avoidance ? detourCoordinates : directCoordinates) as [number, number][] },
      distanceM: avoidance ? 1100 : 930, durationS: avoidance ? 1000 : 850,
    }),
  }
  const routing = new RoutingService(routingRepository, adapter, { now: () => clock })
  const contexts = () => Promise.all(owners.map((owner) => routing.context(owner)))
  const snapshots = () => Promise.all(owners.map((owner) => repository.readSnapshot(owner)))
  const routePair = async () => [await routing.route(owners[0], input), await routing.route(owners[1], input)] as const
  const assertOwnReferences = async ([a, b]: readonly [RouteDTO, RouteDTO]) => {
    assert.notEqual(a.routeRef, b.routeRef)
    assert.equal((await repository.getRouteReference(owners[0], a.routeRef))?.sessionKey, owners[0])
    assert.equal((await repository.getRouteReference(owners[1], b.routeRef))?.sessionKey, owners[1])
    assert.equal(await repository.getRouteReference(owners[0], b.routeRef), null)
    assert.equal(await repository.getRouteReference(owners[1], a.routeRef), null)
  }

  try {
    await business.seedRegion({ region, presetPassages: [passage], source: {
      kind: 'synthetic', note: 'Isolated C/D/A integration regression. No surveyed route, actual observation, OSS upload or live provider.',
    } })
    for (const owner of owners) {
      await business.ensureSession(owner)
      await business.ensureSessionContext(run, owner)
    }
    const existing = await payload.find({ collection: 'admins', where: { and: [
      { enabled: { equals: true } }, { role: { equals: 'operator' } },
    ] }, limit: 1, overrideAccess: true })
    let operator = existing.docs[0]
    if (!operator) {
      operator = await payload.create({ collection: 'admins', data: {
        email: `${run}-operator@example.invalid`, password: randomUUID(), role: 'operator', enabled: true,
      }, context: { bootstrapAdmin: true }, overrideAccess: true })
      ownAdmins.push({ id: operator.id, email: operator.email })
    }
    const operatorReq = await createLocalReq({ user: { ...operator, collection: 'admins' } }, payload)
    const admin = await payload.create({ collection: 'admins', data: {
      email: `${run}-reviewer@example.invalid`, password: randomUUID(), role: 'report_admin', enabled: true,
    }, overrideAccess: true, req: operatorReq })
    ownAdmins.push({ id: admin.id, email: admin.email })
    await business.withTransaction(({ execute }) => execute(sql`INSERT INTO photos
      (id, region_id, purpose, owner_session_hash, image_hash, upload_state)
      VALUES (${photoId}, ${run}, 'report', ${owners[0]}, ${`sha256:${hash(run)}`}, 'ready')`))

    const baseline = await routePair()
    assert.equal(baseline[1].cacheHit, true)
    await assertOwnReferences(baseline)
    const before = await contexts()
    let report: PrivateReportDTO = (await hazards.create({ ownerSessionHash: owners[0], idempotencyKey: `${run}-create`, input: {
      photoId, location: [151.2295, -33.917], category: 'construction',
      description: `${run}: synthetic private barrier, not a real campus report.`, observedAt: new Date(clock).toISOString(), passage: passageRef,
    } })).result
    const previewInput = { expectedVersion: report.rowVersion, observedAt: new Date(clock).toISOString(), passage: passageRef }
    const preview = await hazards.preview({ ownerSessionHash: owners[0], reportId: report.id, input: previewInput })
    assert.deepEqual((await snapshots()).map((snapshot) => snapshot.personalAvoidances), [[], []])
    report = (await hazards.confirm({ ownerSessionHash: owners[0], reportId: report.id, idempotencyKey: `${run}-confirm`, input: {
      ...previewInput, previewDigest: preview.previewDigest, consent: true,
    } })).result
    const privateContexts = await contexts()
    assert.equal(routeOutdated(baseline[0], privateContexts[0], clock), true)
    assert.equal(routeOutdated(baseline[1], privateContexts[1], clock), false)
    assert.equal(privateContexts[1].personalVersion, before[1].personalVersion)
    assert.equal(privateContexts[1].activeDigest, before[1].activeDigest)
    const personalRoutes = await routePair()
    assert.equal(personalRoutes[0].routingScope, 'personal')
    assert.deepEqual(personalRoutes[0].avoidedReportIds, [report.id])
    assert.deepEqual(personalRoutes[0].route.features[0].geometry.coordinates, detourCoordinates)
    assert.equal(personalRoutes[1].routingScope, 'public')
    assert.deepEqual(personalRoutes[1].avoidedReportIds, [])
    assert.deepEqual(personalRoutes[1].route.features[0].geometry.coordinates, directCoordinates)
    await assertOwnReferences(personalRoutes)
    await assert.rejects(hazards.get({ reportId: report.id, ownerSessionHash: owners[1] }), { code: 'NOT_FOUND' })

    const geometry = bufferPassage(passage.geometry, 2, region.bbox)
    const evidence = () => ({ kind: 'field_observation' as const, observedAt: new Date(clock).toISOString(),
      summary: 'Synthetic independent administrator evidence; no physical observation was performed.' })
    const review = async (command: object, key: string) => {
      report = (await reviews.review({ actor: { id: String(admin.id), role: 'report_admin' }, reportId: report.id,
        idempotencyKey: `${run}-${key}`, input: { expectedVersion: report.rowVersion,
          reason: 'Synthetic cross-package integration regression.', ...command },
      })).result
    }
    await review({ action: 'verify', extraEvidence: evidence(), publicAvoidGeometry: geometry,
      validUntil: new Date(clock + 120_000).toISOString() }, 'verify')
    assert.equal(report.personalAvoidance?.effective, false)
    const verifiedContexts = await contexts()
    const verifiedSnapshots = await snapshots()
    for (let index = 0; index < owners.length; index++) {
      assert.equal(verifiedContexts[index].hazardVersion, privateContexts[index].hazardVersion + 1)
      assert.equal(routeOutdated(personalRoutes[index], verifiedContexts[index], clock), true)
      assert.deepEqual(verifiedSnapshots[index].publicAvoidances.map((item) => item.id), [report.id])
      assert.deepEqual(verifiedSnapshots[index].personalAvoidances, [])
    }
    const verifiedRoutes = await routePair()
    assert.equal(verifiedRoutes[1].cacheHit, true)
    assert.equal(verifiedRoutes[0].personalVersion, verifiedContexts[0].personalVersion)
    assert.equal(verifiedRoutes[1].personalVersion, 0)
    for (const route of verifiedRoutes) {
      assert.equal(route.routingScope, 'public')
      assert.deepEqual(route.avoidedReportIds, [report.id])
      assert.deepEqual(route.route.features[0].geometry.coordinates, detourCoordinates)
      assert.ok(!JSON.stringify(route).includes(photoId))
      assert.ok(!JSON.stringify(route).includes(owners[0]))
    }
    await assertOwnReferences(verifiedRoutes)
    const disclosed = await hazards.get({ reportId: report.id, ownerSessionHash: owners[1] })
    assert.ok(!('rowVersion' in disclosed))
    assert.ok(!JSON.stringify(disclosed).includes(photoId))

    await review({ action: 'verify', extraEvidence: evidence(), publicAvoidGeometry: geometry,
      validUntil: new Date(clock + 60_000).toISOString() }, 'reverify')
    assert.equal(report.publicRevision, 2)
    const reverifiedContexts = await contexts()
    for (let index = 0; index < owners.length; index++) {
      assert.equal(reverifiedContexts[index].hazardVersion, verifiedContexts[index].hazardVersion + 1)
      assert.equal(routeOutdated(verifiedRoutes[index], reverifiedContexts[index], clock), true)
    }
    const reverifiedRoutes = await routePair()
    assert.equal(reverifiedRoutes[1].cacheHit, true)
    await assertOwnReferences(reverifiedRoutes)

    clock += 60_001
    const expiredContexts = await contexts()
    const expiredSnapshots = await snapshots()
    for (let index = 0; index < owners.length; index++) {
      assert.equal(expiredContexts[index].hazardVersion, reverifiedContexts[index].hazardVersion)
      assert.equal(expiredContexts[index].personalVersion, reverifiedContexts[index].personalVersion)
      assert.notEqual(expiredContexts[index].activeDigest, reverifiedContexts[index].activeDigest)
      assert.equal(expiredContexts[index].nextExpiryAt, null)
      assert.equal(routeOutdated(reverifiedRoutes[index], expiredContexts[index], clock), true)
      assert.deepEqual(expiredSnapshots[index].publicAvoidances, [])
      assert.deepEqual(expiredSnapshots[index].personalAvoidances, [])
    }
    const expiredRoutes = await routePair()
    for (const route of expiredRoutes) {
      assert.deepEqual(route.avoidedReportIds, [])
      assert.deepEqual(route.route.features[0].geometry.coordinates, directCoordinates)
    }
    assert.equal((await hazards.get({ reportId: report.id, ownerSessionHash: owners[1] })).publicActivity, 'expired')

    await review({ action: 'resolve', extraEvidence: evidence() }, 'resolve')
    assert.equal(report.status, 'resolved')
    for (const snapshot of await snapshots()) assert.deepEqual(snapshot.publicAvoidances, [])
    const resolvedContexts = await contexts()
    for (let index = 0; index < owners.length; index++) assert.equal(routeOutdated(expiredRoutes[index], resolvedContexts[index], clock), true)
    await review({ action: 'reopen' }, 'reopen')
    assert.equal(report.status, 'pending')
    assert.equal(report.personalAvoidance?.active, false)
    await assert.rejects(hazards.get({ reportId: report.id, ownerSessionHash: owners[1] }), { code: 'NOT_FOUND' })
    for (const snapshot of await snapshots()) {
      assert.deepEqual(snapshot.publicAvoidances, [])
      assert.deepEqual(snapshot.personalAvoidances, [])
    }
    for (const route of await routePair()) assert.deepEqual(route.avoidedReportIds, [])
  } finally {
    try {
      await business.withTransaction(async ({ execute }) => {
        await execute(sql`DELETE FROM report_events WHERE report_id IN
          (SELECT id FROM hazard_reports WHERE region_id = ${run})`)
        await execute(sql`DELETE FROM idempotency_records WHERE result->>'regionId' = ${run}`)
        await execute(sql`DELETE FROM personal_avoidances WHERE region_id = ${run}`)
        await execute(sql`DELETE FROM hazard_reports WHERE region_id = ${run}`)
        await execute(sql`DELETE FROM photos WHERE region_id = ${run}`)
        await execute(sql`DELETE FROM route_snapshots WHERE region_id = ${run}`)
        await execute(sql`DELETE FROM session_contexts WHERE region_id = ${run}`)
        await execute(sql`DELETE FROM preset_passages WHERE region_id = ${run}`)
        await execute(sql`DELETE FROM regions WHERE id = ${run}`)
        for (const owner of owners) await execute(sql`DELETE FROM anonymous_sessions WHERE owner_session_hash = ${owner}`)
        for (const id of cacheIds) await execute(sql`DELETE FROM service_cache WHERE id = ${id}`)
        await execute(sql`DELETE FROM provider_events WHERE category = ${usageCategory}`)
        await execute(sql`DELETE FROM provider_usage WHERE key_fingerprint = ${keyFingerprint}`)
        await execute(sql`DELETE FROM provider_blocks WHERE key_fingerprint = ${keyFingerprint}`)
        for (const admin of ownAdmins.reverse()) await execute(sql`DELETE FROM admins WHERE id = ${admin.id} AND email = ${admin.email}`)
      })
    } finally { await payload.destroy() }
  }
})
