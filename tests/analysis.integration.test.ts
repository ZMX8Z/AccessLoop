import { sql } from '@payloadcms/db-postgres'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { Where } from 'payload'

import { AppError } from '../src/server/http/errors'
import { createAnalysisService } from '../src/server/photos/analysis'
import { createGlmAdapter } from '../src/server/providers/glm'
import { createBusinessRepository } from '../src/server/storage/business-repository'
import { createRoutingRepository } from '../src/server/storage/routing-repository'
import { fingerprint } from '../src/server/storage/value'
import { RegionSeedSchema } from '../src/shared/contracts/storage'
import type { VisionResult } from '../src/shared/contracts/vision'

const result: VisionResult = {
  image_quality: 'usable', hazard_present: true, category: 'obstruction', visible_passage: 'blocked',
  description: 'A synthetic barrier crosses the visible passage.', evidence: ['The barrier spans the passage.'], uncertainties: [],
}
function completion(visionResult: unknown = result) {
  return { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ type: 'function', function: {
    name: 'record_hazard_analysis', arguments: JSON.stringify(visionResult),
  } }] } }] }
}
const errorCode = (code: string) => (error: unknown) => error instanceof AppError && error.code === code

test('C1 analysis uses durable leases, scoped cache and immutable idempotent outcomes with real PostgreSQL', {
  skip: process.env.ACCESSLOOP_STORAGE_TESTS !== '1', timeout: 120_000,
}, async (t) => {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const repository = createBusinessRepository(payload)
  const runId = `analysis-test-${randomUUID()}`
  const owner = createHash('sha256').update(`${runId}:owner`).digest('hex')
  const otherOwner = createHash('sha256').update(`${runId}:other`).digest('hex')
  const photoBytes = new Map<string, Buffer>()
  const seed = RegionSeedSchema.parse(JSON.parse(await readFile('tests/fixtures/c0-synthetic-region.json', 'utf8')))
  await repository.seedRegion({ ...seed, region: { ...seed.region, id: runId },
    presetPassages: seed.presetPassages.map((passage, index) => ({ ...passage, id: `${runId}-passage-${index}` })) })
  await Promise.all([repository.ensureSession(owner), repository.ensureSession(otherOwner)])
  const photo = async (name: string, content = name, purpose: 'report' | 'review_evidence' = 'report', uploadState: 'ready' | 'staging' = 'ready', photoRegion = runId) => {
    const id = `${runId}-${name}`
    const bytes = Buffer.from(`synthetic processed image bytes: ${content}`)
    const imageHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    // Metadata fixtures only. No public upload API or external object storage is bypassed by production code.
    await repository.withTransaction(({ execute }) => execute(sql`
      INSERT INTO photos (id, region_id, purpose, owner_session_hash, image_hash, upload_state)
      VALUES (${id}, ${photoRegion}, ${purpose}, ${owner}, ${imageHash}, ${uploadState})
    `))
    photoBytes.set(id, bytes)
    return id
  }
  let reads = 0
  const readOwnedReportBytes: Parameters<typeof createAnalysisService>[1]['readOwnedReportBytes'] = async ({ photoId }) => {
    reads += 1
    const photo = await payload.findByID({ collection: 'photos', id: photoId, depth: 0, overrideAccess: true })
    const bytes = photoBytes.get(photoId)
    assert.ok(bytes)
    assert.equal(photo.uploadState, 'ready')
    return { photo: { ...photo, uploadState: 'ready' }, bytes, mime: 'image/jpeg' }
  }
  const service = (adapter: ReturnType<typeof createGlmAdapter>, extra: Partial<Parameters<typeof createAnalysisService>[1]> = {}) => createAnalysisService(payload, {
    regionId: runId, readOwnedReportBytes, adapter, policy: { minuteLimit: 100, dayLimit: Number.MAX_SAFE_INTEGER }, ...extra,
  })
  const invoke = (client: ReturnType<typeof createAnalysisService>, photoId: string, key: string) => client.analyze({
    ownerSessionHash: owner, idempotencyKey: `${runId}-${key}`, input: { photoId, consent: true },
  })
  const analysisCount = () => payload.count({ collection: 'ai-analyses', where: { regionId: { equals: runId } }, overrideAccess: true })

  try {
    await t.test('a successful same-key replay makes no second object read or model request', async () => {
      const photoId = await photo('success')
      let requests = 0
      const client = service(createGlmAdapter({ apiKey: runId, fetch: async () => { requests += 1; return Response.json(completion()) } }))
      const beforeReads = reads
      const first = await invoke(client, photoId, 'success')
      const replay = await invoke(client, photoId, 'success')
      assert.equal(first.replayed, false)
      assert.equal(first.result.aiStatus, 'completed')
      assert.equal(first.result.cacheHit, false)
      assert.equal(replay.replayed, true)
      assert.deepEqual(replay.result, first.result)
      assert.equal(requests, 1)
      assert.equal(reads, beforeReads + 1)
    })

    await t.test('same image content under a new photo gets a cached outcome with a fresh correct binding', async () => {
      const photoId = await photo('cache-original', 'same-image')
      const secondPhotoId = await photo('cache-copy', 'same-image')
      let requests = 0
      const client = service(createGlmAdapter({ apiKey: `${runId}-cache`, fetch: async () => { requests += 1; return Response.json(completion()) } }))
      const original = await invoke(client, photoId, 'cache-original')
      const cached = await invoke(client, secondPhotoId, 'cache-copy')
      assert.equal(cached.replayed, false)
      assert.equal(cached.result.photoId, secondPhotoId)
      assert.notEqual(cached.result.analysisId, original.result.analysisId)
      assert.equal(cached.result.cacheHit, true)
      assert.equal(requests, 1)
      const stored = await payload.findByID({ collection: 'ai-analyses', id: original.result.analysisId, overrideAccess: true })
      assert.deepEqual(stored.analysis, original.result)
      await assert.rejects(invoke(client, secondPhotoId, 'cache-original'), errorCode('IDEMPOTENCY_CONFLICT'))
    })

    await t.test('an actual provider failure is persisted for strict replay but a new key can try again', async () => {
      const photoId = await photo('unavailable')
      let requests = 0
      const client = service(createGlmAdapter({ apiKey: `${runId}-failure`, fetch: async () => {
        requests += 1
        return requests === 1 ? Response.json({ error: { code: '1220' } }, { status: 403 }) : Response.json(completion())
      } }))
      const failed = await invoke(client, photoId, 'failure')
      assert.equal(failed.result.aiStatus, 'unavailable')
      assert.equal(failed.result.unavailableReason, 'provider_unavailable')
      assert.equal(failed.result.result, null)
      assert.deepEqual((await invoke(client, photoId, 'failure')).result, failed.result)
      assert.equal(requests, 1)
      assert.equal((await invoke(client, photoId, 'retry')).result.aiStatus, 'completed')
      assert.equal(requests, 2)
    })

    await t.test('fulfilled unavailable analyses count one error while uncertain results and replay do not', async () => {
      const cases = [
        { body: 'not JSON', status: 'unavailable', reason: 'invalid_output' },
        { body: JSON.stringify({ choices: [] }), status: 'unavailable', reason: 'no_valid_tool_result' },
        { body: JSON.stringify(completion({ ...result, hazard_present: 'true' })), status: 'unavailable', reason: 'invalid_output' },
        { body: JSON.stringify({ choices: [{ finish_reason: 'content_filter', message: {} }] }), status: 'unavailable', reason: 'refused' },
        { body: JSON.stringify(completion({ ...result, hazard_present: false })), status: 'uncertain', reason: null },
      ]
      for (const [index, item] of cases.entries()) {
        const photoId = await photo(`fulfilled-${index}`)
        const clock = Date.now() + 3 * 86_400_000 + index * 1000
        const usage = createRoutingRepository(payload, { regionId: runId, sessionSecret: process.env.SESSION_SECRET ?? '', now: () => clock })
        const start = new Date(clock - 1).toISOString()
        const end = new Date(clock + 1).toISOString()
        const before = (await usage.getUsageSummary(start, end)).services.vision
        let requests = 0
        const adapter = createGlmAdapter({ apiKey: `${runId}-fulfilled-${index}`, fetch: async () => { requests += 1; return new Response(item.body) } })
        const client = service(adapter, { now: () => clock })
        const first = await invoke(client, photoId, `fulfilled-${index}`)
        assert.equal(first.result.aiStatus, item.status)
        assert.equal(first.result.unavailableReason, item.reason)
        assert.equal(requests, 1)
        const after = (await usage.getUsageSummary(start, end)).services.vision
        assert.equal(after.calls - before.calls, 1)
        assert.equal(after.errors - before.errors, item.status === 'unavailable' ? 1 : 0)
        assert.deepEqual((await invoke(client, photoId, `fulfilled-${index}`)).result, first.result)
        assert.equal(requests, 1)
        assert.deepEqual((await usage.getUsageSummary(start, end)).services.vision, after)
      }
    })

    await t.test('a gate rejection before any attempt creates no analysis and can be retried with the same key', async () => {
      const photoId = await photo('gate-rejected')
      let requests = 0
      const adapter = createGlmAdapter({ apiKey: `${runId}-gate`, fetch: async () => { requests += 1; return Response.json(completion()) } })
      const blocked = service(adapter, { gate: { async run() { throw new AppError(429, 'RATE_LIMITED', 'Wait.', { retryAfterSec: 2 }) } } })
      const before = await analysisCount()
      await assert.rejects(invoke(blocked, photoId, 'gate'), errorCode('RATE_LIMITED'))
      assert.equal((await analysisCount()).totalDocs, before.totalDocs)
      assert.equal(requests, 0)
      assert.equal((await invoke(service(adapter), photoId, 'gate')).result.aiStatus, 'completed')
      assert.equal(requests, 1)
    })

    await t.test('concurrent same-key calls share a durable pending operation and one upstream request', async () => {
      const photoId = await photo('concurrent')
      let requests = 0
      const adapter = createGlmAdapter({ apiKey: `${runId}-concurrent`, fetch: async () => {
        requests += 1
        await new Promise((resolve) => setTimeout(resolve, 200))
        return Response.json(completion())
      } })
      const results = await Promise.all([invoke(service(adapter), photoId, 'concurrent'), invoke(service(adapter), photoId, 'concurrent')])
      assert.equal(requests, 1)
      assert.equal(results.filter((item) => item.replayed).length, 1)
      assert.deepEqual(results[0].result, results[1].result)
    })

    await t.test('expired crash leases can recover while active leases do not launch another call', async () => {
      const photoId = await photo('recovery')
      const idempotencyKey = `${runId}-recovery`
      const operationId = fingerprint({ regionId: runId, subject: owner, method: 'POST', path: '/api/analyze', key: idempotencyKey })
      await payload.create({ collection: 'external-operations', overrideAccess: true, data: {
        id: operationId, regionId: runId, ownerSessionHash: owner,
        requestFingerprint: fingerprint({ photoId, consent: true }), status: 'pending', leaseToken: 'crashed-token',
        leaseExpiresAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), result: null,
      } })
      let requests = 0
      const adapter = createGlmAdapter({ apiKey: `${runId}-recovery`, fetch: async () => { requests += 1; return Response.json(completion()) } })
      assert.equal((await invoke(service(adapter), photoId, 'recovery')).result.aiStatus, 'completed')
      assert.equal(requests, 1)
      const pendingId = `${runId}-pending`
      const pendingPhoto = await photo('pending')
      await payload.create({ collection: 'external-operations', overrideAccess: true, data: {
        id: fingerprint({ regionId: runId, subject: owner, method: 'POST', path: '/api/analyze', key: pendingId }), regionId: runId, ownerSessionHash: owner,
        requestFingerprint: fingerprint({ photoId: pendingPhoto, consent: true }), status: 'pending', leaseToken: 'active-token',
        leaseExpiresAt: new Date(Date.now() + 45_000).toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), result: null,
      } })
      await assert.rejects(invoke(service(adapter, { sleep: async () => {} }), pendingPhoto, 'pending'), errorCode('RATE_LIMITED'))
      assert.equal(requests, 1)
    })

    await t.test('consent, ownership, report purpose and ready upload state are checked before any external request', async () => {
      const photoId = await photo('ownership')
      const reviewPhoto = await photo('review', 'review', 'review_evidence')
      const stagingPhoto = await photo('staging', 'staging', 'report', 'staging')
      const client = service(createGlmAdapter({ apiKey: runId, fetch: async () => assert.fail('Unauthorized input must not call the model.') }))
      await assert.rejects(client.analyze({ ownerSessionHash: otherOwner, idempotencyKey: `${runId}-not-owner`, input: { photoId, consent: true } }), errorCode('NOT_FOUND'))
      await assert.rejects(invoke(client, reviewPhoto, 'review'), errorCode('NOT_FOUND'))
      await assert.rejects(invoke(client, stagingPhoto, 'staging'), errorCode('NOT_FOUND'))
      const invocation: unknown = { ownerSessionHash: owner, idempotencyKey: `${runId}-consent`, input: { photoId, consent: false } }
      await assert.rejects(Reflect.apply(client.analyze, client, [invocation]), errorCode('INVALID_INPUT'))
    })

    await t.test('a lease that expires during object storage read cannot begin a late model request', async () => {
      const photoId = await photo('slow-storage')
      let clock = Date.now() + 86_400_000
      let requests = 0
      const adapter = createGlmAdapter({ apiKey: `${runId}-slow-storage`, fetch: async () => { requests += 1; return Response.json(completion()) } })
      const fingerprint = adapter.keyFingerprint.slice('sha256:'.length)
      const usageBefore = await payload.count({ collection: 'provider-usage', where: { keyFingerprint: { equals: fingerprint } }, overrideAccess: true })
      const eventWhere: Where = { and: [{ service: { equals: 'vision' } }, { occurredAt: { equals: new Date(clock + 46_000).toISOString() } }] }
      const eventBefore = await payload.count({ collection: 'provider-events', where: eventWhere, overrideAccess: true })
      const stale = service(adapter, {
        now: () => clock,
        readOwnedReportBytes: async (input) => { const read = await readOwnedReportBytes(input); clock += 46_000; return read },
      })
      await assert.rejects(invoke(stale, photoId, 'slow-storage'), errorCode('RATE_LIMITED'))
      assert.equal(requests, 0)
      assert.equal((await payload.count({ collection: 'provider-usage', where: { keyFingerprint: { equals: fingerprint } }, overrideAccess: true })).totalDocs, usageBefore.totalDocs)
      assert.equal((await payload.count({ collection: 'provider-events', where: eventWhere, overrideAccess: true })).totalDocs, eventBefore.totalDocs)
      assert.equal((await invoke(service(adapter, { now: () => clock }), photoId, 'slow-storage')).result.aiStatus, 'completed')
      assert.equal(requests, 1)
    })

    await t.test('one anonymous identity can reuse a key in separate regions without sharing an analysis or cache', async () => {
      const otherRegion = `${runId}-other-region`
      await repository.seedRegion({ ...seed, region: { ...seed.region, id: otherRegion },
        presetPassages: seed.presetPassages.map((passage, index) => ({ ...passage, id: `${otherRegion}-passage-${index}` })) })
      const firstPhoto = await photo('region-a', 'same-content-across-regions')
      const secondPhoto = await photo('region-b', 'same-content-across-regions', 'report', 'ready', otherRegion)
      let requests = 0
      const adapter = createGlmAdapter({ apiKey: `${runId}-regions`, fetch: async () => { requests += 1; return Response.json(completion()) } })
      const first = await invoke(service(adapter), firstPhoto, 'same-key-two-regions')
      const second = await invoke(service(adapter, { regionId: otherRegion }), secondPhoto, 'same-key-two-regions')
      assert.equal(first.replayed, false)
      assert.equal(second.replayed, false)
      assert.equal(second.result.cacheHit, false)
      assert.equal(second.result.photoId, secondPhoto)
      assert.notEqual(first.result.analysisId, second.result.analysisId)
      assert.equal(requests, 2)
      await assert.rejects(invoke(service(adapter, { regionId: otherRegion }), firstPhoto, 'wrong-region'), errorCode('NOT_FOUND'))
    })
  } finally { await payload.destroy() }
})
