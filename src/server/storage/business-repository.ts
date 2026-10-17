import type { Payload } from 'payload'
import type { z } from 'zod'

import type { JsonValue, ProviderService, RegionSeed } from '@/shared/contracts/storage'

import { getEffectiveAvoidances } from './effective-avoidances'
import { runIdempotentCommand } from './idempotency'
import { blockProviderUntil, finishProviderCall, getProviderUsageSummary, markProviderCallStarted, recordProviderCacheHit, reserveProviderCall } from './provider-budget'
import { getPassages, getRegion, requireRegion, seedRegion } from './regions'
import { createRouteSnapshot, getRouteCache, getRouteSnapshot, pruneExpiredRoutingData, putRouteCache } from './routes'
import { ensureSession, ensureSessionContext, requireSession } from './sessions'
import { withTransaction, type Transaction } from './transaction'

export function createBusinessRepository(payload: Payload) {
  return {
    ensureSession: (ownerSessionHash: string) => ensureSession(payload, ownerSessionHash),
    ensureSessionContext: (regionId: string, ownerSessionHash: string) => ensureSessionContext(payload, regionId, ownerSessionHash),
    requireSession: (ownerSessionHash: string) => requireSession(payload, ownerSessionHash),
    getRegion: (regionId: string) => getRegion(payload, regionId),
    requireRegion: (regionId: string) => requireRegion(payload, regionId),
    getPassages: (regionId: string) => getPassages(payload, regionId),
    seedRegion: (input: RegionSeed) => seedRegion(payload, input),
    getEffectiveAvoidances: (input: Parameters<typeof getEffectiveAvoidances>[1]) => getEffectiveAvoidances(payload, input),
    createRouteSnapshot: (input: Parameters<typeof createRouteSnapshot>[1]) => createRouteSnapshot(payload, input),
    getRouteSnapshot: (input: Parameters<typeof getRouteSnapshot>[1]) => getRouteSnapshot(payload, input),
    getRouteCache: (input: Parameters<typeof getRouteCache>[1]) => getRouteCache(payload, input),
    putRouteCache: (input: Parameters<typeof putRouteCache>[1]) => putRouteCache(payload, input),
    pruneExpiredRoutingData: (now?: Date) => pruneExpiredRoutingData(payload, now),
    reserveProviderCall: (input: Parameters<typeof reserveProviderCall>[1]) => reserveProviderCall(payload, input),
    markProviderCallStarted: (reservationId: string, now?: Date) => markProviderCallStarted(payload, reservationId, now),
    finishProviderCall: (input: Parameters<typeof finishProviderCall>[1]) => finishProviderCall(payload, input),
    blockProviderUntil: (input: Parameters<typeof blockProviderUntil>[1]) => blockProviderUntil(payload, input),
    recordProviderCacheHit: (service: ProviderService, now?: Date) => recordProviderCacheHit(payload, service, now),
    getProviderUsageSummary: (input: Parameters<typeof getProviderUsageSummary>[1]) => getProviderUsageSummary(payload, input),
    withTransaction: <T>(command: (transaction: Transaction) => Promise<T>) => withTransaction(payload, command),
    runIdempotentCommand: <T extends JsonValue>(input: {
      subject: string; method: 'POST' | 'PATCH' | 'DELETE'; path: string; key: string; purpose?: string
      request: JsonValue; resultSchema: z.ZodType<T>; now?: Date
    }, command: (transaction: Transaction) => Promise<T>) => runIdempotentCommand(payload, input, command),
  }
}

export type BusinessRepository = ReturnType<typeof createBusinessRepository>
export { StorageError } from './value'
