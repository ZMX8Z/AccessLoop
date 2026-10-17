import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { z } from 'zod'

import { AppError } from '@/server/http/errors'
import { requireRegion } from '@/server/storage/regions'
import { contextId } from '@/server/storage/sessions'
import { withTransaction, type Transaction } from '@/server/storage/transaction'
import { fingerprint } from '@/server/storage/value'
import { PrivateReportDTOSchema, type PrivateReportDTO } from '@/shared/contracts/hazards'
import type { ReviewActor, ReviewInput } from '@/shared/contracts/review'

import { lockReport, readReport } from './repository'

const ActorRecordSchema = z.object({ id: z.union([z.string().min(1), z.number().int().positive()]).transform(String), enabled: z.literal(true), role: z.enum(['operator', 'report_admin']) })

export async function requireReviewActor(payload: Payload, transaction: Transaction, actor: ReviewActor) {
  if (!/^[1-9]\d{0,9}$/.test(actor.id) || Number(actor.id) > 2_147_483_647) {
    throw new AppError(403, 'FORBIDDEN', 'An enabled report administrator is required.')
  }
  await transaction.execute(sql`SELECT id FROM admins WHERE id::text = ${actor.id} FOR SHARE`)
  const { docs } = await payload.find({
    collection: 'admins', where: { id: { equals: actor.id } }, depth: 0, limit: 1, overrideAccess: true, req: transaction.req,
  })
  const account = ActorRecordSchema.safeParse(docs[0])
  if (!account.success || account.data.id !== actor.id || account.data.role !== actor.role) {
    throw new AppError(403, 'FORBIDDEN', 'An enabled report administrator is required.')
  }
  return account.data
}

export async function lockReviewReport(payload: Payload, transaction: Transaction, input: { reportId: string; regionId: string }) {
  const initial = await readReport(payload, input, transaction.req)
  await transaction.execute(sql`SELECT id FROM regions WHERE id = ${input.regionId} FOR UPDATE`)
  const region = await requireRegion(payload, input.regionId, transaction.req)
  const owner = initial.ownerSessionHash
  const context = contextId(region.id, owner)
  await transaction.lock(`session-context:${context}`)
  const existing = await payload.count({ collection: 'session-contexts', where: { id: { equals: context } }, overrideAccess: true, req: transaction.req })
  if (existing.totalDocs === 0) await payload.create({
    collection: 'session-contexts', data: { id: context, regionId: region.id, ownerSessionHash: owner, personalVersion: 0 }, overrideAccess: true, req: transaction.req,
  })
  await transaction.execute(sql`SELECT id FROM session_contexts WHERE id = ${context} FOR UPDATE`)
  const report = await lockReport(payload, transaction, { ...input, ownerSessionHash: owner })
  return { report, region }
}

/** Authentication runs before reading a replay and shares the same transaction as the command. */
export async function runReviewCommand(payload: Payload, input: {
  actor: ReviewActor; regionId: string; reportId: string; idempotencyKey: string; request: ReviewInput; now: () => number
}, command: (transaction: Transaction) => Promise<PrivateReportDTO>) {
  const scope = {
    subject: `admin:${input.actor.id}`, method: 'PATCH', path: `/api/reports/${encodeURIComponent(input.reportId)}/review`,
    key: input.idempotencyKey, purpose: `region:${input.regionId}`,
  }
  const id = fingerprint(scope)
  const requestFingerprint = fingerprint(input.request)
  return withTransaction(payload, async (transaction) => {
    await transaction.lock(`idempotency:${id}`)
    await requireReviewActor(payload, transaction, input.actor)
    const { docs } = await payload.find({ collection: 'idempotency-records', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req: transaction.req })
    const prior = docs[0]
    if (prior && Date.parse(prior.expiresAt) > input.now()) {
      if (prior.requestFingerprint !== requestFingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with different input.')
      return { replayed: true, result: PrivateReportDTOSchema.parse(prior.result) }
    }
    if (prior) await payload.delete({ collection: 'idempotency-records', id, overrideAccess: true, req: transaction.req })
    const result = PrivateReportDTOSchema.parse(await command(transaction))
    await payload.create({
      collection: 'idempotency-records', data: { id, requestFingerprint, result: z.json().parse(result), expiresAt: new Date(input.now() + 86_400_000).toISOString() }, overrideAccess: true, req: transaction.req,
    })
    return { replayed: false, result }
  })
}
