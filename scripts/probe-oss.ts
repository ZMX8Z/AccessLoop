import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import nextEnv from '@next/env'
import sharp from 'sharp'
import { z } from 'zod'
import { getOssStorageOptions, PHOTO_STORAGE_PREFIX } from '../src/server/photos/oss'
import { processReportImage } from '../src/server/photos/image'

type ObjectInput = { Bucket: string; Key: string }
type MetadataResult = { $metadata?: { httpStatusCode?: number; requestId?: string } }
type ProbeClient = {
  putObject(input: ObjectInput & { ACL: 'private'; Body: Buffer; ContentType: string }): Promise<MetadataResult>
  getObject(input: ObjectInput): Promise<MetadataResult & { Body?: { transformToByteArray(): Promise<Uint8Array> } }>
  headObject(input: ObjectInput): Promise<MetadataResult>
  deleteObject(input: ObjectInput): Promise<MetadataResult>
  destroy(): void
}

const sdkSchema = z.object({
  S3: z.custom<new (config: ReturnType<typeof getOssStorageOptions>['config']) => ProbeClient>((value) => typeof value === 'function'),
  GetObjectCommand: z.custom<new (input: ObjectInput) => unknown>((value) => typeof value === 'function'),
})
const presignerSchema = z.object({
  getSignedUrl: z.custom<(client: ProbeClient, command: unknown, options: { expiresIn: number }) => Promise<string>>((value) => typeof value === 'function'),
})
const errorSchema = z.object({
  name: z.string().optional(),
  $metadata: z.object({ httpStatusCode: z.number().optional(), requestId: z.string().optional() }).optional(),
})
const safeErrorNames = new Set(['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'NoSuchBucket', 'NoSuchKey', 'NotFound', 'RequestTimeout', 'TimeoutError', 'NetworkingError', 'AbortError', 'OssConfigurationError'])

function safeFailure(error: unknown) {
  const parsed = errorSchema.safeParse(error)
  return {
    category: parsed.success && parsed.data.name && safeErrorNames.has(parsed.data.name) ? parsed.data.name : 'oss_probe_failed',
    httpStatus: parsed.success ? parsed.data.$metadata?.httpStatusCode ?? null : null,
    requestId: parsed.success && /^[A-Za-z0-9-]{1,128}$/.test(parsed.data.$metadata?.requestId ?? '') ? parsed.data.$metadata?.requestId : null,
  }
}

function assertProbe(condition: boolean, stage: string) {
  if (!condition) throw new Error(`Probe assertion failed: ${stage}`)
}

async function main() {
  nextEnv.loadEnvConfig(process.cwd())
  const options = getOssStorageOptions(process.env)
  // The probe resolves the same pinned SDK as Payload's installed S3 adapter.
  // Production photo reads use Payload's adapter handler instead of this script.
  const appRequire = createRequire(import.meta.url)
  const storageRequire = createRequire(appRequire.resolve('@payloadcms/storage-s3'))
  const sdk = sdkSchema.parse(storageRequire('@aws-sdk/client-s3'))
  const presigner = presignerSchema.parse(storageRequire('@aws-sdk/s3-request-presigner'))
  const client = new sdk.S3(options.config)
  const key = `${PHOTO_STORAGE_PREFIX}/probes/${randomUUID()}.png`
  const target = { Bucket: options.bucket, Key: key }
  const endpoint = new URL(String(options.config.endpoint))
  endpoint.hostname = `${options.bucket}.${endpoint.hostname}`
  endpoint.pathname = key.split('/').map(encodeURIComponent).join('/')
  const original = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#308066' } }).png().toBuffer()
  const image = await processReportImage(original, 'image/png')
  let attemptedUpload = false
  let stage = 'upload'
  let completed = false

  try {
    attemptedUpload = true
    const put = await client.putObject({ ...target, ACL: 'private', Body: image.buffer, ContentType: image.mime })
    console.log(JSON.stringify({ service: 'oss', stage, ok: true, httpStatus: put.$metadata?.httpStatusCode ?? null }))

    stage = 'authenticated_read'
    const get = await client.getObject(target)
    if (!get.Body) throw new Error('Missing object body')
    const restored = await get.Body.transformToByteArray()
    const hashMatches = createHash('sha256').update(restored).digest('hex') === image.imageHash.slice(7)
    assertProbe(hashMatches, stage)
    console.log(JSON.stringify({ service: 'oss', stage, ok: true, hashMatches, httpStatus: get.$metadata?.httpStatusCode ?? null }))

    stage = 'anonymous_read_denied'
    const anonymous = await fetch(endpoint, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    await anonymous.body?.cancel()
    const denied = anonymous.status === 403 || anonymous.status === 401
    assertProbe(denied, stage)
    console.log(JSON.stringify({ service: 'oss', stage, ok: true, denied, httpStatus: anonymous.status }))

    stage = 'signed_read'
    const signedUrl = await presigner.getSignedUrl(client, new sdk.GetObjectCommand(target), { expiresIn: 30 })
    const signed = await fetch(signedUrl, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    const signedBytes = new Uint8Array(await signed.arrayBuffer())
    const signedHashMatches = createHash('sha256').update(signedBytes).digest('hex') === image.imageHash.slice(7)
    assertProbe(signed.ok && signedHashMatches, stage)
    console.log(JSON.stringify({ service: 'oss', stage, ok: true, hashMatches: signedHashMatches, httpStatus: signed.status }))
    completed = true
  } catch (error) {
    console.error(JSON.stringify({ service: 'oss', stage, ok: false, ...safeFailure(error) }))
    process.exitCode = 1
  } finally {
    if (attemptedUpload) {
      try {
        const deleted = await client.deleteObject(target)
        let deletionConfirmed = false
        try {
          await client.headObject(target)
        } catch (error) {
          const failure = safeFailure(error)
          deletionConfirmed = failure.httpStatus === 404
          if (!deletionConfirmed) throw error
        }
        assertProbe(deletionConfirmed, 'delete_confirmation')
        console.log(JSON.stringify({ service: 'oss', stage: 'cleanup', ok: true, deletionConfirmed, httpStatus: deleted.$metadata?.httpStatusCode ?? null }))
      } catch (error) {
        console.error(JSON.stringify({ service: 'oss', stage: 'cleanup', ok: false, ...safeFailure(error) }))
        process.exitCode = 1
        completed = false
      }
    }
    client.destroy()
  }
  console.log(JSON.stringify({ service: 'oss', stage: 'summary', ok: completed && process.exitCode !== 1 }))
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ service: 'oss', stage: 'configuration', ok: false, ...safeFailure(error) }))
  process.exitCode = 1
})
