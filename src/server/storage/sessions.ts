import type { Payload, PayloadRequest } from 'payload'

import { SessionHashSchema } from '@/shared/contracts/storage'

import { requireRegion } from './regions'
import { fingerprint, StorageError } from './value'
import { withTransaction } from './transaction'

export async function ensureSession(payload: Payload, inputHash: string): Promise<void> {
  const ownerSessionHash = SessionHashSchema.parse(inputHash)
  await withTransaction(payload, async ({ req, lock }) => {
    await lock(`session:${ownerSessionHash}`)
    const { totalDocs } = await payload.count({
      collection: 'anonymous-sessions', where: { ownerSessionHash: { equals: ownerSessionHash } },
      overrideAccess: true, req,
    })
    if (totalDocs === 0) await payload.create({
      collection: 'anonymous-sessions', data: { id: ownerSessionHash, ownerSessionHash }, overrideAccess: true, req,
    })
  })
}

export async function requireSession(payload: Payload, ownerSessionHash: string, req?: PayloadRequest): Promise<void> {
  SessionHashSchema.parse(ownerSessionHash)
  const { totalDocs } = await payload.count({
    collection: 'anonymous-sessions', where: { ownerSessionHash: { equals: ownerSessionHash } },
    overrideAccess: true, req,
  })
  if (totalDocs === 0) throw new StorageError('NOT_FOUND', 'The anonymous session is unavailable.')
}

export function contextId(regionId: string, ownerSessionHash: string): string {
  return fingerprint({ regionId, ownerSessionHash })
}

export async function getPersonalVersion(payload: Payload, regionId: string, ownerSessionHash: string, req: PayloadRequest): Promise<number> {
  const { docs } = await payload.find({
    collection: 'session-contexts', where: { id: { equals: contextId(regionId, ownerSessionHash) } },
    limit: 1, depth: 0, overrideAccess: true, req,
  })
  return docs[0]?.personalVersion ?? 0
}

export async function ensureSessionContext(payload: Payload, regionId: string, ownerSessionHash: string): Promise<void> {
  await withTransaction(payload, async ({ req, lock }) => {
    await requireSession(payload, ownerSessionHash, req)
    await requireRegion(payload, regionId, req)
    const id = contextId(regionId, ownerSessionHash)
    await lock(`session-context:${id}`)
    const { totalDocs } = await payload.count({
      collection: 'session-contexts', where: { id: { equals: id } }, overrideAccess: true, req,
    })
    if (totalDocs === 0) await payload.create({
      collection: 'session-contexts', data: { id, regionId, ownerSessionHash, personalVersion: 0 }, overrideAccess: true, req,
    })
  })
}
