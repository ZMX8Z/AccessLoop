import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import { z } from 'zod'

import type { RegionSeed } from '../src/shared/contracts/storage'
import { createBusinessRepository, StorageError } from '../src/server/storage/business-repository'
import { contextId } from '../src/server/storage/sessions'

test('C0 repositories share real PostgreSQL transactions and isolate anonymous state', {
  skip: process.env.ACCESSLOOP_STORAGE_TESTS !== '1', timeout: 120_000,
}, async (t) => {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const repository = createBusinessRepository(payload)
  const runId = `storage-test-${randomUUID()}`
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  const ownerA = hash(`${runId}:a`)
  const ownerB = hash(`${runId}:b`)
  const now = new Date('2030-01-01T00:00:00.000Z')
  const later = new Date(now.getTime() + 30_000).toISOString()
  const polygon = { type: 'Polygon', coordinates: [[[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.1]]] }
  const line = { type: 'LineString', coordinates: [[0.1, 0.1], [0.2, 0.2]] }
  const seed: RegionSeed = {
    region: {
      id: runId, name: 'Synthetic storage verification', bbox: [0, 0, 1, 1], timezone: 'Australia/Sydney',
      isDemo: true, configVersion: 1, hazardVersion: 0, personalValiditySec: 3600,
      publicValiditySec: 86400, avoidanceBufferM: 2,
      routing: {
        profile: 'wheelchair', defaultRestrictions: { maximum_incline: 6, maximum_sloped_kerb: 0.06, minimum_width: 0.9 },
        supportedRestrictions: { maximum_incline: [6], maximum_sloped_kerb: [0.06], minimum_width: [0.9] },
      },
    },
    presetPassages: [{
      id: `${runId}-passage`, name: 'Synthetic passage', passageVersion: 1, isDemo: true,
      geometry: { type: 'LineString', coordinates: [[0.1, 0.1], [0.2, 0.2]] },
    }],
    source: { kind: 'synthetic', note: 'Automated storage verification only. Not a surveyed route.' },
  }

  try {
    await t.test('session creation does not depend on region and repeat seeds preserve ids and versions', async () => {
      await Promise.all([repository.ensureSession(ownerA), repository.ensureSession(ownerA), repository.ensureSession(ownerB)])
      assert.equal(await repository.getRegion(runId), null)
      assert.equal(await repository.seedRegion(seed), 'created')
      assert.equal(await repository.seedRegion(seed), 'unchanged')
      assert.deepEqual(await repository.getPassages(runId), { configVersion: 1, items: seed.presetPassages })
      assert.deepEqual(await repository.requireRegion(runId), seed.region)
      await assert.rejects(repository.seedRegion({ ...seed, region: { ...seed.region, name: 'Replacement forbidden' } }), (error) => error instanceof StorageError && error.code === 'SEED_CONFLICT')
      await repository.ensureSessionContext(runId, ownerA)
      await repository.ensureSessionContext(runId, ownerB)
    })

    await t.test('route references expire and cannot be read by another session or region', async () => {
      const route = await repository.createRouteSnapshot({ regionId: runId, ownerSessionHash: ownerA, geometry: seed.presetPassages[0].geometry, now })
      assert.equal((await repository.getRouteSnapshot({ routeRef: route.routeRef, regionId: runId, ownerSessionHash: ownerA, now }))?.routeRef, route.routeRef)
      assert.equal(await repository.getRouteSnapshot({ routeRef: route.routeRef, regionId: runId, ownerSessionHash: ownerB, now }), null)
      assert.equal(await repository.getRouteSnapshot({ routeRef: route.routeRef, regionId: `${runId}-other`, ownerSessionHash: ownerA, now }), null)
      assert.equal(await repository.getRouteSnapshot({ routeRef: route.routeRef, regionId: runId, ownerSessionHash: ownerA, now: new Date(now.getTime() + 900_000) }), null)
    })

    await t.test('effective sets preserve public revision and exclude other, stale, resolved and expired personal state', async () => {
      for (const item of [
        { suffix: 'public-a', owner: ownerA, rowVersion: 2, confirmation: 2, status: 'verified', expires: later, published: true },
        { suffix: 'private-b', owner: ownerB, rowVersion: 1, confirmation: 1, status: 'pending', expires: later, published: false },
        { suffix: 'stale-a', owner: ownerA, rowVersion: 2, confirmation: 1, status: 'pending', expires: later, published: false },
        { suffix: 'expired-a', owner: ownerA, rowVersion: 1, confirmation: 1, status: 'pending', expires: new Date(now.getTime() - 1).toISOString(), published: false },
        { suffix: 'resolved-a', owner: ownerA, rowVersion: 1, confirmation: 1, status: 'resolved', expires: later, published: false },
      ] as const) {
        const id = `${runId}-${item.suffix}`
        await payload.create({
          collection: 'hazard-reports', overrideAccess: true,
          data: {
            id, regionId: runId, ownerSessionHash: item.owner, status: item.status, rowVersion: item.rowVersion,
            publicSnapshot: item.published ? { status: 'verified', publicRevision: 1, publicAvoidGeometry: polygon, validUntil: later } : null,
          },
        })
        await payload.create({
          collection: 'personal-avoidances', overrideAccess: true,
          data: {
            id, reportId: id, regionId: runId, ownerSessionHash: item.owner, active: true,
            confirmedPath: { passage: { presetPassageId: seed.presetPassages[0].id, passageVersion: 1 }, geometry: line },
            avoidGeometry: polygon, decisionSource: 'user_manual', observedAt: now.toISOString(),
            confirmedAt: now.toISOString(), validUntil: item.expires, confirmationReportVersion: item.confirmation,
          },
        })
      }
      const a = await repository.getEffectiveAvoidances({ regionId: runId, ownerSessionHash: ownerA, now })
      const b = await repository.getEffectiveAvoidances({ regionId: runId, ownerSessionHash: ownerB, now })
      assert.deepEqual(a.personalAvoidances.map(({ id }) => id), [`${runId}-public-a`])
      assert.deepEqual(b.personalAvoidances.map(({ id }) => id), [`${runId}-private-b`])
      assert.deepEqual(a.publicAvoidances, b.publicAvoidances)
      assert.equal(a.publicAvoidances.length, 1)
      await payload.update({ collection: 'hazard-reports', id: `${runId}-public-a`, data: { rowVersion: 3 }, overrideAccess: true })
      const changedA = await repository.getEffectiveAvoidances({ regionId: runId, ownerSessionHash: ownerA, now })
      const unchangedB = await repository.getEffectiveAvoidances({ regionId: runId, ownerSessionHash: ownerB, now })
      assert.equal(changedA.personalAvoidances.length, 0)
      assert.deepEqual(unchangedB.publicAvoidances, b.publicAvoidances)
      const expired = await repository.getEffectiveAvoidances({ regionId: runId, ownerSessionHash: ownerB, now: new Date(later) })
      assert.equal(expired.publicAvoidances.length + expired.personalAvoidances.length, 0)
    })

    await t.test('session cache scopes and expiry cannot leak a private result', async () => {
      const key = { regionId: runId, requestHash: hash('route-input'), hazardVersion: 0, personalVersion: 2, activeDigest: hash('set') }
      await repository.putRouteCache({ ...key, scope: { kind: 'session', ownerSessionHash: ownerA }, result: { distanceM: 10 }, nextExpiryAt: later, now })
      assert.deepEqual(await repository.getRouteCache({ ...key, scope: { kind: 'session', ownerSessionHash: ownerA }, now }), { distanceM: 10 })
      assert.equal(await repository.getRouteCache({ ...key, scope: { kind: 'session', ownerSessionHash: ownerB }, now }), null)
      assert.equal(await repository.getRouteCache({ ...key, scope: { kind: 'public' }, now }), null)
      assert.equal(await repository.getRouteCache({ ...key, scope: { kind: 'session', ownerSessionHash: ownerA }, now: new Date(later) }), null)
      await assert.rejects(repository.putRouteCache({ ...key, scope: { kind: 'public' }, result: { routeRef: 'private-token' }, nextExpiryAt: null, now }))
      await assert.rejects(repository.putRouteCache({ ...key, scope: { kind: 'public' }, result: { personalVersion: 2 }, nextExpiryAt: null, now }))
    })

    await t.test('same-key budget competition admits exactly the configured number and counts only started calls', async () => {
      const input = { service: 'vision', keyFingerprint: hash(`${runId}:provider`), windows: [{ seconds: 60, limit: 3 }], now } as const
      const summaryWindow = { service: 'vision', from: now, to: new Date(now.getTime() + 1) } as const
      const before = await repository.getProviderUsageSummary(summaryWindow)
      const reservations = await Promise.all(Array.from({ length: 8 }, () => repository.reserveProviderCall({ ...input, windows: [...input.windows] })))
      const admitted = reservations.filter((item) => item.kind === 'reserved')
      assert.equal(admitted.length, 3)
      assert.equal(reservations.filter((item) => item.kind === 'limited').length, 5)
      await repository.markProviderCallStarted(admitted[0].reservationId, now)
      await repository.finishProviderCall({ reservationId: admitted[0].reservationId, outcome: 'success', now })
      await repository.markProviderCallStarted(admitted[1].reservationId, now)
      await repository.finishProviderCall({ reservationId: admitted[1].reservationId, outcome: 'error', errorCode: 'PROVIDER_TIMEOUT', now })
      await repository.recordProviderCacheHit('vision', now)
      const summary = await repository.getProviderUsageSummary(summaryWindow)
      assert.deepEqual(summary, { calls: before.calls + 2, errors: before.errors + 1, waits: before.waits + 5, cacheHits: before.cacheHits + 1 })
      await assert.rejects(repository.markProviderCallStarted(admitted[0].reservationId, now))
      assert.equal((await repository.reserveProviderCall({ ...input, service: 'geocoding', windows: [...input.windows] })).kind, 'reserved')
      assert.equal((await repository.reserveProviderCall({ ...input, now: new Date(now.getTime() + 60_000), windows: [...input.windows] })).kind, 'reserved')
    })

    await t.test('expired reservations cannot become extra upstream attempts after their budget slot is reused', async () => {
      const input = { service: 'vision', keyFingerprint: hash(`${runId}:lease`), windows: [{ seconds: 60, limit: 1 }], now } as const
      const first = await repository.reserveProviderCall({ ...input, windows: [...input.windows] })
      assert.ok(first.kind === 'reserved')
      const nextWindow = new Date(now.getTime() + 60_000)
      const second = await repository.reserveProviderCall({ ...input, windows: [...input.windows], now: nextWindow })
      assert.ok(second.kind === 'reserved')
      await assert.rejects(repository.markProviderCallStarted(first.reservationId, nextWindow), (error) => error instanceof StorageError && error.code === 'RESERVATION_EXPIRED')
      await repository.markProviderCallStarted(second.reservationId, nextWindow)
      assert.equal((await payload.findByID({ collection: 'provider-usage', id: first.reservationId, overrideAccess: true })).startedAt, null)
      assert.equal((await payload.findByID({ collection: 'provider-usage', id: second.reservationId, overrideAccess: true })).startedAt, nextWindow.toISOString())
    })

    await t.test('a late but valid start consumes a complete sliding window from the actual attempt time', async () => {
      const input = { service: 'vision', keyFingerprint: hash(`${runId}:late-start`), windows: [{ seconds: 60, limit: 1 }], now } as const
      const first = await repository.reserveProviderCall({ ...input, windows: [...input.windows] })
      assert.ok(first.kind === 'reserved')
      await repository.markProviderCallStarted(first.reservationId, new Date(now.getTime() + 59_000))
      const tooSoon = await repository.reserveProviderCall({ ...input, windows: [...input.windows], now: new Date(now.getTime() + 60_000) })
      assert.ok(tooSoon.kind === 'limited')
      assert.equal(tooSoon.retryAfterSec, 59)
      const elapsed = await repository.reserveProviderCall({ ...input, windows: [...input.windows], now: new Date(now.getTime() + 119_000) })
      assert.equal(elapsed.kind, 'reserved')
    })

    await t.test('a provider block introduced after reservation is checked before starting the call', async () => {
      const input = { service: 'vision', keyFingerprint: hash(`${runId}:new-block`), windows: [{ seconds: 60, limit: 1 }], now } as const
      const reserved = await repository.reserveProviderCall({ ...input, windows: [...input.windows] })
      assert.ok(reserved.kind === 'reserved')
      await repository.blockProviderUntil({ service: input.service, keyFingerprint: input.keyFingerprint, blockedUntil: new Date(now.getTime() + 120_000) })
      const summaryWindow = { service: 'vision', from: now, to: new Date(now.getTime() + 2000) } as const
      const before = await repository.getProviderUsageSummary(summaryWindow)
      await assert.rejects(repository.markProviderCallStarted(reserved.reservationId, new Date(now.getTime() + 1000)), (error) => error instanceof StorageError && error.code === 'PROVIDER_BLOCKED')
      const after = await repository.getProviderUsageSummary(summaryWindow)
      assert.equal(after.calls, before.calls)
      assert.equal(after.waits, before.waits + 1)
      assert.equal((await payload.findByID({ collection: 'provider-usage', id: reserved.reservationId, overrideAccess: true })).startedAt, null)
    })

    await t.test('idempotent replay precedes version checks and rollback leaves no version or audit residue', async () => {
      const context = contextId(runId, ownerA)
      const input = {
        subject: ownerA, method: 'PATCH', path: '/api/test-only-context', key: `${runId}-command`,
        request: { expectedVersion: 0 }, resultSchema: z.strictObject({ version: z.number().int() }), now,
      } as const
      let executions = 0
      const invoke = () => repository.runIdempotentCommand(input, async ({ req }) => {
        executions += 1
        const row = await payload.findByID({ collection: 'session-contexts', id: context, overrideAccess: true, req })
        if (row.personalVersion !== 0) throw new StorageError('VERSION_CONFLICT', 'The context version has changed.')
        await payload.update({ collection: 'session-contexts', id: context, data: { personalVersion: 1 }, overrideAccess: true, req })
        return { version: 1 }
      })
      const results = await Promise.all([invoke(), invoke()])
      assert.equal(executions, 1)
      assert.equal(results.filter(({ replayed }) => replayed).length, 1)
      assert.deepEqual(results.map(({ result }) => result), [{ version: 1 }, { version: 1 }])
      await assert.rejects(repository.runIdempotentCommand({ ...input, request: { expectedVersion: 1 } }, async () => ({ version: 2 })), (error) => error instanceof StorageError && error.code === 'IDEMPOTENCY_CONFLICT')
      const auditId = `${runId}-rollback-audit`
      await assert.rejects(repository.runIdempotentCommand({ ...input, key: `${runId}-rollback` }, async ({ req }) => {
        await payload.update({ collection: 'session-contexts', id: context, data: { personalVersion: 99 }, overrideAccess: true, req })
        await payload.create({
          collection: 'report-events', overrideAccess: true, req,
          data: { id: auditId, reportId: `${runId}-public-a`, actorId: ownerA, actorRole: 'anonymous', action: 'test', before: { version: 1 }, after: { version: 99 }, contextVersions: { personalVersion: 99 }, reason: 'Deliberate rollback probe' },
        })
        throw new Error('Deliberate rollback probe')
      }))
      assert.equal((await payload.findByID({ collection: 'session-contexts', id: context, overrideAccess: true })).personalVersion, 1)
      assert.equal((await payload.count({ collection: 'report-events', where: { id: { equals: auditId } }, overrideAccess: true })).totalDocs, 0)
      const retry = await repository.runIdempotentCommand({ ...input, key: `${runId}-rollback` }, async () => ({ version: 1 }))
      assert.equal(retry.replayed, false)
    })

    await t.test('native CRUD rejects anonymous access instead of bypassing the repository', async () => {
      await assert.rejects(payload.create({ collection: 'regions', data: { ...seed.region, id: `${runId}-blocked`, seedSource: seed.source, seedFingerprint: 'not-used' }, overrideAccess: false }))
      await assert.rejects(payload.find({ collection: 'hazard-reports', overrideAccess: false }))
    })
    await t.test('routing projects complete publications and excludes withdrawn snapshots', async () => {
      for (const visible of [true, false]) {
        await payload.create({
          collection: 'hazard-reports', overrideAccess: true,
          data: {
            id: `${runId}-full-public-${visible}`, regionId: runId, ownerSessionHash: ownerA, status: 'verified', rowVersion: 1,
            publicSnapshot: {
              status: 'verified', publicRevision: 1, publicAvoidGeometry: polygon, validUntil: later,
              visible, location: [0.1, 0.1], category: 'obstruction', description: 'Synthetic publication projection test',
              observedAt: now.toISOString(),
              publicVerification: { source: 'admin_field_check', verifiedAt: now.toISOString(), validUntil: later, resolvedAt: null },
            },
          },
        })
      }
      const snapshot = await repository.getEffectiveAvoidances({ regionId: runId, ownerSessionHash: ownerA, now })
      assert.ok(snapshot.publicAvoidances.some((item) => item.id === `${runId}-full-public-true`))
      assert.ok(!snapshot.publicAvoidances.some((item) => item.id === `${runId}-full-public-false`))
    })
  } finally {
    await payload.destroy()
  }
})
