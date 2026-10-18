import { createHash, randomUUID } from 'node:crypto'
import { createLocalReq, type Payload, type PayloadRequest } from 'payload'
import { z } from 'zod'

import { AppError } from '@/server/http/errors'
import { requireRegion } from '@/server/storage/regions'
import { requireSession } from '@/server/storage/sessions'
import { withTransaction } from '@/server/storage/transaction'
import { fingerprint, StorageError } from '@/server/storage/value'
import { IdSchema } from '@/shared/contracts/common'
import { PhotoMimeSchema, PhotoPurposeSchema, UploadDTOSchema, type PhotoPurpose, type UploadDTO } from '@/shared/contracts/photos'
import { SessionHashSchema } from '@/shared/contracts/storage'

import { ImageProcessingError, MAX_IMAGE_EDGE, processReportImage } from './image'

const MAX_STORED_BYTES = MAX_IMAGE_EDGE * MAX_IMAGE_EDGE * 4 + 1024 * 1024
const UPLOAD_LEASE_MS = 120_000
const SubjectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('anonymous'), ownerSessionHash: SessionHashSchema }),
  z.strictObject({ kind: z.literal('admin'), adminId: z.union([IdSchema, z.number().int().positive()]).transform(String) }),
])
export type PhotoSubject = z.input<typeof SubjectSchema>

export const PhotoRecordSchema = z.object({
  id: IdSchema, regionId: IdSchema, purpose: PhotoPurposeSchema,
  ownerSessionHash: SessionHashSchema.nullable().optional(), ownerAdminId: IdSchema.nullable().optional(),
  imageHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  uploadState: z.enum(['staging', 'ready']),
  filename: z.string().regex(/^[a-f0-9-]+\.(?:jpg|png)$/),
  prefix: z.string().optional(),
  mimeType: PhotoMimeSchema,
  filesize: z.number().int().positive().max(MAX_STORED_BYTES),
  width: z.number().int().min(1).max(MAX_IMAGE_EDGE), height: z.number().int().min(1).max(MAX_IMAGE_EDGE),
})
export type PhotoRecord = z.infer<typeof PhotoRecordSchema>
type ProcessedImage = Awaited<ReturnType<typeof processReportImage>>
type PhotoWrite = {
  id: string; regionId: string; purpose: PhotoPurpose; ownerSessionHash: string | null; ownerAdminId: string | null
  imageHash: string; uploadState: 'staging'
}

/** The production implementation uses Payload's configured storage plugin. */
export type PhotoBinaryStore = {
  save(input: { data: PhotoWrite; filename: string; image: ProcessedImage }): Promise<PhotoRecord>
  read(photo: PhotoRecord, signal?: AbortSignal): Promise<Response>
}

function unavailable() {
  return new AppError(503, 'PROVIDER_UNAVAILABLE', 'Photo storage is unavailable. Please try again later.')
}

function notFound() {
  return new AppError(404, 'NOT_FOUND', 'The photo was not found.')
}

function busy(retryAfterSec: number) {
  return new AppError(429, 'RATE_LIMITED', 'This upload is still processing. Please wait before trying again.', { retryAfterSec })
}

async function photoRequest(payload: Payload, signal?: AbortSignal) {
  return createLocalReq({
    context: { internalPhotoRead: true, internalPhotoWrite: true },
    req: { headers: new Headers(), ...(signal ? { signal } : {}) },
  }, payload)
}

function payloadBinaryStore(payload: Payload): PhotoBinaryStore {
  function configuredUploadHandlers() {
    const upload = payload.collections.photos?.config.upload
    if (!upload || typeof upload !== 'object' || upload.adapter !== 's3' || !upload.handlers?.length) throw unavailable()
    return upload.handlers
  }
  return {
    async save({ data, filename, image }) {
      configuredUploadHandlers()
      // A fresh request deliberately has no transactionID: OSS is outside DB transactions.
      const req = await photoRequest(payload)
      const existing = await payload.find({ collection: 'photos', where: { id: { equals: data.id } }, limit: 1, depth: 0, overrideAccess: true, req })
      if (existing.docs[0]) {
        const previous = PhotoRecordSchema.parse(existing.docs[0])
        if (previous.imageHash !== image.imageHash) throw unavailable()
        if (previous.uploadState === 'ready') return previous
      }
      const file = { data: image.buffer, mimetype: image.mime, name: filename, size: image.bytes }
      const record = existing.docs[0]
        // Retrying a file must never downgrade a concurrently completed photo to staging.
        ? await payload.update({ collection: 'photos', id: data.id, data: {}, file, overwriteExistingFiles: true, disableTransaction: true, overrideAccess: true, depth: 0, req })
        : await payload.create({ collection: 'photos', data, file, overwriteExistingFiles: true, disableTransaction: true, overrideAccess: true, depth: 0, req })
      return PhotoRecordSchema.parse(record)
    },
    async read(photo, signal) {
      const handlers = configuredUploadHandlers()
      const req = await photoRequest(payload, signal)
      for (const handler of handlers) {
        const response = await handler(req, {
          doc: photo, headers: new Headers(),
          params: { collection: 'photos', filename: photo.filename },
        })
        if (response instanceof Response) return response
      }
      throw unavailable()
    },
  }
}

function uploadDTO(photo: PhotoRecord): UploadDTO {
  return UploadDTOSchema.parse({
    photoId: photo.id, purpose: photo.purpose, mime: photo.mimeType,
    bytes: photo.filesize, width: photo.width, height: photo.height,
  })
}

async function readImageBytes(response: Response, photo: PhotoRecord) {
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel()
    throw unavailable()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > photo.filesize || length > MAX_STORED_BYTES) {
        await reader.cancel()
        throw unavailable()
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = Buffer.concat(chunks)
  if (bytes.length !== photo.filesize || `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== photo.imageHash) throw unavailable()
  return bytes
}

export function createPhotoService(payload: Payload, options: {
  regionId: string; now?: () => Date; binaryStore?: PhotoBinaryStore
}) {
  const regionId = IdSchema.parse(options.regionId)
  const now = options.now ?? (() => new Date())
  const store = options.binaryStore ?? payloadBinaryStore(payload)

  async function requireSubject(subject: z.output<typeof SubjectSchema>, req?: PayloadRequest) {
    await requireRegion(payload, regionId, req)
    if (subject.kind === 'anonymous') {
      try { await requireSession(payload, subject.ownerSessionHash, req) }
      catch (error) {
        if (error instanceof StorageError && error.code === 'NOT_FOUND') throw new AppError(401, 'UNAUTHENTICATED', 'Initialize an anonymous session before uploading.')
        throw error
      }
    } else {
      const { totalDocs } = await payload.count({
        collection: 'admins', where: { and: [{ id: { equals: subject.adminId } }, { enabled: { equals: true } }, { role: { in: ['report_admin', 'operator'] } }] },
        overrideAccess: true, req,
      })
      if (totalDocs === 0) throw new AppError(401, 'UNAUTHENTICATED', 'An enabled administrator session is required.')
    }
  }

  async function findPhoto(photoId: string, req?: PayloadRequest) {
    const readReq = req ?? await photoRequest(payload)
    readReq.context.internalPhotoRead = true
    const { docs } = await payload.find({
      collection: 'photos', where: { and: [{ id: { equals: photoId } }, { regionId: { equals: regionId } }] },
      depth: 0, limit: 1, overrideAccess: true, req: readReq,
    })
    return docs[0] ? PhotoRecordSchema.parse(docs[0]) : null
  }

  async function ownedPhoto(input: { photoId: string; ownerSessionHash?: string; admin?: boolean }) {
    const photo = await findPhoto(IdSchema.parse(input.photoId))
    if (!photo || photo.uploadState !== 'ready' || (!input.admin && (photo.purpose !== 'report' || !input.ownerSessionHash || photo.ownerSessionHash !== input.ownerSessionHash))) throw notFound()
    if (!input.admin) await requireSubject(SubjectSchema.parse({ kind: 'anonymous', ownerSessionHash: input.ownerSessionHash }))
    return photo
  }

  async function upload(input: {
    subject: PhotoSubject; purpose: PhotoPurpose; idempotencyKey: string; bytes: Buffer; mime: string
  }): Promise<{ replayed: boolean; result: UploadDTO }> {
    const subject = SubjectSchema.parse(input.subject)
    const purpose = PhotoPurposeSchema.parse(input.purpose)
    const key = z.string().min(8).max(128).parse(input.idempotencyKey)
    if (purpose === 'report' && subject.kind !== 'anonymous') throw new AppError(401, 'UNAUTHENTICATED', 'Report photos require an anonymous session.')
    if (purpose === 'review_evidence' && subject.kind !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Review evidence requires an administrator.')
    await requireSubject(subject)
    const id = fingerprint({ regionId, subject, purpose, method: 'POST', path: '/api/uploads', key })
    const requestFingerprint = fingerprint({ mime: input.mime, bytes: createHash('sha256').update(input.bytes).digest('hex') })
    const previous = await payload.find({ collection: 'photo-upload-operations', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true })
    if (previous.docs[0]) {
      if (previous.docs[0].requestFingerprint !== requestFingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This upload key was already used with different image content.')
      if (previous.docs[0].state === 'complete') return { replayed: true, result: UploadDTOSchema.parse(previous.docs[0].result) }
    }
    let image: ProcessedImage
    try { image = await processReportImage(input.bytes, input.mime) }
    catch (error) {
      if (error instanceof ImageProcessingError) throw new AppError(error.code === 'too_large' || error.code === 'too_many_pixels' ? 413 : 415, error.code === 'too_large' || error.code === 'too_many_pixels' ? 'FILE_TOO_LARGE' : 'INVALID_MEDIA', error.message)
      throw error
    }

    const leaseToken = randomUUID()
    const claim = await withTransaction(payload, async ({ req, lock }) => {
      await lock(`photo-upload:${id}`)
      await requireSubject(subject, req)
      const { docs } = await payload.find({ collection: 'photo-upload-operations', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req })
      const prior = docs[0]
      if (prior) {
        if (prior.requestFingerprint !== requestFingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This upload key was already used with different image content.')
        if (prior.state === 'complete') return { kind: 'replay', result: UploadDTOSchema.parse(prior.result) } as const
        if (prior.state === 'pending' && Date.parse(prior.leaseExpiresAt) > now().getTime()) throw busy(Math.max(1, Math.ceil((Date.parse(prior.leaseExpiresAt) - now().getTime()) / 1000)))
        await payload.update({ collection: 'photo-upload-operations', id, data: { state: 'pending', leaseToken, leaseExpiresAt: new Date(now().getTime() + UPLOAD_LEASE_MS).toISOString() }, overrideAccess: true, req })
        return { kind: 'claimed', photoId: prior.photoId, filename: prior.filename } as const
      }
      const photoId = randomUUID()
      const filename = `${randomUUID()}.${image.mime === 'image/jpeg' ? 'jpg' : 'png'}`
      await payload.create({ collection: 'photo-upload-operations', data: { id, requestFingerprint, photoId, filename, state: 'pending', leaseToken, leaseExpiresAt: new Date(now().getTime() + UPLOAD_LEASE_MS).toISOString() }, overrideAccess: true, req })
      return { kind: 'claimed', photoId, filename } as const
    })
    if (claim.kind === 'replay') return { replayed: true, result: claim.result }

    try {
      let photo = await findPhoto(claim.photoId)
      let stored = false
      if (photo) {
        if (photo.imageHash !== image.imageHash) throw unavailable()
        const response = await store.read(photo)
        if (response.status === 404) await response.body?.cancel()
        else { await readImageBytes(response, photo); stored = true }
      }
      if (!stored) {
        photo = await store.save({
          data: {
            id: claim.photoId, regionId, purpose,
            ownerSessionHash: subject.kind === 'anonymous' ? subject.ownerSessionHash : null,
            ownerAdminId: subject.kind === 'admin' ? subject.adminId : null,
            imageHash: image.imageHash, uploadState: 'staging',
          },
          filename: claim.filename, image,
        })
      }
      if (!photo) throw unavailable()
      const result = uploadDTO(photo)
      await withTransaction(payload, async ({ req, lock }) => {
        await lock(`photo-upload:${id}`)
        const { docs } = await payload.find({ collection: 'photo-upload-operations', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req })
        const operation = docs[0]
        if (!operation || operation.state !== 'pending' || operation.leaseToken !== leaseToken) throw busy(1)
        req.context.internalPhotoWrite = true
        await payload.update({ collection: 'photos', id: claim.photoId, data: { uploadState: 'ready' }, overrideAccess: true, req })
        await payload.update({ collection: 'photo-upload-operations', id, data: { state: 'complete', result }, overrideAccess: true, req })
      })
      return { replayed: false, result }
    } catch (error) {
      await withTransaction(payload, async ({ req, lock }) => {
        await lock(`photo-upload:${id}`)
        const { docs } = await payload.find({ collection: 'photo-upload-operations', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req })
        if (docs[0]?.state === 'pending' && docs[0].leaseToken === leaseToken) await payload.update({ collection: 'photo-upload-operations', id, data: { state: 'failed' }, overrideAccess: true, req })
      })
      if (error instanceof AppError) throw error
      throw unavailable()
    }
  }

  return {
    upload,
    async read(input: { photoId: string; ownerSessionHash?: string; admin?: boolean; signal?: AbortSignal }) {
      const photo = await ownedPhoto(input)
      const response = await store.read(photo, input.signal)
      if (response.status !== 200 || !response.body) { await response.body?.cancel(); throw unavailable() }
      return new Response(response.body, { headers: {
        'Content-Type': photo.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      } })
    },
    async readOwnedReportBytes(input: { photoId: string; ownerSessionHash: string }) {
      const photo = await ownedPhoto({ ...input, admin: false })
      const bytes = await readImageBytes(await store.read(photo), photo)
      return { photo, bytes, mime: photo.mimeType }
    },
  }
}
