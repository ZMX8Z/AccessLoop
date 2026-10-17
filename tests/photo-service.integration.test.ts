import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import sharp from 'sharp'

import { AppError } from '../src/server/http/errors'
import { createPhotoService, PhotoRecordSchema, type PhotoBinaryStore } from '../src/server/photos/service'
import { createBusinessRepository } from '../src/server/storage/business-repository'
import { RegionSeedSchema } from '../src/shared/contracts/storage'

function hasCode(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code
}

test('photo commands preserve ownership, durable replay and recovery around external storage', {
  skip: process.env.ACCESSLOOP_PHOTO_TESTS !== '1', timeout: 90_000,
}, async (t) => {
  if (process.env.OSS_ACCESS_KEY_ID || process.env.OSS_ACCESS_KEY_SECRET) throw new Error('Photo integration fault tests require the isolated test environment without OSS credentials.')
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const repository = createBusinessRepository(payload)
  const runId = `photo-test-${randomUUID()}`
  const ownerA = createHash('sha256').update(`${runId}:a`).digest('hex')
  const ownerB = createHash('sha256').update(`${runId}:b`).digest('hex')
  const fixture = RegionSeedSchema.parse(JSON.parse(await readFile(new URL('./fixtures/c0-synthetic-region.json', import.meta.url), 'utf8')))
  const regionId = runId
  const objects = new Map<string, Buffer>()
  let saveCalls = 0
  let failure: 'none' | 'after_record' | 'after_storage' = 'none'
  let uploadBarrier: Promise<void> | null = null
  let signalUploadStarted: (() => void) | null = null
  let clock = new Date()
  const binaryStore: PhotoBinaryStore = {
    async save({ data, filename, image }) {
      saveCalls += 1
      const context = { internalPhotoWrite: true, internalPhotoRead: true }
      const existing = await payload.find({ collection: 'photos', where: { id: { equals: data.id } }, limit: 1, depth: 0, overrideAccess: true, context })
      const file = { data: image.buffer, name: filename, mimetype: image.mime, size: image.bytes }
      const row = existing.docs[0]
        ? await payload.update({ collection: 'photos', id: data.id, data: {}, file, overwriteExistingFiles: true, disableTransaction: true, overrideAccess: true, context })
        : await payload.create({ collection: 'photos', data, file, overwriteExistingFiles: true, disableTransaction: true, overrideAccess: true, context })
      signalUploadStarted?.()
      if (uploadBarrier) await uploadBarrier
      if (failure === 'after_record') throw new Error('Simulated OSS outage before object persistence')
      objects.set(data.id, image.buffer)
      if (failure === 'after_storage') throw new Error('Simulated lost OSS success response')
      return PhotoRecordSchema.parse(row)
    },
    async read(photo) {
      const object = objects.get(photo.id)
      return object ? new Response(new Uint8Array(object), { headers: { 'Content-Type': photo.mimeType } }) : new Response(null, { status: 404 })
    },
  }
  const service = createPhotoService(payload, { regionId, binaryStore, now: () => clock })
  const bytes = await sharp({ create: { width: 48, height: 32, channels: 3, background: 'green' } }).png().toBuffer()
  const otherBytes = await sharp({ create: { width: 48, height: 32, channels: 3, background: 'red' } }).png().toBuffer()
  const input = { subject: { kind: 'anonymous', ownerSessionHash: ownerA }, purpose: 'report', bytes, mime: 'image/png' } as const

  try {
    await repository.seedRegion({
      ...fixture, region: { ...fixture.region, id: regionId },
      presetPassages: fixture.presetPassages.map((passage, index) => ({ ...passage, id: `${runId}-passage-${index}` })),
    })
    await repository.ensureSession(ownerA)
    await repository.ensureSession(ownerB)

    await t.test('the production transport fails closed when the OSS adapter is unconfigured', async () => {
      const production = createPhotoService(payload, { regionId })
      const before = await payload.count({ collection: 'photos', where: { regionId: { equals: regionId } }, overrideAccess: true })
      await assert.rejects(production.upload({ ...input, idempotencyKey: `${runId}-missing-oss` }), hasCode('PROVIDER_UNAVAILABLE'))
      const after = await payload.count({ collection: 'photos', where: { regionId: { equals: regionId } }, overrideAccess: true })
      assert.equal(after.totalDocs, before.totalDocs)
    })

    await t.test('upload replay is durable, returns a strict DTO and does not upload again', async () => {
      const idempotencyKey = `${runId}-replay`
      const before = saveCalls
      const first = await service.upload({ ...input, idempotencyKey })
      const replay = await createPhotoService(payload, { regionId, binaryStore }).upload({ ...input, idempotencyKey })
      assert.equal(first.replayed, false)
      assert.equal(replay.replayed, true)
      assert.deepEqual(first.result, replay.result)
      assert.equal(saveCalls, before + 1)
      assert.deepEqual(Object.keys(first.result).sort(), ['photoId', 'purpose', 'mime', 'bytes', 'width', 'height'].sort())
      await assert.rejects(service.upload({ ...input, bytes: otherBytes, idempotencyKey }), hasCode('IDEMPOTENCY_CONFLICT'))
      const response = await service.read({ photoId: first.result.photoId, ownerSessionHash: ownerA })
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(response.headers.get('location'), null)
      await response.body?.cancel()
      const owned = await service.readOwnedReportBytes({ photoId: first.result.photoId, ownerSessionHash: ownerA })
      assert.equal(owned.bytes.length, first.result.bytes)
      assert.equal(owned.photo.imageHash, `sha256:${createHash('sha256').update(owned.bytes).digest('hex')}`)
    })

    await t.test('other sessions, regions and nonexistent ids return the same not-found error', async () => {
      const first = await service.upload({ ...input, idempotencyKey: `${runId}-isolation` })
      await assert.rejects(service.read({ photoId: first.result.photoId, ownerSessionHash: ownerB }), hasCode('NOT_FOUND'))
      await assert.rejects(service.read({ photoId: 'missing', ownerSessionHash: ownerB }), hasCode('NOT_FOUND'))
      await assert.rejects(service.readOwnedReportBytes({ photoId: first.result.photoId, ownerSessionHash: ownerB }), hasCode('NOT_FOUND'))
      const otherRegion = createPhotoService(payload, { regionId: `${runId}-other`, binaryStore })
      await assert.rejects(otherRegion.read({ photoId: first.result.photoId, ownerSessionHash: ownerA }), hasCode('NOT_FOUND'))
      const second = await service.upload({ ...input, subject: { kind: 'anonymous', ownerSessionHash: ownerB }, idempotencyKey: `${runId}-isolation` })
      assert.notEqual(second.result.photoId, first.result.photoId)
    })

    await t.test('lost upload success is recovered by checking the object instead of uploading it twice', async () => {
      const idempotencyKey = `${runId}-lost-response`
      const before = saveCalls
      failure = 'after_storage'
      await assert.rejects(service.upload({ ...input, idempotencyKey }), hasCode('PROVIDER_UNAVAILABLE'))
      const { docs } = await payload.find({ collection: 'photos', where: { and: [{ regionId: { equals: regionId } }, { uploadState: { equals: 'staging' } }] }, overrideAccess: true, context: { internalPhotoRead: true } })
      assert.equal(docs.length, 1)
      await assert.rejects(service.read({ photoId: docs[0].id, ownerSessionHash: ownerA }), hasCode('NOT_FOUND'))
      failure = 'none'
      const recovered = await service.upload({ ...input, idempotencyKey })
      assert.equal(recovered.result.photoId, docs[0].id)
      assert.equal(saveCalls, before + 1)
      assert.equal((await service.upload({ ...input, idempotencyKey })).replayed, true)
    })

    await t.test('failed storage leaves a private staging row and retries the same photo and object name', async () => {
      const idempotencyKey = `${runId}-before-storage`
      const before = saveCalls
      failure = 'after_record'
      await assert.rejects(service.upload({ ...input, idempotencyKey }), hasCode('PROVIDER_UNAVAILABLE'))
      const { docs } = await payload.find({ collection: 'photos', where: { and: [{ regionId: { equals: regionId } }, { uploadState: { equals: 'staging' } }] }, overrideAccess: true, context: { internalPhotoRead: true } })
      assert.equal(docs.length, 1)
      const staged = docs[0]
      failure = 'none'
      const recovered = await service.upload({ ...input, idempotencyKey })
      assert.equal(recovered.result.photoId, staged.id)
      assert.equal(saveCalls, before + 2)
      assert.equal((await payload.findByID({ collection: 'photos', id: staged.id, overrideAccess: true })).filename, staged.filename)
    })

    await t.test('concurrent requests wait with a bounded retry delay and do not duplicate the network upload', async () => {
      const idempotencyKey = `${runId}-concurrent`
      let releaseUpload: () => void = () => {}
      const entered = new Promise<void>((resolve) => { signalUploadStarted = resolve })
      uploadBarrier = new Promise<void>((resolve) => { releaseUpload = resolve })
      const before = saveCalls
      const pending = service.upload({ ...input, idempotencyKey })
      await entered
      try {
        await assert.rejects(service.upload({ ...input, idempotencyKey }), (error) => error instanceof AppError && error.status === 429 && error.code === 'RATE_LIMITED' && typeof error.details?.retryAfterSec === 'number' && error.details.retryAfterSec > 0)
      } finally {
        releaseUpload()
        uploadBarrier = null
        signalUploadStarted = null
      }
      await pending
      assert.equal(saveCalls, before + 1)
      assert.equal((await service.upload({ ...input, idempotencyKey })).replayed, true)
    })

    await t.test('an expired operation lease can recover a saved object without changing its identity', async () => {
      const idempotencyKey = `${runId}-expired-lease`
      failure = 'after_storage'
      await assert.rejects(service.upload({ ...input, idempotencyKey }), hasCode('PROVIDER_UNAVAILABLE'))
      const { docs } = await payload.find({ collection: 'photo-upload-operations', where: { state: { equals: 'failed' } }, overrideAccess: true, limit: 100 })
      const target = docs.find((record) => objects.has(record.photoId))
      assert.ok(target)
      await payload.update({ collection: 'photo-upload-operations', id: target.id, data: { state: 'pending', leaseExpiresAt: new Date(clock.getTime() - 1).toISOString() }, overrideAccess: true })
      clock = new Date(clock.getTime() + 1000)
      failure = 'none'
      const before = saveCalls
      const recovered = await service.upload({ ...input, idempotencyKey })
      assert.equal(recovered.result.photoId, target.photoId)
      assert.equal(saveCalls, before)
    })

    await t.test('a late worker cannot replace the new lease result or downgrade the completed photo', async () => {
      const idempotencyKey = `${runId}-late-worker`
      let releaseUpload: () => void = () => {}
      const entered = new Promise<void>((resolve) => { signalUploadStarted = resolve })
      uploadBarrier = new Promise<void>((resolve) => { releaseUpload = resolve })
      const pending = service.upload({ ...input, idempotencyKey })
      await entered
      uploadBarrier = null
      signalUploadStarted = null
      clock = new Date(clock.getTime() + 121_000)
      const recovered = await service.upload({ ...input, idempotencyKey })
      releaseUpload()
      await assert.rejects(pending, hasCode('RATE_LIMITED'))
      const replay = await service.upload({ ...input, idempotencyKey })
      assert.equal(replay.replayed, true)
      assert.equal(replay.result.photoId, recovered.result.photoId)
      const stored = await payload.findByID({ collection: 'photos', id: recovered.result.photoId, overrideAccess: true })
      assert.equal(stored.uploadState, 'ready')
    })

    await t.test('failed completion rolls back readiness and recovers the persisted object on retry', async () => {
      const idempotencyKey = `${runId}-commit-rollback`
      const hooks = payload.collections.photos.config.hooks.beforeChange
      assert.ok(hooks)
      const rejectReady: NonNullable<typeof hooks>[number] = ({ data }) => {
        if (data.uploadState === 'ready') throw new Error('Deliberate ready transition failure')
        return data
      }
      const before = saveCalls
      hooks.push(rejectReady)
      try {
        await assert.rejects(service.upload({ ...input, idempotencyKey }), hasCode('PROVIDER_UNAVAILABLE'))
      } finally {
        hooks.splice(hooks.indexOf(rejectReady), 1)
      }
      const staged = await payload.find({ collection: 'photos', where: { and: [{ regionId: { equals: regionId } }, { uploadState: { equals: 'staging' } }] }, overrideAccess: true })
      assert.equal(staged.docs.length, 1)
      const recovered = await service.upload({ ...input, idempotencyKey })
      assert.equal(recovered.result.photoId, staged.docs[0].id)
      assert.equal(saveCalls, before + 1)
      assert.equal((await service.upload({ ...input, idempotencyKey })).replayed, true)
    })

    await t.test('purpose chooses its required identity and invalid media never invokes storage', async () => {
      const before = saveCalls
      await assert.rejects(service.upload({ ...input, subject: { kind: 'admin', adminId: '1' }, idempotencyKey: `${runId}-wrong-report-owner` }), hasCode('UNAUTHENTICATED'))
      await assert.rejects(service.upload({ ...input, purpose: 'review_evidence', idempotencyKey: `${runId}-wrong-evidence-owner` }), hasCode('FORBIDDEN'))
      await assert.rejects(service.upload({ ...input, mime: 'image/jpeg', idempotencyKey: `${runId}-wrong-format` }), hasCode('INVALID_MEDIA'))
      assert.equal(saveCalls, before)
    })

    await t.test('review evidence is administrator-owned and cannot be read or analyzed by an anonymous session', async () => {
      const existing = await payload.find({ collection: 'admins', where: { and: [{ enabled: { equals: true } }, { role: { equals: 'operator' } }] }, overrideAccess: true, limit: 1 })
      const admin = existing.docs[0] ?? await payload.create({
        collection: 'admins', data: { email: `${runId}@example.invalid`, password: randomUUID(), role: 'operator', enabled: true },
        overrideAccess: true, context: { bootstrapAdmin: true },
      })
      const evidence = await service.upload({
        subject: { kind: 'admin', adminId: admin.id }, purpose: 'review_evidence', idempotencyKey: `${runId}-evidence`, bytes, mime: 'image/png',
      })
      assert.equal(evidence.result.purpose, 'review_evidence')
      await assert.rejects(service.read({ photoId: evidence.result.photoId, ownerSessionHash: ownerA }), hasCode('NOT_FOUND'))
      await assert.rejects(service.readOwnedReportBytes({ photoId: evidence.result.photoId, ownerSessionHash: ownerA }), hasCode('NOT_FOUND'))
      const authorized = await service.read({ photoId: evidence.result.photoId, admin: true })
      assert.equal(authorized.status, 200)
      await authorized.body?.cancel()
      const stored = await payload.findByID({ collection: 'photos', id: evidence.result.photoId, overrideAccess: true })
      assert.equal(stored.ownerAdminId, String(admin.id))
      assert.equal(stored.ownerSessionHash, null)
    })
  } finally {
    await payload.destroy()
  }
})
