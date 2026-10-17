import type { Payload, PayloadRequest } from 'payload'

import {
  PresetPassageSchema, RegionSchema, RegionSeedSchema,
  type RegionRecord, type RegionSeed,
} from '@/shared/contracts/storage'

import { fingerprint, StorageError } from './value'
import { withTransaction } from './transaction'

export async function getRegion(payload: Payload, regionId: string, req?: PayloadRequest): Promise<RegionRecord | null> {
  const { docs } = await payload.find({
    collection: 'regions', where: { id: { equals: regionId } }, limit: 1, depth: 0, overrideAccess: true, req,
  })
  const record = docs[0]
  if (!record) return null
  return RegionSchema.parse({
    id: record.id, name: record.name, bbox: record.bbox, timezone: record.timezone,
    isDemo: record.isDemo, hazardVersion: record.hazardVersion, configVersion: record.configVersion,
    personalValiditySec: record.personalValiditySec, publicValiditySec: record.publicValiditySec,
    avoidanceBufferM: record.avoidanceBufferM, routing: record.routing,
  })
}

export async function requireRegion(payload: Payload, regionId: string, req?: PayloadRequest): Promise<RegionRecord> {
  const region = await getRegion(payload, regionId, req)
  if (!region) throw new StorageError('REGION_NOT_CONFIGURED', 'The service region has not been initialized.')
  return region
}

export async function getPassages(payload: Payload, regionId: string) {
  return withTransaction(payload, async ({ req }) => {
    const region = await requireRegion(payload, regionId, req)
    const { docs } = await payload.find({
      collection: 'preset-passages', where: { regionId: { equals: regionId } },
      limit: 0, pagination: false, sort: 'id', depth: 0, overrideAccess: true, req,
    })
    return {
      configVersion: region.configVersion,
      items: docs.map((record) => PresetPassageSchema.parse({
        id: record.id, passageVersion: record.passageVersion, name: record.name,
        geometry: record.geometry, isDemo: region.isDemo,
      })),
    }
  }, 'repeatable read')
}

export async function seedRegion(payload: Payload, input: RegionSeed): Promise<'created' | 'unchanged'> {
  const seed = RegionSeedSchema.parse(input)
  const seedFingerprint = fingerprint(seed)
  return withTransaction(payload, async ({ req, lock }) => {
    await lock(`region-seed:${seed.region.id}`)
    const { docs } = await payload.find({
      collection: 'regions', where: { id: { equals: seed.region.id } }, limit: 1,
      depth: 0, overrideAccess: true, req,
    })
    if (docs[0]) {
      if (docs[0].seedFingerprint !== seedFingerprint) {
        throw new StorageError('SEED_CONFLICT', 'An initialized region cannot be replaced by a seed. Use the controlled configuration command.')
      }
      return 'unchanged'
    }
    await payload.create({
      collection: 'regions', data: { ...seed.region, seedSource: seed.source, seedFingerprint },
      overrideAccess: true, req,
    })
    for (const passage of seed.presetPassages) {
      await payload.create({
        collection: 'preset-passages', data: {
          id: passage.id, regionId: seed.region.id, passageVersion: passage.passageVersion,
          name: passage.name, geometry: passage.geometry,
        }, overrideAccess: true, req,
      })
    }
    return 'created'
  })
}
