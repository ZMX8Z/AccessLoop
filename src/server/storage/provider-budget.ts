import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import {
  ProviderBudgetSchema, ProviderServiceSchema, SessionHashSchema,
  type ProviderBudget, type ProviderService,
} from '@/shared/contracts/storage'

import { fingerprint, StorageError } from './value'
import { withTransaction } from './transaction'

export type BudgetReservation =
  | { kind: 'reserved'; reservationId: string; reservedAt: string }
  | { kind: 'limited'; retryAfterSec: number; resetAt: string }

export async function reserveProviderCall(payload: Payload, input: ProviderBudget & { now?: Date }): Promise<BudgetReservation> {
  const budget = ProviderBudgetSchema.parse({ service: input.service, keyFingerprint: input.keyFingerprint, windows: input.windows })
  return withTransaction(payload, async ({ req, lock }) => {
    const budgetKey = fingerprint({ service: budget.service, keyFingerprint: budget.keyFingerprint })
    await lock(`provider-budget:${budgetKey}`)
    const now = input.now ?? new Date()
    const block = await payload.find({
      collection: 'provider-blocks', where: { id: { equals: budgetKey } }, limit: 1, depth: 0, overrideAccess: true, req,
    })
    let resetTime = block.docs[0] ? Date.parse(block.docs[0].blockedUntil) : 0
    for (const window of budget.windows) {
      const windowStart = new Date(now.getTime() - window.seconds * 1000).toISOString()
      const reservations = await payload.find({
        collection: 'provider-usage', where: { and: [
          { service: { equals: budget.service } }, { keyFingerprint: { equals: budget.keyFingerprint } },
          { or: [{ reservedAt: { greater_than: windowStart } }, { startedAt: { greater_than: windowStart } }] },
        ] }, limit: 0, pagination: false, depth: 0, overrideAccess: true, req,
      })
      if (reservations.docs.length >= window.limit) {
        const chargedAt = reservations.docs.map((entry) => Math.max(Date.parse(entry.reservedAt), entry.startedAt ? Date.parse(entry.startedAt) : 0)).sort((left, right) => left - right)
        resetTime = Math.max(resetTime, chargedAt[chargedAt.length - window.limit] + window.seconds * 1000)
      }
    }
    if (resetTime > now.getTime()) {
      await payload.create({
        collection: 'provider-events',
        data: { id: randomUUID(), service: budget.service, kind: 'wait', occurredAt: now.toISOString() },
        overrideAccess: true, req,
      })
      return { kind: 'limited', retryAfterSec: Math.max(1, Math.ceil((resetTime - now.getTime()) / 1000)), resetAt: new Date(resetTime).toISOString() }
    }
    const reservationId = randomUUID()
    await payload.create({
      collection: 'provider-usage', data: {
        id: reservationId, service: budget.service, keyFingerprint: budget.keyFingerprint,
        reservedAt: now.toISOString(), outcome: 'reserved',
        reservationExpiresAt: new Date(now.getTime() + Math.min(...budget.windows.map(({ seconds }) => seconds)) * 1000).toISOString(),
      }, overrideAccess: true, req,
    })
    return { kind: 'reserved', reservationId, reservedAt: now.toISOString() }
  })
}

export async function markProviderCallStarted(payload: Payload, reservationId: string, now?: Date): Promise<void> {
  const lookup = await payload.find({ collection: 'provider-usage', where: { id: { equals: reservationId } }, limit: 1, overrideAccess: true })
  const original = lookup.docs[0]
  if (!original) throw new StorageError('NOT_FOUND', 'The provider reservation is unavailable.')
  const budgetKey = fingerprint({ service: original.service, keyFingerprint: original.keyFingerprint })
  const result = await withTransaction(payload, async ({ req, lock }) => {
    await lock(`provider-budget:${budgetKey}`)
    const attemptAt = now ?? new Date()
    const { docs } = await payload.find({ collection: 'provider-usage', where: { id: { equals: reservationId } }, limit: 1, overrideAccess: true, req })
    const reservation = docs[0]
    if (!reservation) throw new StorageError('NOT_FOUND', 'The provider reservation is unavailable.')
    if (reservation.outcome !== 'reserved') throw new StorageError('INVALID_TRANSITION', 'A reservation may be used for only one provider attempt.')
    if (!reservation.reservationExpiresAt || Date.parse(reservation.reservationExpiresAt) <= attemptAt.getTime()) return 'expired'
    const blocks = await payload.find({
      collection: 'provider-blocks', where: { id: { equals: budgetKey } }, limit: 1, overrideAccess: true, req,
    })
    if (blocks.docs[0] && Date.parse(blocks.docs[0].blockedUntil) > attemptAt.getTime()) {
      await payload.create({
        collection: 'provider-events',
        data: { id: randomUUID(), service: reservation.service, kind: 'wait', occurredAt: attemptAt.toISOString() },
        overrideAccess: true, req,
      })
      return 'blocked'
    }
    await payload.update({
      collection: 'provider-usage', id: reservationId,
      data: { outcome: 'started', startedAt: attemptAt.toISOString() }, overrideAccess: true, req,
    })
    return 'started'
  })
  if (result === 'expired') throw new StorageError('RESERVATION_EXPIRED', 'The provider reservation expired. Reserve a new attempt before calling the provider.')
  if (result === 'blocked') throw new StorageError('PROVIDER_BLOCKED', 'Provider calls are temporarily blocked. Reserve a new attempt after the block has expired.')
}

export async function finishProviderCall(payload: Payload, input: {
  reservationId: string; outcome: 'success' | 'error'; errorCode?: string; now?: Date
}): Promise<void> {
  await withTransaction(payload, async ({ req, lock }) => {
    await lock(`provider-attempt:${input.reservationId}`)
    const { docs } = await payload.find({ collection: 'provider-usage', where: { id: { equals: input.reservationId } }, limit: 1, overrideAccess: true, req })
    const reservation = docs[0]
    if (!reservation) throw new StorageError('NOT_FOUND', 'The provider reservation is unavailable.')
    if (reservation.outcome === input.outcome) return
    if (reservation.outcome !== 'started') throw new StorageError('INVALID_TRANSITION', 'The provider attempt is not in progress.')
    const errorCode = input.errorCode && /^[A-Z][A-Z0-9_]{0,63}$/.test(input.errorCode) ? input.errorCode : null
    await payload.update({
      collection: 'provider-usage', id: input.reservationId,
      data: { outcome: input.outcome, errorCode, finishedAt: (input.now ?? new Date()).toISOString() },
      overrideAccess: true, req,
    })
  })
}

export async function blockProviderUntil(payload: Payload, input: {
  service: ProviderService; keyFingerprint: string; blockedUntil: Date
}): Promise<void> {
  const service = ProviderServiceSchema.parse(input.service)
  const keyFingerprint = SessionHashSchema.parse(input.keyFingerprint)
  const id = fingerprint({ service, keyFingerprint })
  await withTransaction(payload, async ({ req, lock }) => {
    await lock(`provider-budget:${id}`)
    const { docs } = await payload.find({ collection: 'provider-blocks', where: { id: { equals: id } }, limit: 1, overrideAccess: true, req })
    const current = docs[0]
    const blockedUntil = new Date(Math.max(input.blockedUntil.getTime(), current ? Date.parse(current.blockedUntil) : 0)).toISOString()
    if (!current) await payload.create({ collection: 'provider-blocks', data: { id, service, keyFingerprint, blockedUntil }, overrideAccess: true, req })
    else await payload.update({ collection: 'provider-blocks', id, data: { blockedUntil }, overrideAccess: true, req })
  })
}

export async function recordProviderCacheHit(payload: Payload, service: ProviderService, now = new Date()): Promise<void> {
  await payload.create({
    collection: 'provider-events', data: { id: randomUUID(), service: ProviderServiceSchema.parse(service), kind: 'cache_hit', occurredAt: now.toISOString() },
    overrideAccess: true,
  })
}

export async function getProviderUsageSummary(payload: Payload, input: { service: ProviderService; from: Date; to: Date }) {
  const service = ProviderServiceSchema.parse(input.service)
  return withTransaction(payload, async ({ req }) => {
    const usages = await payload.find({
      collection: 'provider-usage', where: { and: [
        { service: { equals: service } },
        { startedAt: { greater_than_equal: input.from.toISOString() } },
        { startedAt: { less_than: input.to.toISOString() } },
      ] }, pagination: false, limit: 0, depth: 0, overrideAccess: true, req,
    })
    const events = await payload.find({
      collection: 'provider-events', where: { and: [
        { service: { equals: service } },
        { occurredAt: { greater_than_equal: input.from.toISOString() } },
        { occurredAt: { less_than: input.to.toISOString() } },
      ] }, pagination: false, limit: 0, depth: 0, overrideAccess: true, req,
    })
    return {
      calls: usages.docs.length,
      errors: usages.docs.filter(({ outcome }) => outcome === 'error').length,
      waits: events.docs.filter(({ kind }) => kind === 'wait').length,
      cacheHits: events.docs.filter(({ kind }) => kind === 'cache_hit').length,
    }
  }, 'repeatable read')
}
