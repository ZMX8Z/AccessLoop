import { createHash, randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { z } from 'zod'

import type { Photo } from '../../payload-types'
import { AppError } from '../http/errors'
import { ProviderGate } from '../providers/gate'
import { createGlmAdapter, DEFAULT_VISION_MODEL, DEFAULT_VISION_TIMEOUT_MS, parseVisionPolicy } from '../providers/glm'
import { ProviderError } from '../providers/provider-error'
import { createRoutingRepository } from '../storage/routing-repository'
import { requireRegion } from '../storage/regions'
import { requireSession } from '../storage/sessions'
import { withTransaction, type Transaction } from '../storage/transaction'
import { fingerprint } from '../storage/value'
import { IdSchema } from '../../shared/contracts/common'
import { SessionHashSchema } from '../../shared/contracts/storage'
import { AnalysisDTOSchema, VisionOutcomeSchema, type AnalysisDTO, type VisionOutcome } from '../../shared/contracts/vision'

const AnalyzeInputSchema = z.strictObject({ photoId: IdSchema, consent: z.literal(true) })
const InvocationSchema = z.strictObject({
  ownerSessionHash: SessionHashSchema, idempotencyKey: z.string().min(8).max(128), input: AnalyzeInputSchema,
})
const ConfigSchema = z.strictObject({
  model: z.string().trim().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  promptVersion: z.string().trim().min(1).max(64), schemaVersion: z.string().trim().min(1).max(64),
})
const PhotoSchema = z.object({
  id: IdSchema, regionId: IdSchema, purpose: z.enum(['report', 'review_evidence']),
  ownerSessionHash: SessionHashSchema.nullable().optional(), imageHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  uploadState: z.literal('ready'),
})
type OwnedPhoto = z.infer<typeof PhotoSchema>
type ReadOwnedReportBytes = (input: { photoId: string; ownerSessionHash: string }) => Promise<{
  photo: Pick<Photo, 'id' | 'regionId' | 'purpose' | 'ownerSessionHash' | 'imageHash' | 'uploadState'>;
  bytes: Buffer; mime: 'image/jpeg' | 'image/png'
}>
type Claim = { kind: 'owned'; leaseToken: string } | { kind: 'replay'; result: AnalysisDTO; replayed: boolean } | { kind: 'busy' }

function busy(): AppError {
  return new AppError(429, 'RATE_LIMITED', 'This image analysis is still being processed. Retry with the same idempotency key.', { retryAfterSec: 2 })
}
function photoNotFound(): AppError { return new AppError(404, 'NOT_FOUND', 'The photo is unavailable.') }

export function createAnalysisService(payload: Payload, options: {
  regionId: string; readOwnedReportBytes: ReadOwnedReportBytes;
  visionConfig?: { model: string; promptVersion: string; schemaVersion: string };
  adapter?: ReturnType<typeof createGlmAdapter>; gate?: Pick<ProviderGate, 'run'>;
  policy?: { minuteLimit: number; dayLimit: number }; now?: () => number; sleep?: (ms: number) => Promise<void>;
}) {
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const regionId = IdSchema.parse(options.regionId)
  const parsedConfig = ConfigSchema.safeParse(options.visionConfig ?? {
    model: process.env.VISION_MODEL?.trim() || DEFAULT_VISION_MODEL,
    promptVersion: process.env.VISION_PROMPT_VERSION?.trim() || '1', schemaVersion: process.env.VISION_SCHEMA_VERSION?.trim() || '1',
  })
  if (!parsedConfig.success) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The image analysis configuration is invalid.')
  const config = parsedConfig.data
  if (options.adapter && options.adapter.model !== config.model) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The image analysis model is not configured consistently.')
  const identity = options.adapter?.identity ?? `glm:${config.model}:native-vision-tool-v1:https://open.bigmodel.cn/api/paas/v4/chat/completions`
  const operationLifetimeMs = 86_400_000
  const leaseMs = 180_000

  async function ownedPhoto(photoId: string, ownerSessionHash: string, transaction?: Transaction): Promise<OwnedPhoto> {
    const { docs } = await payload.find({
      collection: 'photos', where: { and: [
        { id: { equals: photoId } }, { regionId: { equals: regionId } },
        { ownerSessionHash: { equals: ownerSessionHash } }, { purpose: { equals: 'report' } },
        { uploadState: { equals: 'ready' } },
      ] }, limit: 1, depth: 0, overrideAccess: true, ...(transaction ? { req: transaction.req } : {}),
    })
    if (!docs[0]) throw photoNotFound()
    return PhotoSchema.parse(docs[0])
  }

  return {
    async analyze(raw: z.infer<typeof InvocationSchema>): Promise<{ replayed: boolean; result: AnalysisDTO }> {
      const parsed = InvocationSchema.safeParse(raw)
      if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', 'A photo and explicit image analysis consent are required.')
      const { ownerSessionHash, idempotencyKey, input } = parsed.data
      await requireSession(payload, ownerSessionHash)
      await requireRegion(payload, regionId)
      const photo = await ownedPhoto(input.photoId, ownerSessionHash)
      const operationId = fingerprint({ regionId, subject: ownerSessionHash, method: 'POST', path: '/api/analyze', key: idempotencyKey })
      const requestFingerprint = fingerprint(input)
      const cacheKey = fingerprint({ regionId, ownerSessionHash, imageHash: photo.imageHash, identity, ...config })

      const buildAnalysis = (outcome: VisionOutcome, cacheHit: boolean): AnalysisDTO => AnalysisDTOSchema.parse({
        ...outcome, analysisId: randomUUID(), photoId: photo.id, ...config,
        createdAt: new Date(now()).toISOString(), cacheHit,
      })
      const persistAnalysis = async (result: AnalysisDTO, transaction: Transaction): Promise<void> => {
        await payload.create({ collection: 'ai-analyses', overrideAccess: true, req: transaction.req, data: {
          id: result.analysisId, regionId, ownerSessionHash, photoId: photo.id, imageHash: photo.imageHash,
          // Unavailable results remain replayable by idempotency but are never found by the reusable cache key.
          cacheKey: result.aiStatus === 'unavailable' ? fingerprint({ cacheKey, unavailable: result.analysisId }) : cacheKey,
          analysis: z.json().parse(result),
        } })
      }
      const claim = async (): Promise<Claim> => withTransaction(payload, async (transaction) => {
        await transaction.lock(`external-analysis:${operationId}`)
        await requireSession(payload, ownerSessionHash, transaction.req)
        await requireRegion(payload, regionId, transaction.req)
        const currentPhoto = await ownedPhoto(photo.id, ownerSessionHash, transaction)
        if (currentPhoto.imageHash !== photo.imageHash) throw new AppError(409, 'ANALYSIS_STALE', 'The photo has changed. Analyze the current photo again.')
        const { docs } = await payload.find({ collection: 'external-operations', where: { id: { equals: operationId } },
          limit: 1, depth: 0, overrideAccess: true, req: transaction.req })
        const prior = docs[0]
        const timestamp = now()
        if (prior && Date.parse(prior.expiresAt) > timestamp) {
          if (prior.requestFingerprint !== requestFingerprint || prior.regionId !== regionId || prior.ownerSessionHash !== ownerSessionHash) {
            throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with different input.')
          }
          if (prior.status === 'completed') return { kind: 'replay', result: AnalysisDTOSchema.parse(prior.result), replayed: true }
          if (prior.leaseExpiresAt && Date.parse(prior.leaseExpiresAt) > timestamp) return { kind: 'busy' }
        }
        if (prior) await payload.delete({ collection: 'external-operations', id: operationId, overrideAccess: true, req: transaction.req })
        const { docs: cached } = await payload.find({ collection: 'ai-analyses', where: { and: [
          { regionId: { equals: regionId } }, { ownerSessionHash: { equals: ownerSessionHash } },
          { imageHash: { equals: photo.imageHash } }, { cacheKey: { equals: cacheKey } },
        ] }, sort: '-createdAt', limit: 1, depth: 0, overrideAccess: true, req: transaction.req })
        const cache = cached[0] ? AnalysisDTOSchema.parse(cached[0].analysis) : null
        if (cache && cache.aiStatus !== 'unavailable') {
          const result = buildAnalysis(VisionOutcomeSchema.parse({ aiStatus: cache.aiStatus, result: cache.result, unavailableReason: null }), true)
          await persistAnalysis(result, transaction)
          await payload.create({ collection: 'external-operations', overrideAccess: true, req: transaction.req, data: {
            id: operationId, regionId, ownerSessionHash, requestFingerprint, status: 'completed',
            leaseToken: null, leaseExpiresAt: null, expiresAt: new Date(timestamp + operationLifetimeMs).toISOString(), result: z.json().parse(result),
          } })
          await payload.create({ collection: 'provider-events', overrideAccess: true, req: transaction.req,
            data: { id: randomUUID(), service: 'vision', kind: 'cache_hit', occurredAt: new Date(timestamp).toISOString() } })
          return { kind: 'replay', result, replayed: false }
        }
        const leaseToken = randomUUID()
        await payload.create({ collection: 'external-operations', overrideAccess: true, req: transaction.req, data: {
          id: operationId, regionId, ownerSessionHash, requestFingerprint, status: 'pending', leaseToken,
          leaseExpiresAt: new Date(timestamp + leaseMs).toISOString(), expiresAt: new Date(timestamp + operationLifetimeMs).toISOString(), result: null,
        } })
        return { kind: 'owned', leaseToken }
      })

      let ownership = await claim()
      for (let poll = 0; ownership.kind === 'busy' && poll < 10; poll += 1) { await sleep(100); ownership = await claim() }
      if (ownership.kind === 'busy') throw busy()
      if (ownership.kind === 'replay') return { replayed: ownership.replayed, result: ownership.result }
      const { leaseToken } = ownership
      const abandon = async (): Promise<void> => withTransaction(payload, async ({ req, lock }) => {
        await lock(`external-analysis:${operationId}`)
        const { docs } = await payload.find({ collection: 'external-operations', where: { id: { equals: operationId } },
          limit: 1, depth: 0, overrideAccess: true, req })
        if (docs[0]?.status === 'pending' && docs[0].leaseToken === leaseToken) {
          await payload.delete({ collection: 'external-operations', id: operationId, overrideAccess: true, req })
        }
      })
      const renewBeforeAttempt = async (): Promise<void> => withTransaction(payload, async ({ req, lock }) => {
        await lock(`external-analysis:${operationId}`)
        const { docs } = await payload.find({ collection: 'external-operations', where: { id: { equals: operationId } },
          limit: 1, depth: 0, overrideAccess: true, req })
        const current = docs[0]
        const timestamp = now()
        if (!current || current.status !== 'pending' || current.leaseToken !== leaseToken
          || !current.leaseExpiresAt || Date.parse(current.leaseExpiresAt) <= timestamp) throw busy()
        await payload.update({ collection: 'external-operations', id: operationId, overrideAccess: true, req,
          data: { leaseExpiresAt: new Date(timestamp + leaseMs).toISOString() } })
      })

      let outcome: VisionOutcome
      let attempted = false
      try {
        const read = await options.readOwnedReportBytes({ photoId: photo.id, ownerSessionHash })
        const readPhoto = PhotoSchema.parse(read.photo)
        if (readPhoto.id !== photo.id || readPhoto.regionId !== regionId || readPhoto.purpose !== 'report'
          || readPhoto.ownerSessionHash !== ownerSessionHash || readPhoto.imageHash !== photo.imageHash) throw photoNotFound()
        if (`sha256:${createHash('sha256').update(read.bytes).digest('hex')}` !== photo.imageHash) {
          throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The stored photo could not be verified.')
        }
        if (!options.adapter && (process.env.VISION_PROVIDER?.trim() || 'glm') !== 'glm') {
          throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The configured image analysis provider is unsupported.')
        }
        const adapter = options.adapter ?? createGlmAdapter({
          apiKey: process.env.VISION_API_KEY ?? '', model: config.model,
          timeoutMs: Number(process.env.VISION_TIMEOUT_MS?.trim() || DEFAULT_VISION_TIMEOUT_MS),
        })
        const policy = options.policy ?? parseVisionPolicy(process.env)
        const gate = options.gate ?? new ProviderGate(createRoutingRepository(payload, { regionId, sessionSecret: process.env.SESSION_SECRET ?? '', now }), { now })
        // Reject expired/superseded work before budget reservation or call telemetry. The durable lease covers the bounded background model deadline.
        await renewBeforeAttempt()
        const startedAt = now()
        outcome = VisionOutcomeSchema.parse(await gate.run({
          service: 'vision', keyFingerprint: adapter.keyFingerprint, policy,
          maxAttemptMs: adapter.timeoutMs, deadlineAt: startedAt + adapter.timeoutMs + 1000,
          isErrorResult: (value) => value.aiStatus === 'unavailable',
          operation: () => {
            attempted = true
            return adapter.analyze({ bytes: read.bytes, mime: read.mime })
          },
        }))
      } catch (error) {
        const providerFailure = error instanceof ProviderError || (error instanceof AppError
          && ['RATE_LIMITED', 'QUOTA_EXHAUSTED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE'].includes(error.code))
        // A retry can be denied by the gate after the first real attempt. That still completes as unavailable.
        if (!attempted || !providerFailure || !(error instanceof AppError)) { await abandon(); throw error }
        outcome = { aiStatus: 'unavailable', result: null,
          unavailableReason: error.code === 'PROVIDER_TIMEOUT' ? 'provider_timeout' : 'provider_unavailable' }
      }
      const result = buildAnalysis(outcome, false)
      return withTransaction(payload, async (transaction) => {
        await transaction.lock(`external-analysis:${operationId}`)
        const { docs } = await payload.find({ collection: 'external-operations', where: { id: { equals: operationId } },
          limit: 1, depth: 0, overrideAccess: true, req: transaction.req })
        const current = docs[0]
        if (current?.status === 'completed') return { replayed: true, result: AnalysisDTOSchema.parse(current.result) }
        if (!current || current.leaseToken !== leaseToken) throw busy()
        const currentPhoto = await ownedPhoto(photo.id, ownerSessionHash, transaction)
        if (currentPhoto.imageHash !== photo.imageHash) throw new AppError(409, 'ANALYSIS_STALE', 'The photo has changed. Analyze the current photo again.')
        await persistAnalysis(result, transaction)
        await payload.update({ collection: 'external-operations', id: operationId, overrideAccess: true, req: transaction.req, data: {
          status: 'completed', result: z.json().parse(result), leaseToken: null, leaseExpiresAt: null,
          expiresAt: new Date(now() + operationLifetimeMs).toISOString(),
        } })
        return { replayed: false, result }
      })
    },
  }
}
