import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'

import type { RoutingRepository } from '@/features/routing/server/repository'
import { AppError } from '@/server/http/errors'
import { readEffectiveAvoidances } from '@/server/storage/effective-avoidances'
import { requireRegion } from '@/server/storage/regions'
import { createRoutingRepository } from '@/server/storage/routing-repository'
import { contextId, requireSession } from '@/server/storage/sessions'
import type { Transaction } from '@/server/storage/transaction'
import { StorageError } from '@/server/storage/value'
import { IdSchema } from '@/shared/contracts/common'
import { LineStringSchema } from '@/shared/contracts/geo'
import { InstantSchema, PresetPassageSchema, RoutingContextSchema } from '@/shared/contracts/region'
import { SessionHashSchema, type RegionRecord } from '@/shared/contracts/storage'
import { AnalysisDTOSchema, type AnalysisDTO } from '@/shared/contracts/vision'

import { ConfirmationRecordSchema, ReportRecordSchema, type ReportRecord } from './records'

export type VisionConfiguration = { model: string; promptVersion: string; schemaVersion: string }
const PhotoRecordSchema = z.object({
  id: IdSchema, regionId: IdSchema, purpose: z.literal('report'),
  ownerSessionHash: SessionHashSchema, imageHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  uploadState: z.literal('ready'),
})
const AnalysisRecordSchema = z.object({
  id: IdSchema, regionId: IdSchema, ownerSessionHash: SessionHashSchema,
  photoId: IdSchema, imageHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  cacheKey: z.string().min(1), analysis: AnalysisDTOSchema,
})
const ReferenceContextSchema = RoutingContextSchema.pick({ hazardVersion: true, personalVersion: true, configVersion: true, activeDigest: true })

export function notFound(): never {
  throw new AppError(404, 'NOT_FOUND', 'The report or evidence is not available.')
}

export async function requireOwner(payload: Payload, ownerSessionHash: string, req: PayloadRequest) {
  if (!SessionHashSchema.safeParse(ownerSessionHash).success) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Initialize your anonymous session before continuing.')
  }
  try { await requireSession(payload, ownerSessionHash, req) }
  catch (error) {
    if (error instanceof StorageError && error.code === 'NOT_FOUND') {
      throw new AppError(401, 'UNAUTHENTICATED', 'Initialize your anonymous session before continuing.')
    }
    throw error
  }
}

export async function lockOwnerContext(payload: Payload, transaction: Transaction, regionId: string, owner: string) {
  await requireOwner(payload, owner, transaction.req)
  await transaction.execute(sql`SELECT id FROM regions WHERE id = ${regionId} FOR SHARE`)
  await transaction.execute(sql`SELECT id FROM session_contexts WHERE id = ${contextId(regionId, owner)} FOR UPDATE`)
  return requireRegion(payload, regionId, transaction.req)
}

export async function readReport(payload: Payload, input: {
  regionId: string; reportId: string; ownerSessionHash?: string
}, req: PayloadRequest): Promise<ReportRecord> {
  const { docs } = await payload.find({
    collection: 'hazard-reports', where: { and: [
      { id: { equals: input.reportId } }, { regionId: { equals: input.regionId } },
      ...(input.ownerSessionHash ? [{ ownerSessionHash: { equals: input.ownerSessionHash } }] : []),
    ] }, limit: 1, depth: 0, overrideAccess: true, req,
  })
  if (!docs[0] || docs[0].facts == null) return notFound()
  return ReportRecordSchema.parse(docs[0])
}

export async function lockReport(payload: Payload, transaction: Transaction, input: {
  regionId: string; reportId: string; ownerSessionHash: string
}) {
  await transaction.execute(sql`SELECT id FROM hazard_reports WHERE id = ${input.reportId}
    AND region_id = ${input.regionId} AND owner_session_hash = ${input.ownerSessionHash} FOR UPDATE`)
  return readReport(payload, input, transaction.req)
}

export async function readConfirmation(payload: Payload, report: ReportRecord, req: PayloadRequest) {
  const { docs } = await payload.find({
    collection: 'personal-avoidances', where: { and: [
      { reportId: { equals: report.id } }, { regionId: { equals: report.regionId } },
      { ownerSessionHash: { equals: report.ownerSessionHash } },
    ] }, limit: 1, depth: 0, overrideAccess: true, req,
  })
  return docs[0] ? ConfirmationRecordSchema.parse(docs[0]) : null
}

export async function readEvidence(payload: Payload, input: {
  regionId: string; ownerSessionHash: string; photoId: string; analysisId: string | null
  currentConfiguration?: VisionConfiguration
}, req: PayloadRequest): Promise<AnalysisDTO | null> {
  const { docs: photos } = await payload.find({
    collection: 'photos', where: { and: [
      { id: { equals: input.photoId } }, { regionId: { equals: input.regionId } },
      { ownerSessionHash: { equals: input.ownerSessionHash } }, { purpose: { equals: 'report' } },
      { uploadState: { equals: 'ready' } },
    ] }, limit: 1, depth: 0, overrideAccess: true, req,
  })
  if (!photos[0]) return notFound()
  const photo = PhotoRecordSchema.parse(photos[0])
  if (input.analysisId === null) return null
  const { docs: analyses } = await payload.find({
    collection: 'ai-analyses', where: { and: [
      { id: { equals: input.analysisId } }, { regionId: { equals: input.regionId } },
      { ownerSessionHash: { equals: input.ownerSessionHash } }, { photoId: { equals: photo.id } },
    ] }, limit: 1, depth: 0, overrideAccess: true, req,
  })
  if (!analyses[0]) return notFound()
  const record = AnalysisRecordSchema.parse(analyses[0])
  const analysis = record.analysis
  if (record.imageHash !== photo.imageHash || analysis.photoId !== photo.id || analysis.analysisId !== record.id
    || (input.currentConfiguration && !matchesVisionConfiguration(analysis, input.currentConfiguration))) {
    throw new AppError(409, 'ANALYSIS_STALE', 'Analyze the current photo again or continue with manual details.')
  }
  return analysis
}

export function matchesVisionConfiguration(analysis: AnalysisDTO, configuration: VisionConfiguration) {
  return analysis.model === configuration.model && analysis.promptVersion === configuration.promptVersion
    && analysis.schemaVersion === configuration.schemaVersion
}

/** Only the four overridden read methods are used during passage resolution. All share req.transactionID. */
export function transactionRoutingRepository(payload: Payload, transaction: Transaction, options: {
  regionId: string; sessionSecret: string; now: () => number
}): RoutingRepository {
  const { req } = transaction
  return {
    ...createRoutingRepository(payload, options),
    getRegion: () => requireRegion(payload, options.regionId, req),
    async getPassages() {
      const region = await requireRegion(payload, options.regionId, req)
      const { docs } = await payload.find({
        collection: 'preset-passages', where: { regionId: { equals: options.regionId } },
        limit: 0, pagination: false, sort: 'id', depth: 0, overrideAccess: true, req,
      })
      return docs.map((row) => PresetPassageSchema.parse({
        id: row.id, passageVersion: row.passageVersion, name: row.name, geometry: row.geometry, isDemo: region.isDemo,
      }))
    },
    async getRouteReference(owner, routeRef) {
      const { docs } = await payload.find({
        collection: 'route-snapshots', where: { and: [
          { id: { equals: routeRef } }, { regionId: { equals: options.regionId } },
          { ownerSessionHash: { equals: owner } }, { expiresAt: { greater_than: new Date(options.now()).toISOString() } },
        ] }, limit: 1, depth: 0, overrideAccess: true, req,
      })
      const row = docs[0]
      if (!row || row.context == null) return null
      return {
        id: row.id, regionId: row.regionId, sessionKey: row.ownerSessionHash,
        geometry: LineStringSchema.parse(row.geometry), expiresAt: InstantSchema.parse(row.expiresAt),
        context: ReferenceContextSchema.parse(row.context),
      }
    },
    async readSnapshot(owner) {
      const snapshot = await readEffectiveAvoidances(payload, {
        regionId: options.regionId, ownerSessionHash: owner, now: new Date(options.now()),
      }, req)
      return {
        region: snapshot.region, personalVersion: snapshot.personalVersion,
        publicAvoidances: snapshot.publicAvoidances, personalAvoidances: snapshot.personalAvoidances,
      }
    },
  }
}

export async function incrementPersonalVersion(payload: Payload, transaction: Transaction, region: RegionRecord, owner: string) {
  const context = await payload.findByID({
    collection: 'session-contexts', id: contextId(region.id, owner), depth: 0, overrideAccess: true, req: transaction.req,
  })
  const personalVersion = context.personalVersion + 1
  await payload.update({
    collection: 'session-contexts', id: context.id, data: { personalVersion }, overrideAccess: true, req: transaction.req,
  })
  return personalVersion
}
