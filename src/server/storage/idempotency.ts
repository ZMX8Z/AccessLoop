import type { Payload } from 'payload'
import { z } from 'zod'

import type { JsonValue } from '@/shared/contracts/storage'

import { fingerprint, StorageError } from './value'
import { withTransaction, type Transaction } from './transaction'

const ScopeSchema = z.strictObject({
  subject: z.string().min(1), method: z.enum(['POST', 'PATCH', 'DELETE']),
  path: z.string().startsWith('/api/'), key: z.string().min(8).max(128),
  purpose: z.string().min(1).optional(),
})

export async function runIdempotentCommand<T extends JsonValue>(payload: Payload, input: {
  subject: string; method: 'POST' | 'PATCH' | 'DELETE'; path: string; key: string; purpose?: string
  request: JsonValue; resultSchema: z.ZodType<T>; now?: Date
}, command: (transaction: Transaction) => Promise<T>): Promise<{ replayed: boolean; result: T }> {
  const scope = ScopeSchema.parse({
    subject: input.subject, method: input.method, path: input.path, key: input.key,
    ...(input.purpose ? { purpose: input.purpose } : {}),
  })
  const id = fingerprint(scope)
  const requestFingerprint = fingerprint(input.request)
  const now = input.now ?? new Date()
  return withTransaction(payload, async (transaction) => {
    await transaction.lock(`idempotency:${id}`)
    const { req } = transaction
    const { docs } = await payload.find({
      collection: 'idempotency-records', where: { id: { equals: id } }, limit: 1,
      depth: 0, overrideAccess: true, req,
    })
    const prior = docs[0]
    if (prior && Date.parse(prior.expiresAt) > now.getTime()) {
      if (prior.requestFingerprint !== requestFingerprint) {
        throw new StorageError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with different input.')
      }
      return { replayed: true, result: input.resultSchema.parse(prior.result) }
    }
    if (prior) await payload.delete({ collection: 'idempotency-records', id, overrideAccess: true, req })
    const result = input.resultSchema.parse(await command(transaction))
    await payload.create({
      collection: 'idempotency-records', data: {
        id, requestFingerprint, result: z.json().parse(result),
        expiresAt: new Date((input.now ?? new Date()).getTime() + 86_400_000).toISOString(),
      }, overrideAccess: true, req,
    })
    return { replayed: false, result }
  })
}
