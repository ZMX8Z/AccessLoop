import { sql } from '@payloadcms/db-postgres'
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { z } from 'zod'

import { evaluateContext } from '@/features/routing/server/context'
import type { RoutingRepository, RoutingSnapshot, ServiceName } from '@/features/routing/server/repository'
import { readSessionCredential, sessionOwnerHash } from '@/server/auth/session-cookie'
import { AppError } from '@/server/http/errors'
import { InstantSchema, LineStringSchema, RoutingContextSchema, UsageSummarySchema, type UsageSummaryDTO } from '@/shared/contracts'
import { SessionHashSchema, type ProviderService } from '@/shared/contracts/storage'

import { getEffectiveAvoidances, readEffectiveAvoidances, type EffectiveAvoidanceSnapshot } from './effective-avoidances'
import { blockProviderUntil, reserveProviderCall } from './provider-budget'
import { getPassages, requireRegion } from './regions'
import { contextId, ensureSessionContext, requireSession } from './sessions'
import { withTransaction } from './transaction'
import { fingerprint, StorageError } from './value'

const ReferenceContextSchema = RoutingContextSchema.pick({ hazardVersion: true, personalVersion: true, configVersion: true, activeDigest: true })
const ProviderKeyFingerprintSchema = z.union([
  SessionHashSchema,
  z.string().regex(/^sha256:[a-f0-9]{64}$/).transform((value) => value.slice(7)),
])
const UsageEventSchema = z.strictObject({
  service: z.enum(['ors', 'vision', 'geocoding', 'poi']), event: z.enum(['call', 'wait', 'error', 'cacheHit']),
  at: InstantSchema, category: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(),
})
const serviceNames: Record<ServiceName, ProviderService> = { ors: 'ors_directions', vision: 'vision', geocoding: 'geocoding', poi: 'poi' }

function asRoutingSnapshot(snapshot: EffectiveAvoidanceSnapshot): RoutingSnapshot {
  return {
    region: snapshot.region, personalVersion: snapshot.personalVersion,
    publicAvoidances: snapshot.publicAvoidances, personalAvoidances: snapshot.personalAvoidances,
  }
}

export function createRoutingRepository(payload: Payload, options: {
  regionId: string; sessionSecret: string; now?: () => number
}): RoutingRepository {
  const now = options.now ?? Date.now
  const regionId = z.string().min(1).parse(options.regionId)
  const configuredRegion = async () => {
    try { return await requireRegion(payload, regionId) } catch (error) {
      if (error instanceof StorageError && error.code === 'REGION_NOT_CONFIGURED') {
        throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The service region is not configured.')
      }
      throw error
    }
  }
  return {
    async resolveSession(request) {
      const credential = readSessionCredential(request.headers.get('cookie'), options.sessionSecret)
      if (!credential) return null
      const hash = sessionOwnerHash(credential)
      try { await requireSession(payload, hash); return hash } catch (error) {
        if (error instanceof StorageError && error.code === 'NOT_FOUND') return null
        throw error
      }
    },
    getRegion: configuredRegion,
    async getPassages() { await configuredRegion(); return (await getPassages(payload, regionId)).items },
    async getPlaces() {
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Verified place data is not configured yet.')
    },
    async readSnapshot(sessionKey) {
      await configuredRegion()
      return asRoutingSnapshot(await getEffectiveAvoidances(payload, { regionId, ownerSessionHash: sessionKey, now: new Date(now()) }))
    },
    async getRouteReference(sessionKey, routeRef) {
      SessionHashSchema.parse(sessionKey)
      const { docs } = await payload.find({
        collection: 'route-snapshots', where: { and: [
          { id: { equals: routeRef } }, { regionId: { equals: regionId } },
          { ownerSessionHash: { equals: sessionKey } }, { expiresAt: { greater_than: new Date(now()).toISOString() } },
        ] }, limit: 1, depth: 0, overrideAccess: true,
      })
      const row = docs[0]
      if (!row || row.context == null) return null
      return {
        id: row.id, regionId: row.regionId, sessionKey: row.ownerSessionHash,
        geometry: LineStringSchema.parse(row.geometry), expiresAt: row.expiresAt,
        context: ReferenceContextSchema.parse(row.context),
      }
    },
    async publishRouteReference(input) {
      if (input.regionId !== regionId) return null
      const expected = ReferenceContextSchema.parse(input.context)
      const geometry = LineStringSchema.parse(input.geometry)
      const requestedExpiry = Date.parse(InstantSchema.parse(input.expiresAt))
      await ensureSessionContext(payload, regionId, input.sessionKey)
      return withTransaction(payload, async (transaction) => {
        const { req, execute } = transaction
        // Every business change to effective data commits its region/session version in the same transaction.
        await execute(sql`SELECT id FROM regions WHERE id = ${regionId} FOR SHARE`)
        await execute(sql`SELECT id FROM session_contexts WHERE id = ${contextId(regionId, input.sessionKey)} FOR SHARE`)
        const snapshot = asRoutingSnapshot(await readEffectiveAvoidances(payload, {
          regionId, ownerSessionHash: input.sessionKey, now: new Date(now()),
        }, req))
        const effective = evaluateContext(snapshot, now()).context
        if (effective.hazardVersion !== expected.hazardVersion || effective.personalVersion !== expected.personalVersion
          || effective.configVersion !== expected.configVersion || effective.activeDigest !== expected.activeDigest) return null
        const expiry = Math.min(requestedExpiry, now() + 900_000, effective.nextExpiryAt ? Date.parse(effective.nextExpiryAt) : Infinity)
        if (expiry <= now()) return null
        const id = randomUUID()
        const expiresAt = new Date(expiry).toISOString()
        await payload.create({
          collection: 'route-snapshots', data: {
            id, regionId, ownerSessionHash: input.sessionKey, geometry, context: expected, expiresAt,
          }, overrideAccess: true, req,
        })
        if (expiry <= now() || evaluateContext(snapshot, now()).context.activeDigest !== expected.activeDigest) {
          await payload.delete({ collection: 'route-snapshots', id, overrideAccess: true, req })
          return null
        }
        return { id, expiresAt }
      })
    },
    async getCache(key) {
      const id = fingerprint(z.string().min(1).max(512).parse(key))
      const { docs } = await payload.find({
        collection: 'service-cache', where: { and: [
          { id: { equals: id } }, { expiresAt: { greater_than: new Date(now()).toISOString() } },
        ] }, limit: 1, depth: 0, overrideAccess: true,
      })
      return docs[0] ? z.json().parse(docs[0].result) : null
    },
    async putCache(key, value, expiresAt) {
      const id = fingerprint(z.string().min(1).max(512).parse(key))
      const result = z.json().parse(value)
      InstantSchema.parse(expiresAt)
      if (Date.parse(expiresAt) <= now()) return
      await withTransaction(payload, async ({ req, lock }) => {
        await lock(`service-cache:${id}`)
        const { totalDocs } = await payload.count({ collection: 'service-cache', where: { id: { equals: id } }, overrideAccess: true, req })
        if (totalDocs === 0) await payload.create({ collection: 'service-cache', data: { id, result, expiresAt }, overrideAccess: true, req })
        else await payload.update({ collection: 'service-cache', id, data: { result, expiresAt }, overrideAccess: true, req })
      })
    },
    async reserveBudget(input) {
      InstantSchema.parse(input.now)
      const reserved = await reserveProviderCall(payload, {
        service: serviceNames[input.service], keyFingerprint: ProviderKeyFingerprintSchema.parse(input.keyFingerprint),
        windows: [{ seconds: 60, limit: input.minuteLimit }, { seconds: 86_400, limit: input.dayLimit }],
        clock: () => new Date(now()), startImmediately: true, recordWait: false,
      })
      return reserved.kind === 'reserved' ? { allowed: true, reservationId: reserved.reservationId }
        : { allowed: false, reason: reserved.reason, retryAfterSec: reserved.retryAfterSec, resetAt: reserved.resetAt }
    },
    async blockBudget(input) {
      await blockProviderUntil(payload, {
        service: serviceNames[input.service], keyFingerprint: ProviderKeyFingerprintSchema.parse(input.keyFingerprint),
        blockedUntil: new Date(InstantSchema.parse(input.until)), reason: input.reason,
      })
    },
    async recordUsage(raw) {
      const event = UsageEventSchema.parse(raw)
      await payload.create({
        collection: 'provider-events', data: {
          id: randomUUID(), service: serviceNames[event.service], kind: event.event === 'cacheHit' ? 'cache_hit' : event.event,
          occurredAt: event.at, category: event.category,
        }, overrideAccess: true,
      })
    },
    async getUsageSummary(windowStart, windowEnd) {
      InstantSchema.parse(windowStart)
      InstantSchema.parse(windowEnd)
      if (Date.parse(windowStart) >= Date.parse(windowEnd)) throw new Error('Invalid usage summary window.')
      const { docs } = await payload.find({
        collection: 'provider-events', where: { and: [
          { service: { in: ['ors_directions', 'vision'] } },
          { occurredAt: { greater_than: windowStart } }, { occurredAt: { less_than_equal: windowEnd } },
        ] }, limit: 0, pagination: false, depth: 0, overrideAccess: true,
      })
      const summary: UsageSummaryDTO = {
        windowStart, windowEnd,
        services: { ors: { calls: 0, waits: 0, errors: 0, cacheHits: 0 }, vision: { calls: 0, waits: 0, errors: 0, cacheHits: 0 } },
      }
      for (const event of docs) {
        const target = event.service === 'ors_directions' ? summary.services.ors : event.service === 'vision' ? summary.services.vision : null
        if (!target) continue
        switch (event.kind) {
          case 'call': target.calls += 1; break
          case 'wait': target.waits += 1; break
          case 'error': target.errors += 1; break
          case 'cache_hit': target.cacheHits += 1; break
        }
      }
      return UsageSummarySchema.parse(summary)
    },
  }
}
