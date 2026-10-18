import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { z } from 'zod'
import { AppError } from '../http/errors'
import { requireRegion } from '../storage/regions'
import { requireSession } from '../storage/sessions'
import { withTransaction, type Transaction } from '../storage/transaction'
import { fingerprint } from '../storage/value'
import { IdSchema } from '../../shared/contracts/common'
import { SessionHashSchema } from '../../shared/contracts/storage'
import { AnalysisTaskSchema, type AnalysisTaskDTO } from '../../shared/contracts/vision'
import type { createAnalysisService } from './analysis'

const Invocation = z.strictObject({
  ownerSessionHash: SessionHashSchema, idempotencyKey: z.string().min(8).max(128),
  input: z.strictObject({ photoId: IdSchema, consent: z.literal(true) }),
})
const StoredTask = z.strictObject({
  kind: z.literal('analysis_task'), photoId: IdSchema,
  phase: z.enum(['queued', 'running', 'finished']), task: AnalysisTaskSchema,
})
const leaseMs = 180_000
const interrupted = (jobId: string): AnalysisTaskDTO => ({ jobId, status: 'failed', error: {
  code: 'ANALYSIS_INTERRUPTED', message: 'Analysis was interrupted. Explicitly retry to start a new task, or continue manually.',
} })
function failure(jobId: string, error: unknown): AnalysisTaskDTO {
  const messages = {
    RATE_LIMITED: 'Please wait before starting another analysis.', QUOTA_EXHAUSTED: 'The configured image analysis quota has been reached.',
    PROVIDER_UNAVAILABLE: 'The image analysis service is unavailable.', PROVIDER_TIMEOUT: 'The image analysis service took too long to respond.',
    ANALYSIS_STALE: 'The photo or analysis configuration changed. Review the current photo before retrying.',
  } as const
  const code = error instanceof AppError && error.code in messages ? error.code as keyof typeof messages : 'INTERNAL_ERROR'
  const retry = error instanceof AppError ? error.details?.retryAfterSec : undefined
  return AnalysisTaskSchema.parse({ jobId, status: 'failed', error: { code,
    message: code === 'INTERNAL_ERROR' ? 'Analysis could not be completed. Your photo is retained.' : messages[code],
    ...(typeof retry === 'number' && Number.isFinite(retry) ? { retryAfterSec: Math.min(86400, Math.max(0, Math.ceil(retry))) } : {}),
  } })
}

/** C's existing Payload connection and durable operations own both tasks and analyses. GET never runs work. */
export function createAnalysisTasks(payload: Payload, options: {
  regionId: string; analysis: Pick<ReturnType<typeof createAnalysisService>, 'analyze'>; now?: () => number
}) {
  const now = options.now ?? Date.now
  const regionId = IdSchema.parse(options.regionId)
  async function ownedPhoto(photoId: string, owner: string, transaction?: Transaction) {
    const found = await payload.count({ collection: 'photos', overrideAccess: true, ...(transaction ? { req: transaction.req } : {}),
      where: { and: [{ id: { equals: photoId } }, { regionId: { equals: regionId } }, { ownerSessionHash: { equals: owner } },
        { purpose: { equals: 'report' } }, { uploadState: { equals: 'ready' } }] } })
    if (!found.totalDocs) throw new AppError(404, 'NOT_FOUND', 'The photo is unavailable.')
  }
  async function operation(jobId: string, owner: string, transaction?: Transaction) {
    const { docs } = await payload.find({ collection: 'external-operations', overrideAccess: true, depth: 0, limit: 1,
      ...(transaction ? { req: transaction.req } : {}), where: { and: [{ id: { equals: jobId } },
        { regionId: { equals: regionId } }, { ownerSessionHash: { equals: owner } }, { expiresAt: { greater_than: new Date(now()).toISOString() } }] } })
    return docs[0]
  }
  function view(entry: NonNullable<Awaited<ReturnType<typeof operation>>>): AnalysisTaskDTO {
    const stored = StoredTask.parse(entry.result)
    return stored.task.status === 'pending' && (!entry.leaseExpiresAt || Date.parse(entry.leaseExpiresAt) <= now())
      ? interrupted(entry.id) : stored.task
  }
  return {
    async submit(raw: z.infer<typeof Invocation>): Promise<{ task: AnalysisTaskDTO; run?: () => Promise<void> }> {
      const parsed = Invocation.safeParse(raw)
      if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', 'A photo and explicit image analysis consent are required.')
      const { ownerSessionHash: owner, idempotencyKey, input } = parsed.data
      await requireSession(payload, owner); await requireRegion(payload, regionId)
      const jobId = fingerprint({ regionId, subject: owner, path: '/api/analyze/tasks', key: idempotencyKey })
      const requestFingerprint = fingerprint(input), token = randomUUID()
      const pending: AnalysisTaskDTO = { jobId, status: 'pending', pollAfterSec: 2 }
      const created = await withTransaction(payload, async transaction => {
        await transaction.lock(`analysis-task:${jobId}`)
        await ownedPhoto(input.photoId, owner, transaction)
        const prior = await operation(jobId, owner, transaction)
        if (prior) {
          if (prior.requestFingerprint !== requestFingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This key was already used with different input.')
          return { created: false, task: view(prior) }
        }
        // Expired rows are outside the idempotency retention window; replace under the same lock.
        await payload.delete({ collection: 'external-operations', where: { id: { equals: jobId } }, overrideAccess: true, req: transaction.req })
        await payload.create({ collection: 'external-operations', overrideAccess: true, req: transaction.req, data: {
          id: jobId, regionId, ownerSessionHash: owner, requestFingerprint, status: 'pending', leaseToken: token,
          leaseExpiresAt: new Date(now() + leaseMs).toISOString(), expiresAt: new Date(now() + 86_400_000).toISOString(),
          result: { kind: 'analysis_task', photoId: input.photoId, phase: 'queued', task: pending },
        } })
        return { created: true, task: pending }
      })
      if (!created.created) return { task: created.task }
      return { task: pending, run: async () => {
        const acquired = await withTransaction(payload, async transaction => {
          await transaction.lock(`analysis-task:${jobId}`)
          const current = await operation(jobId, owner, transaction)
          if (!current || current.leaseToken !== token || view(current).status !== 'pending') return false
          const stored = StoredTask.parse(current.result)
          if (stored.phase !== 'queued') return false
          await payload.update({ collection: 'external-operations', id: jobId, overrideAccess: true, req: transaction.req,
            data: { result: { ...stored, phase: 'running' } } })
          return true
        })
        if (!acquired) return
        let completed: AnalysisTaskDTO
        try {
          const result = await options.analysis.analyze({ ownerSessionHash: owner, idempotencyKey: `task:${jobId}`, input })
          completed = { jobId, status: 'completed', analysis: result.result }
        } catch (error) { completed = failure(jobId, error) }
        await withTransaction(payload, async transaction => {
          await transaction.lock(`analysis-task:${jobId}`)
          const current = await operation(jobId, owner, transaction)
          if (!current || current.leaseToken !== token || view(current).status !== 'pending') return
          await payload.update({ collection: 'external-operations', id: jobId, overrideAccess: true, req: transaction.req,
            data: { status: 'completed', leaseToken: null, leaseExpiresAt: null,
              result: z.json().parse({ kind: 'analysis_task', photoId: input.photoId, phase: 'finished', task: completed }) } })
        })
      } }
    },
    async read(input: { ownerSessionHash: string; jobId: string }): Promise<AnalysisTaskDTO> {
      const owner = SessionHashSchema.parse(input.ownerSessionHash)
      const jobId = z.string().regex(/^[a-f0-9]{64}$/).parse(input.jobId)
      await requireSession(payload, owner); await requireRegion(payload, regionId)
      const current = await operation(jobId, owner)
      const stored = StoredTask.safeParse(current?.result)
      if (!current || !stored.success) throw new AppError(404, 'NOT_FOUND', 'The analysis task is unavailable.')
      await ownedPhoto(stored.data.photoId, owner)
      return view(current)
    },
  }
}
