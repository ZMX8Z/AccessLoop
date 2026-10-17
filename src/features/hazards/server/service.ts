import { randomUUID } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'

import type { PersonalAvoidance } from '@/payload-types'

import { pointInBbox } from '@/features/routing/server/geometry'
import { resolvePassage } from '@/features/routing/server/service'
import { assertSessionSecret } from '@/server/auth/session-cookie'
import { AppError } from '@/server/http/errors'
import { runIdempotentCommand } from '@/server/storage/idempotency'
import { requireRegion } from '@/server/storage/regions'
import { ensureSessionContext } from '@/server/storage/sessions'
import { withTransaction, type Transaction } from '@/server/storage/transaction'
import { fingerprint, StorageError } from '@/server/storage/value'
import { IdSchema } from '@/shared/contracts/common'
import {
  ConfirmAvoidanceInputSchema, CreateReportInputSchema, DeactivateAvoidanceInputSchema,
  PreviewInputSchema, PrivateReportDTOSchema, ReportFactsSchema, ReportListInputSchema,
  UpdateReportInputSchema, type PrivateReportDTO, type PreviewInput,
} from '@/shared/contracts/hazards'
import type { RegionRecord } from '@/shared/contracts/storage'

import { privateReportDTO, publicReportDTO } from './dto'
import { calculatePreview, createPreview, readPreviewToken, stalePreview, verifyPreviewToken } from './preview'
import { ReportRecordSchema, type ReportRecord } from './records'
import {
  incrementPersonalVersion, lockOwnerContext, lockReport, matchesVisionConfiguration, notFound,
  readConfirmation, readEvidence, readReport, requireOwner, transactionRoutingRepository,
  type VisionConfiguration,
} from './repository'

type WriteArguments = { ownerSessionHash: string; idempotencyKey: string; input: unknown }
type ExistingWriteArguments = WriteArguments & { reportId: string }

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', 'Check the report fields and try again.')
  return parsed.data
}

function checkVersion(report: ReportRecord, expectedVersion: number) {
  if (report.rowVersion !== expectedVersion) {
    throw new AppError(409, 'VERSION_CONFLICT', 'This report has changed. Reload it before continuing.', { currentVersion: report.rowVersion })
  }
}

function checkPersonalLifecycle(report: ReportRecord) {
  if (report.status === 'resolved' || report.status === 'rejected') {
    throw new AppError(409, 'INVALID_TRANSITION', 'This report cannot be used for personal avoidance.')
  }
}

function checkLocationAndObservation(facts: ReportRecord['facts'], region: RegionRecord, now: number) {
  if (!pointInBbox(facts.location, region.bbox)) {
    throw new AppError(422, 'OUT_OF_COVERAGE', 'Choose a report location within the supported area.')
  }
  if (Date.parse(facts.observedAt) > now) throw new AppError(400, 'INVALID_INPUT', 'The observation time cannot be in the future.')
}

export function createHazardService(payload: Payload, options: {
  regionId: string; sessionSecret: string; visionConfig: VisionConfiguration; now?: () => number
}) {
  const regionId = IdSchema.parse(options.regionId)
  assertSessionSecret(options.sessionSecret)
  const now = options.now ?? Date.now
  const routingOptions = { regionId, sessionSecret: options.sessionSecret, now }
  const visionConfiguration = z.strictObject({
    model: z.string().min(1), promptVersion: z.string().min(1), schemaVersion: z.string().min(1),
  }).parse(options.visionConfig)

  async function view(report: ReportRecord, region: RegionRecord, req: PayloadRequest): Promise<PrivateReportDTO> {
    const analysis = await readEvidence(payload, {
      regionId, ownerSessionHash: report.ownerSessionHash,
      photoId: report.facts.photoId, analysisId: report.facts.analysisId,
    }, req)
    return privateReportDTO({
      report, analysis, confirmation: await readConfirmation(payload, report, req), region, now: now(),
    })
  }

  async function audit(transaction: Transaction, input: {
    report: ReportRecord; region: RegionRecord; action: string; reason: string
    before: PrivateReportDTO | null; personalVersion: number
  }) {
    const after = await view(input.report, input.region, transaction.req)
    await payload.create({
      collection: 'report-events', data: {
        id: randomUUID(), reportId: input.report.id,
        actorId: input.report.ownerSessionHash, actorRole: 'anonymous', action: input.action, reason: input.reason,
        before: input.before ?? { exists: false }, after, contextVersions: {
          hazardVersion: input.region.hazardVersion, configVersion: input.region.configVersion,
          personalVersionBefore: input.personalVersion - 1, personalVersion: input.personalVersion,
          rowVersionBefore: input.before?.rowVersion ?? null, rowVersion: input.report.rowVersion,
          publicRevision: after.publicRevision,
        },
      }, overrideAccess: true, req: transaction.req,
    })
    return after
  }

  async function write(input: WriteArguments, method: 'POST' | 'PATCH' | 'DELETE', path: string, request: unknown,
    command: (transaction: Transaction, region: RegionRecord) => Promise<PrivateReportDTO>) {
    parse(z.string().min(8).max(128), input.idempotencyKey)
    // C0 creates this row separately at version zero; all business changes below remain atomic.
    await ensureSessionContext(payload, regionId, input.ownerSessionHash)
    try {
      return await runIdempotentCommand(payload, {
        subject: input.ownerSessionHash, method, path, key: input.idempotencyKey,
        purpose: `region:${regionId}`,
        request: z.json().parse(request), resultSchema: PrivateReportDTOSchema, now: new Date(now()),
      }, async (transaction) => {
        const region = await lockOwnerContext(payload, transaction, regionId, input.ownerSessionHash)
        return command(transaction, region)
      })
    } catch (error) {
      if (error instanceof StorageError && error.code === 'IDEMPOTENCY_CONFLICT') {
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with different input.')
      }
      throw error
    }
  }

  const previewInput = (input: PreviewInput) => ({
    expectedVersion: input.expectedVersion, observedAt: input.observedAt, passage: input.passage,
  })

  return {
    async create(arguments_: WriteArguments) {
      const input = parse(CreateReportInputSchema, arguments_.input)
      return write(arguments_, 'POST', '/api/reports', input, async (transaction, region) => {
        const facts = ReportFactsSchema.parse({ ...input, analysisId: input.analysisId ?? null, passage: input.passage ?? null })
        checkLocationAndObservation(facts, region, now())
        const analysis = await readEvidence(payload, {
          regionId, ownerSessionHash: arguments_.ownerSessionHash, photoId: facts.photoId,
          analysisId: facts.analysisId, currentConfiguration: visionConfiguration,
        }, transaction.req)
        if (facts.passage) await resolvePassage(
          transactionRoutingRepository(payload, transaction, routingOptions),
          arguments_.ownerSessionHash, facts.passage, facts.location, now(),
        )
        const report = ReportRecordSchema.parse(await payload.create({
          collection: 'hazard-reports', data: {
            id: randomUUID(), regionId, ownerSessionHash: arguments_.ownerSessionHash,
            rowVersion: 1, status: analysis?.aiStatus === 'completed' ? 'ai_assessed' : 'pending',
            facts, publicSnapshot: null,
          }, overrideAccess: true, req: transaction.req,
        }))
        const personalVersion = await incrementPersonalVersion(payload, transaction, region, arguments_.ownerSessionHash)
        return audit(transaction, { report, region, before: null, personalVersion, action: 'create', reason: 'The author created a private report.' })
      })
    },

    async update(arguments_: ExistingWriteArguments) {
      const input = parse(UpdateReportInputSchema, arguments_.input)
      const reportId = parse(IdSchema, arguments_.reportId)
      return write(arguments_, 'PATCH', `/api/reports/${encodeURIComponent(reportId)}`, input, async (transaction, region) => {
        const report = await lockReport(payload, transaction, { regionId, reportId, ownerSessionHash: arguments_.ownerSessionHash })
        checkVersion(report, input.expectedVersion)
        if (!['pending', 'ai_assessed'].includes(report.status) || report.publicSnapshot != null) {
          throw new AppError(409, 'INVALID_TRANSITION', 'This report must be updated through the review process.')
        }
        if (input.photoId !== undefined && input.photoId !== report.facts.photoId && !('analysisId' in input)) {
          throw new AppError(400, 'INVALID_INPUT', 'Changing the photo requires a matching analysis or an explicit null analysis.')
        }
        const changes = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'expectedVersion'))
        const facts = ReportFactsSchema.parse({ ...report.facts, ...changes })
        if (fingerprint(facts) === fingerprint(report.facts)) throw new AppError(400, 'INVALID_INPUT', 'Change at least one report field.')
        checkLocationAndObservation(facts, region, now())
        const before = await view(report, region, transaction.req)
        const associationChanged = facts.photoId !== report.facts.photoId || facts.analysisId !== report.facts.analysisId
        const analysis = await readEvidence(payload, {
          regionId, ownerSessionHash: arguments_.ownerSessionHash, photoId: facts.photoId, analysisId: facts.analysisId,
          ...(associationChanged ? { currentConfiguration: visionConfiguration } : {}),
        }, transaction.req)
        const geometryInputChanged = fingerprint(facts.location) !== fingerprint(report.facts.location)
          || fingerprint(facts.passage) !== fingerprint(report.facts.passage)
        const basisChanged = associationChanged || geometryInputChanged || facts.observedAt !== report.facts.observedAt
        if (facts.passage && geometryInputChanged) await resolvePassage(
          transactionRoutingRepository(payload, transaction, routingOptions), arguments_.ownerSessionHash, facts.passage, facts.location, now(),
        )
        const confirmation = await readConfirmation(payload, report, transaction.req)
        const nextVersion = report.rowVersion + 1
        if (confirmation) {
          await payload.update({
            collection: 'personal-avoidances', id: confirmation.id,
            data: basisChanged ? { active: false }
              : confirmation.confirmationReportVersion === report.rowVersion ? { confirmationReportVersion: nextVersion } : {},
            overrideAccess: true, req: transaction.req,
          })
        }
        const updated = ReportRecordSchema.parse(await payload.update({
          collection: 'hazard-reports', id: report.id, data: {
            facts, rowVersion: nextVersion,
            ...(associationChanged ? { status: analysis?.aiStatus === 'completed' ? 'ai_assessed' : 'pending' } : {}),
          }, overrideAccess: true, req: transaction.req,
        }))
        const personalVersion = await incrementPersonalVersion(payload, transaction, region, arguments_.ownerSessionHash)
        return audit(transaction, { report: updated, region, before, personalVersion, action: 'update', reason: 'The author corrected private report facts.' })
      })
    },

    async preview(arguments_: { ownerSessionHash: string; reportId: string; input: unknown }) {
      const input = parse(PreviewInputSchema, arguments_.input)
      const reportId = parse(IdSchema, arguments_.reportId)
      return withTransaction(payload, async (transaction) => {
        await requireOwner(payload, arguments_.ownerSessionHash, transaction.req)
        const region = await requireRegion(payload, regionId, transaction.req)
        const report = await readReport(payload, { regionId, reportId, ownerSessionHash: arguments_.ownerSessionHash }, transaction.req)
        checkVersion(report, input.expectedVersion)
        checkPersonalLifecycle(report)
        return createPreview({
          report, region, ownerSessionHash: arguments_.ownerSessionHash, request: input,
          repository: transactionRoutingRepository(payload, transaction, routingOptions),
          visionConfiguration, now, secret: options.sessionSecret,
        })
      }, 'repeatable read')
    },

    async confirm(arguments_: ExistingWriteArguments) {
      const consent = z.object({ consent: z.literal(true) }).safeParse(arguments_.input)
      if (!consent.success) throw new AppError(422, 'CONFIRMATION_REQUIRED', 'Explicitly confirm personal avoidance before enabling it.')
      const token = z.object({ previewDigest: z.string().min(1).max(4096) }).safeParse(arguments_.input)
      if (!token.success) return stalePreview()
      const input = parse(ConfirmAvoidanceInputSchema, arguments_.input)
      const reportId = parse(IdSchema, arguments_.reportId)
      return write(arguments_, 'POST', `/api/reports/${encodeURIComponent(reportId)}/avoidance`, input, async (transaction, region) => {
        const report = await lockReport(payload, transaction, { regionId, reportId, ownerSessionHash: arguments_.ownerSessionHash })
        checkVersion(report, input.expectedVersion)
        checkPersonalLifecycle(report)
        readPreviewToken({ token: input.previewDigest, now: now(), secret: options.sessionSecret })
        const calculated = await calculatePreview({
          report, region, ownerSessionHash: arguments_.ownerSessionHash, request: previewInput(input),
          repository: transactionRoutingRepository(payload, transaction, routingOptions), visionConfiguration, now,
        })
        verifyPreviewToken({ token: input.previewDigest, binding: calculated.binding, now: now(), secret: options.sessionSecret })
        const before = await view(report, region, transaction.req)
        const analysis = before.analysis
        const confirmation = await readConfirmation(payload, report, transaction.req)
        const nextVersion = report.rowVersion + 1
        const data = {
          reportId: report.id, regionId, ownerSessionHash: arguments_.ownerSessionHash,
          active: true,
          confirmedPath: { passage: input.passage, geometry: calculated.geometry },
          avoidGeometry: calculated.avoidGeometry,
          decisionSource: analysis?.aiStatus === 'completed' && matchesVisionConfiguration(analysis, visionConfiguration)
            ? 'ai_user_confirmed' : 'user_manual',
          observedAt: input.observedAt, confirmedAt: new Date(now()).toISOString(),
          validUntil: calculated.validUntil, confirmationReportVersion: nextVersion,
        } satisfies Omit<PersonalAvoidance, 'id' | 'createdAt' | 'updatedAt'>
        if (confirmation) await payload.update({
          collection: 'personal-avoidances', id: confirmation.id, data, overrideAccess: true, req: transaction.req,
        })
        else await payload.create({
          collection: 'personal-avoidances', data: { id: randomUUID(), ...data }, overrideAccess: true, req: transaction.req,
        })
        const updated = ReportRecordSchema.parse(await payload.update({
          collection: 'hazard-reports', id: report.id, data: { rowVersion: nextVersion }, overrideAccess: true, req: transaction.req,
        }))
        const personalVersion = await incrementPersonalVersion(payload, transaction, region, arguments_.ownerSessionHash)
        const after = await audit(transaction, {
          report: updated, region, before, personalVersion, action: confirmation ? 'renew_avoidance' : 'confirm_avoidance',
          reason: 'The author explicitly confirmed the current personal avoidance preview.',
        })
        // Database hooks and lock waits can consume the remaining preview/route lease.
        verifyPreviewToken({ token: input.previewDigest, binding: calculated.binding, now: now(), secret: options.sessionSecret })
        if (Date.parse(calculated.validUntil) <= now()) return stalePreview()
        return after
      })
    },

    async deactivate(arguments_: ExistingWriteArguments) {
      const input = parse(DeactivateAvoidanceInputSchema, arguments_.input)
      const reportId = parse(IdSchema, arguments_.reportId)
      return write(arguments_, 'DELETE', `/api/reports/${encodeURIComponent(reportId)}/avoidance`, input, async (transaction, region) => {
        const report = await lockReport(payload, transaction, { regionId, reportId, ownerSessionHash: arguments_.ownerSessionHash })
        checkVersion(report, input.expectedVersion)
        const before = await view(report, region, transaction.req)
        const confirmation = await readConfirmation(payload, report, transaction.req)
        if (!confirmation?.active) return before
        const nextVersion = report.rowVersion + 1
        await payload.update({
          collection: 'personal-avoidances', id: confirmation.id,
          data: { active: false, confirmationReportVersion: nextVersion }, overrideAccess: true, req: transaction.req,
        })
        const updated = ReportRecordSchema.parse(await payload.update({
          collection: 'hazard-reports', id: report.id, data: { rowVersion: nextVersion }, overrideAccess: true, req: transaction.req,
        }))
        const personalVersion = await incrementPersonalVersion(payload, transaction, region, arguments_.ownerSessionHash)
        return audit(transaction, { report: updated, region, before, personalVersion, action: 'deactivate_avoidance', reason: 'The author disabled personal avoidance.' })
      })
    },

    async get(input: { reportId: string; ownerSessionHash?: string; admin?: boolean }) {
      const reportId = parse(IdSchema, input.reportId)
      return withTransaction(payload, async ({ req }) => {
        if (input.ownerSessionHash) await requireOwner(payload, input.ownerSessionHash, req)
        const region = await requireRegion(payload, regionId, req)
        const report = await readReport(payload, { regionId, reportId }, req)
        if (input.admin === true || report.ownerSessionHash === input.ownerSessionHash) return view(report, region, req)
        return publicReportDTO({ report, region, now: now() }) ?? notFound()
      }, 'repeatable read')
    },

    async list(input: { scope?: 'public' | 'mine'; bbox?: unknown; ownerSessionHash?: string }) {
      const parameters = parse(ReportListInputSchema, { ...(input.scope ? { scope: input.scope } : {}), ...(input.bbox ? { bbox: input.bbox } : {}) })
      return withTransaction(payload, async ({ req }) => {
        const region = await requireRegion(payload, regionId, req)
        if (parameters.scope === 'mine') {
          if (!input.ownerSessionHash) throw new AppError(401, 'UNAUTHENTICATED', 'Initialize your anonymous session before viewing your reports.')
          await requireOwner(payload, input.ownerSessionHash, req)
        }
        const bbox = parameters.bbox ?? region.bbox
        if (!pointInBbox([bbox[0], bbox[1]], region.bbox) || !pointInBbox([bbox[2], bbox[3]], region.bbox)) {
          throw new AppError(422, 'OUT_OF_COVERAGE', 'Choose a bounding box within the supported area.')
        }
        const { docs } = await payload.find({
          collection: 'hazard-reports', where: { and: [
            { regionId: { equals: regionId } },
            ...(parameters.scope === 'mine' ? [{ ownerSessionHash: { equals: input.ownerSessionHash } }] : [{ publicSnapshot: { exists: true } }]),
          ] }, limit: 0, pagination: false, sort: '-createdAt', depth: 0, overrideAccess: true, req,
        })
        const items: (PrivateReportDTO | NonNullable<ReturnType<typeof publicReportDTO>>)[] = []
        for (const row of docs) {
          if (parameters.scope === 'public') {
            const result = publicReportDTO({ report: row, region, now: now() })
            if (result && pointInBbox(result.location, bbox)) items.push(result)
          } else if (row.facts != null) {
            const report = ReportRecordSchema.parse(row)
            if (pointInBbox(report.facts.location, bbox)) items.push(await view(report, region, req))
          }
          if (items.length > 100) break
        }
        return { items: items.slice(0, 100), truncated: items.length > 100 }
      }, 'repeatable read')
    },
  }
}

export type HazardService = ReturnType<typeof createHazardService>
