import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { sql } from '@payloadcms/db-postgres'

import { evaluateContext } from '../src/features/routing/server/context'
import { issueSessionCredential, sessionOwnerHash } from '../src/server/auth/session-cookie'
import { AppError } from '../src/server/http/errors'
import { ProviderGate } from '../src/server/providers/gate'
import { createOrsAdapter } from '../src/server/providers/ors'
import { createGeocodingAdapter } from '../src/server/providers/geocoding'
import { createBusinessRepository } from '../src/server/storage/business-repository'
import { createRoutingRepository } from '../src/server/storage/routing-repository'
import { dRoutingFixture } from '../src/shared/fixtures/d-routing'

test('D services use C persisted snapshots, atomic references and event telemetry', {
  skip: process.env.ACCESSLOOP_STORAGE_TESTS !== '1', timeout: 120_000,
}, async (t) => {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const business = createBusinessRepository(payload)
  const runId = `routing-storage-${randomUUID()}`
  const secret = 'synthetic-test-session-secret-only-32-bytes'
  const credential = issueSessionCredential(secret)
  const sessionA = sessionOwnerHash(credential)
  const sessionB = sessionOwnerHash(issueSessionCredential(secret))
  let clock = Date.parse('2031-01-01T00:00:00.000Z')
  const routing = createRoutingRepository(payload, { regionId: runId, sessionSecret: secret, now: () => clock })
  const region = { ...dRoutingFixture.region, id: runId }
  const passage = { ...dRoutingFixture.passages[0], id: `${runId}-passage` }
  const contextOf = (context: ReturnType<typeof evaluateContext>['context']) => ({
    hazardVersion: context.hazardVersion, personalVersion: context.personalVersion,
    configVersion: context.configVersion, activeDigest: context.activeDigest,
  })
  try {
    await t.test('unconfigured data fails explicitly; configured region, passage and signed session are real', async () => {
      await assert.rejects(routing.getRegion(), (error) => error instanceof AppError && error.status === 503)
      await assert.rejects(routing.getPlaces(region.bbox), (error) => error instanceof AppError && error.status === 503)
      await business.ensureSession(sessionA)
      await business.ensureSession(sessionB)
      await business.seedRegion({ region, presetPassages: [passage], source: { kind: 'synthetic', note: 'D/C integration fixture only; no survey or upstream validation.' } })
      assert.deepEqual(await routing.getRegion(), region)
      assert.deepEqual(await routing.getPassages(), [passage])
      assert.equal(await routing.resolveSession(new Request('http://localhost/api/routing-context')), null)
      assert.equal(await routing.resolveSession(new Request('http://localhost/api/routing-context', { headers: { cookie: `accessloop_session=${credential}` } })), sessionA)
      const unpersisted = issueSessionCredential(secret)
      assert.equal(await routing.resolveSession(new Request('http://localhost/api/routing-context', { headers: { cookie: `accessloop_session=${unpersisted}` } })), null)
      const snapshot = await routing.readSnapshot(sessionA)
      assert.equal(snapshot.personalVersion, 0)
      assert.equal(snapshot.publicAvoidances.length + snapshot.personalAvoidances.length, 0)
    })

    await t.test('published references retain context, are session-scoped, and reject outdated versions', async () => {
      const context = evaluateContext(await routing.readSnapshot(sessionA), clock).context
      const input = { sessionKey: sessionA, regionId: runId, geometry: passage.geometry, expiresAt: new Date(clock + 900_000).toISOString(), context: contextOf(context) }
      const reference = await routing.publishRouteReference(input)
      assert.ok(reference)
      assert.deepEqual((await routing.getRouteReference(sessionA, reference.id))?.context, input.context)
      assert.equal(await routing.getRouteReference(sessionB, reference.id), null)
      await payload.update({ collection: 'regions', id: runId, data: { hazardVersion: 1 }, overrideAccess: true })
      assert.equal(await routing.publishRouteReference(input), null)
    })

    await t.test('a concurrent region change commits before the locked freshness check and rejects the old context', async () => {
      const context = evaluateContext(await routing.readSnapshot(sessionA), clock).context
      let releaseWriter: () => void = () => { throw new Error('Writer is not ready') }
      let writerLocked: () => void = () => { throw new Error('Lock signal is not ready') }
      const locked = new Promise<void>((resolve) => { writerLocked = resolve })
      const released = new Promise<void>((resolve) => { releaseWriter = resolve })
      const writer = business.withTransaction(async ({ req, execute }) => {
        await execute(sql`SELECT id FROM regions WHERE id = ${runId} FOR UPDATE`)
        writerLocked()
        await released
        await payload.update({ collection: 'regions', id: runId, data: { hazardVersion: context.hazardVersion + 1 }, overrideAccess: true, req })
      })
      await locked
      let finished = false
      const pending = routing.publishRouteReference({ sessionKey: sessionA, regionId: runId, geometry: passage.geometry, expiresAt: new Date(clock + 900_000).toISOString(), context: contextOf(context) }).finally(() => { finished = true })
      await new Promise((resolve) => setTimeout(resolve, 50))
      const finishedBeforeWriter = finished
      releaseWriter()
      await writer
      assert.equal(await pending, null)
      assert.equal(finishedBeforeWriter, false)
    })

    await t.test('published and personal metadata is preserved and natural expiry invalidates unchanged version numbers', async () => {
      const id = `${runId}-report`
      const expiry = new Date(clock + 1000).toISOString()
      const polygon = { type: 'Polygon', coordinates: [[[151.229, -33.917], [151.2291, -33.917], [151.2291, -33.9171], [151.229, -33.917]]] }
      await payload.create({
        collection: 'hazard-reports', data: {
          id, regionId: runId, ownerSessionHash: sessionA, status: 'verified', rowVersion: 1,
          publicSnapshot: { status: 'verified', publicRevision: 1, publicAvoidGeometry: polygon, validUntil: expiry },
        }, overrideAccess: true,
      })
      await payload.create({
        collection: 'personal-avoidances', data: {
          id, reportId: id, regionId: runId, ownerSessionHash: sessionA, active: true,
          confirmedPath: { passage: { presetPassageId: passage.id, passageVersion: 1 }, geometry: passage.geometry },
          avoidGeometry: polygon, decisionSource: 'user_manual', observedAt: new Date(clock).toISOString(),
          confirmedAt: new Date(clock).toISOString(), validUntil: expiry, confirmationReportVersion: 1,
        }, overrideAccess: true,
      })
      const snapshot = await routing.readSnapshot(sessionA)
      assert.equal(snapshot.personalAvoidances[0].reportStatus, 'verified')
      assert.equal(snapshot.personalAvoidances[0].active, true)
      assert.equal(snapshot.publicAvoidances[0].status, 'verified')
      const context = evaluateContext(snapshot, clock).context
      clock += 1000
      const current = evaluateContext(await routing.readSnapshot(sessionA), clock).context
      assert.equal(current.hazardVersion, context.hazardVersion)
      assert.equal(current.personalVersion, context.personalVersion)
      assert.notEqual(current.activeDigest, context.activeDigest)
      assert.equal(await routing.publishRouteReference({
        sessionKey: sessionA, regionId: runId, geometry: passage.geometry,
        expiresAt: new Date(clock + 900_000).toISOString(), context: contextOf(context),
      }), null)
    })

    await t.test('opaque service caches preserve JSON without mixing keys or returning expired entries', async () => {
      const key = `sha256:${runId}`
      await routing.putCache(key, { items: [{ id: 'synthetic-result' }] }, new Date(clock + 1000).toISOString())
      assert.deepEqual(await routing.getCache(key), { items: [{ id: 'synthetic-result' }] })
      assert.equal(await routing.getCache(`${key}-other`), null)
      clock += 1000
      assert.equal(await routing.getCache(key), null)
    })

    await t.test('D ProviderGate reserves and starts atomically while actual call and wait events are counted once', async () => {
      const windowStart = new Date(clock - 1).toISOString()
      const windowEnd = new Date(clock + 1).toISOString()
      const before = await routing.getUsageSummary(windowStart, windowEnd)
      const gate = new ProviderGate(routing, { now: () => clock })
      const keyFingerprint = createOrsAdapter({ apiKey: `${runId}-synthetic-key` }).keyFingerprint
      assert.match(keyFingerprint, /^sha256:[a-f0-9]{64}$/)
      let attempts = 0
      const operation = async () => { attempts += 1; return 'synthetic-provider-result' }
      const policy = { minuteLimit: 1, dayLimit: 5 }
      assert.equal(await gate.run({ service: 'ors', keyFingerprint, policy, operation }), 'synthetic-provider-result')
      await assert.rejects(gate.run({ service: 'ors', keyFingerprint, policy, operation }), (error) => error instanceof AppError && error.code === 'RATE_LIMITED')
      assert.equal(attempts, 1)
      const after = await routing.getUsageSummary(windowStart, windowEnd)
      assert.equal(after.services.ors.calls, before.services.ors.calls + 1)
      assert.equal(after.services.ors.waits, before.services.ors.waits + 1)
      assert.equal(after.services.ors.errors, before.services.ors.errors)
      const reservations = await payload.find({ collection: 'provider-usage', where: { keyFingerprint: { equals: keyFingerprint.slice(7) } }, overrideAccess: true })
      assert.equal(reservations.totalDocs, 1)
      assert.equal(reservations.docs[0].outcome, 'started')
      assert.equal(reservations.docs[0].startedAt, new Date(clock).toISOString())
      const geocodingFingerprint = createGeocodingAdapter({ apiKey: `${runId}-synthetic-key` }).keyFingerprint
      assert.match(geocodingFingerprint, /^sha256:[a-f0-9]{64}$/)
      await routing.blockBudget({ service: 'geocoding', keyFingerprint: geocodingFingerprint, until: new Date(clock + 60_000).toISOString(), reason: 'rate' })
      const blocked = await routing.reserveBudget({ service: 'geocoding', keyFingerprint: geocodingFingerprint, now: new Date(clock).toISOString(), minuteLimit: 1, dayLimit: 5 })
      assert.equal(blocked.allowed, false)
    })
  } finally { await payload.destroy() }
})
