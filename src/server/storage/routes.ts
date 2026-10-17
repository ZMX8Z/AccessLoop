import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { z } from 'zod'

import {
  LineStringSchema, RouteSnapshotSchema, SessionHashSchema,
  type JsonValue, type LineString, type RouteSnapshot,
} from '@/shared/contracts/storage'

import { requireRegion } from './regions'
import { requireSession } from './sessions'
import { fingerprint, StorageError } from './value'
import { withTransaction } from './transaction'

export async function createRouteSnapshot(payload: Payload, input: {
  regionId: string; ownerSessionHash: string; geometry: LineString; now?: Date
}): Promise<RouteSnapshot> {
  const geometry = LineStringSchema.parse(input.geometry)
  return withTransaction(payload, async ({ req }) => {
    await requireSession(payload, input.ownerSessionHash, req)
    await requireRegion(payload, input.regionId, req)
    const now = input.now ?? new Date()
    const snapshot = RouteSnapshotSchema.parse({
      routeRef: randomUUID(), regionId: input.regionId, ownerSessionHash: input.ownerSessionHash,
      geometry, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 900_000).toISOString(),
    })
    await payload.create({
      collection: 'route-snapshots', data: {
        id: snapshot.routeRef, ownerSessionHash: snapshot.ownerSessionHash, regionId: snapshot.regionId,
        geometry: snapshot.geometry, createdAt: snapshot.createdAt, expiresAt: snapshot.expiresAt,
      }, overrideAccess: true, req,
    })
    return snapshot
  })
}

export async function getRouteSnapshot(payload: Payload, input: {
  routeRef: string; regionId: string; ownerSessionHash: string; now?: Date
}): Promise<RouteSnapshot | null> {
  SessionHashSchema.parse(input.ownerSessionHash)
  const now = input.now ?? new Date()
  const { docs } = await payload.find({
    collection: 'route-snapshots', where: { and: [
      { id: { equals: input.routeRef } }, { regionId: { equals: input.regionId } },
      { ownerSessionHash: { equals: input.ownerSessionHash } }, { expiresAt: { greater_than: now.toISOString() } },
    ] }, limit: 1, depth: 0, overrideAccess: true,
  })
  const snapshot = docs[0]
  return snapshot ? RouteSnapshotSchema.parse({
    routeRef: snapshot.id, ownerSessionHash: snapshot.ownerSessionHash, regionId: snapshot.regionId,
    geometry: snapshot.geometry, createdAt: snapshot.createdAt, expiresAt: snapshot.expiresAt,
  }) : null
}

export type CacheScope = { kind: 'public' } | { kind: 'session'; ownerSessionHash: string }
export type RouteCacheKey = {
  regionId: string; scope: CacheScope; requestHash: string; hazardVersion: number;
  personalVersion: number; activeDigest: string
}

function cacheIdentity(input: RouteCacheKey) {
  const scopeKey = input.scope.kind === 'public' ? 'public' : `session:${SessionHashSchema.parse(input.scope.ownerSessionHash)}`
  const key = {
    regionId: input.regionId, scopeKey, requestHash: input.requestHash,
    hazardVersion: input.hazardVersion,
    personalVersion: input.scope.kind === 'public' ? 0 : input.personalVersion,
    activeDigest: input.activeDigest,
  }
  return { id: fingerprint(key), ...key }
}

function assertCacheHasNoCredentials(value: JsonValue, scope: CacheScope['kind']): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { value.forEach((child) => assertCacheHasNoCredentials(child, scope)); return }
  for (const [key, child] of Object.entries(value)) {
    if (['routeRef', 'routeRefExpiresAt', 'ownerSessionHash', 'sessionId', 'cookie', 'token', 'photoId', 'personalAvoidance'].includes(key)
      || (scope === 'public' && ['personalVersion', 'personalValidUntil'].includes(key))
      || (scope === 'public' && key === 'routingScope' && child === 'personal')) {
      throw new StorageError('INVALID_TRANSITION', 'Route caches cannot store session credentials or private report records.')
    }
    assertCacheHasNoCredentials(child, scope)
  }
}

export async function putRouteCache(payload: Payload, input: RouteCacheKey & {
  result: JsonValue; now?: Date; nextExpiryAt: string | null
}): Promise<void> {
  const identity = cacheIdentity(input)
  const result = z.json().parse(input.result)
  assertCacheHasNoCredentials(result, input.scope.kind)
  const now = input.now ?? new Date()
  const expiresAt = new Date(Math.min(now.getTime() + 60_000,
    input.nextExpiryAt === null ? Infinity : z.iso.datetime().transform(Date.parse).parse(input.nextExpiryAt)))
  if (expiresAt <= now) return
  await withTransaction(payload, async ({ req, lock }) => {
    await requireRegion(payload, input.regionId, req)
    if (input.scope.kind === 'session') await requireSession(payload, input.scope.ownerSessionHash, req)
    await lock(`route-cache:${identity.id}`)
    const { totalDocs } = await payload.count({ collection: 'route-cache', where: { id: { equals: identity.id } }, overrideAccess: true, req })
    const data = { ...identity, result, expiresAt: expiresAt.toISOString() }
    if (totalDocs === 0) await payload.create({ collection: 'route-cache', data, overrideAccess: true, req })
    else await payload.update({ collection: 'route-cache', id: identity.id, data, overrideAccess: true, req })
  })
}

export async function getRouteCache(payload: Payload, input: RouteCacheKey & { now?: Date }): Promise<JsonValue | null> {
  const identity = cacheIdentity(input)
  const { docs } = await payload.find({
    collection: 'route-cache', where: { and: [
      { id: { equals: identity.id } }, { expiresAt: { greater_than: (input.now ?? new Date()).toISOString() } },
    ] }, limit: 1, depth: 0, overrideAccess: true,
  })
  return docs[0] ? z.json().parse(docs[0].result) : null
}

export async function pruneExpiredRoutingData(payload: Payload, now = new Date()): Promise<void> {
  await withTransaction(payload, async ({ req }) => {
    for (const collection of ['route-snapshots', 'route-cache'] as const) {
      await payload.delete({ collection, where: { expiresAt: { less_than_equal: now.toISOString() } }, overrideAccess: true, req })
    }
  })
}
