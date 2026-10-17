import { randomUUID } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'

import { containsPosition, pointInBbox, validateAvoidGeometry } from '@/features/routing/server/geometry'
import { assertSessionSecret } from '@/server/auth/session-cookie'
import { AppError } from '@/server/http/errors'
import { getPersonalVersion } from '@/server/storage/sessions'
import { fingerprint } from '@/server/storage/value'
import { IdSchema } from '@/shared/contracts/common'
import {
  PrivateReportDTOSchema, PublishedReportSnapshotSchema, ReportFactsSchema,
  type PrivateReportDTO, type PublishedReportSnapshot,
} from '@/shared/contracts/hazards'
import { MaintainerReferenceSchema, ReviewActorSchema, ReviewInputSchema, type ExtraEvidence, type ReviewInput } from '@/shared/contracts/review'
import { PublicSnapshotSchema, type RegionRecord } from '@/shared/contracts/storage'

import { privateReportDTO } from './dto'
import { ReportRecordSchema, type ReportRecord } from './records'
import { incrementPersonalVersion, readConfirmation, readEvidence, type VisionConfiguration } from './repository'
import { lockReviewReport, runReviewCommand } from './review-repository'

const allowed = {
  verify: ['pending', 'ai_assessed', 'verified'],
  correct: ['pending', 'ai_assessed', 'verified', 'resolved', 'rejected'],
  reject: ['pending', 'ai_assessed', 'verified'],
  resolve: ['verified'],
  reopen: ['resolved', 'rejected'],
} satisfies Record<ReviewInput['action'], readonly ReportRecord['status'][]>

export function requireReviewTransition(status: ReportRecord['status'], action: ReviewInput['action']) {
  const permitted: readonly string[] = allowed[action]
  if (!permitted.includes(status)) throw new AppError(409, 'INVALID_TRANSITION', 'This review action is not allowed for the report status.')
}

function invalidEvidence(message: string): never {
  throw new AppError(422, 'EVIDENCE_REQUIRED', message)
}

function publication(raw: unknown) {
  if (raw == null) return null
  const full = PublishedReportSnapshotSchema.safeParse(raw)
  if (full.success) return { kind: 'published', snapshot: full.data } as const
  return { kind: 'routing_only', snapshot: PublicSnapshotSchema.parse(raw) } as const
}

function requiredPublication(value: ReturnType<typeof publication>): PublishedReportSnapshot {
  if (!value || value.kind !== 'published' || !value.snapshot.visible) {
    throw new AppError(409, 'INVALID_TRANSITION', 'Reverify this report with complete publication evidence before changing its public state.')
  }
  return value.snapshot
}

function publicationFacts(facts: ReportRecord['facts']) {
  return {
    location: facts.location, category: facts.category, description: facts.description, observedAt: facts.observedAt,
  }
}

export function verifiedPublicValidity(input: {
  observedAt: string; validUntil?: string; previousValidUntil?: string; publicValiditySec: number; now: number
}) {
  const maximum = Date.parse(input.observedAt) + input.publicValiditySec * 1000
  const expiry = input.validUntil !== undefined ? Date.parse(input.validUntil)
    : input.previousValidUntil !== undefined ? Date.parse(input.previousValidUntil) : maximum
  if (!Number.isSafeInteger(maximum) || maximum > 8.64e15 || !Number.isSafeInteger(expiry) || expiry <= input.now || expiry > maximum) {
    return invalidEvidence('Provide recent independent evidence and a public expiry within its configured validity period.')
  }
  return new Date(expiry).toISOString()
}

export function createReviewService(payload: Payload, options: {
  regionId: string; sessionSecret: string; visionConfig: VisionConfiguration; now?: () => number;
  trustedMaintainerReferences?: readonly string[]
}) {
  const regionId = IdSchema.parse(options.regionId)
  assertSessionSecret(options.sessionSecret)
  const now = options.now ?? Date.now
  const references = z.array(MaintainerReferenceSchema).safeParse(options.trustedMaintainerReferences ?? [])
  if (!references.success) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The trusted evidence source configuration is invalid.')
  const trustedReferences = new Set(references.data)

  async function view(report: ReportRecord, region: RegionRecord, req: PayloadRequest): Promise<PrivateReportDTO> {
    const analysis = await readEvidence(payload, {
      regionId, ownerSessionHash: report.ownerSessionHash, photoId: report.facts.photoId, analysisId: report.facts.analysisId,
    }, req)
    return privateReportDTO({ report, region, analysis, confirmation: await readConfirmation(payload, report, req), now: now() })
  }

  async function validateEvidence(evidence: ExtraEvidence, input: {
    report: ReportRecord; actorId: string; req: PayloadRequest
  }) {
    if (Date.parse(evidence.observedAt) > now()) return invalidEvidence('The independent observation time cannot be in the future.')
    if (evidence.kind === 'trusted_maintainer') {
      if (!trustedReferences.has(evidence.sourceReference)) return invalidEvidence('This maintainer reference has not been approved by the deployment operator.')
      return 'trusted_maintainer' as const
    }
    if (evidence.photoId) {
      if (evidence.photoId === input.report.facts.photoId) return invalidEvidence('The original report photo cannot serve as independent review evidence.')
      const { docs } = await payload.find({
        collection: 'photos', where: { and: [
          { id: { equals: evidence.photoId } }, { regionId: { equals: regionId } },
          { purpose: { equals: 'review_evidence' } }, { ownerAdminId: { equals: input.actorId } }, { uploadState: { equals: 'ready' } },
        ] }, limit: 1, depth: 0, overrideAccess: true, req: input.req,
      })
      if (!docs[0] || docs[0].ownerSessionHash != null) return invalidEvidence('Use a ready review-evidence photo uploaded by the current administrator.')
    }
    return 'admin_field_check' as const
  }

  function publicGeometry(raw: unknown, facts: ReportRecord['facts'], region: RegionRecord) {
    const geometry = validateAvoidGeometry(raw, region.bbox)
    if (!containsPosition(facts.location, geometry)) throw new AppError(400, 'INVALID_GEOMETRY', 'The public avoidance area must contain the report location.')
    return geometry
  }

  return {
    async review(arguments_: {
      actor: { id: string; role: 'operator' | 'report_admin' }; reportId: string; idempotencyKey: string; input: unknown
    }) {
      const actor = ReviewActorSchema.safeParse(arguments_.actor)
      const reportId = IdSchema.safeParse(arguments_.reportId)
      const key = z.string().min(8).max(128).safeParse(arguments_.idempotencyKey)
      if (!actor.success || !reportId.success || !key.success) throw new AppError(400, 'INVALID_INPUT', 'Check the review identity, report and idempotency key.')
      const requiresEvidence = z.object({ action: z.enum(['verify', 'resolve']), extraEvidence: z.unknown().optional() }).safeParse(arguments_.input)
      if (requiresEvidence.success && requiresEvidence.data.extraEvidence == null) return invalidEvidence('Independent review evidence is required for this action.')
      const parsed = ReviewInputSchema.safeParse(arguments_.input)
      if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', 'Check the review fields and provide a reason.')
      const input = parsed.data
      return runReviewCommand(payload, {
        actor: actor.data, regionId, reportId: reportId.data, idempotencyKey: key.data, request: input, now,
      }, async (transaction) => {
        const { req } = transaction
        const { report, region } = await lockReviewReport(payload, transaction, { regionId, reportId: reportId.data })
        if (report.rowVersion !== input.expectedVersion) throw new AppError(409, 'VERSION_CONFLICT', 'This report has changed. Reload it before reviewing.', { currentVersion: report.rowVersion })
        requireReviewTransition(report.status, input.action)
        const before = await view(report, region, req)
        const oldPublication = publication(report.publicSnapshot)
        const oldSnapshot = report.publicSnapshot ?? null
        let nextSnapshot: unknown = oldSnapshot
        let status = report.status
        const facts = ReportFactsSchema.parse({ ...report.facts, ...(input.action === 'correct' ? input.corrections ?? {} : {}) })
        const requiresCurrentLocation = input.action === 'verify'
          || (input.action === 'correct' && (report.status === 'verified' || input.corrections?.location !== undefined))
        if (requiresCurrentLocation && !pointInBbox(facts.location, region.bbox)) {
          throw new AppError(422, 'OUT_OF_COVERAGE', 'Keep a newly corrected or verified location within the supported area.')
        }
        if (Date.parse(facts.observedAt) > now()) throw new AppError(400, 'INVALID_INPUT', 'The corrected observation time cannot be in the future.')
        const factsChanged = fingerprint(facts) !== fingerprint(report.facts)
        const evidence = 'extraEvidence' in input ? input.extraEvidence : undefined
        const evidenceSource = evidence ? await validateEvidence(evidence, { report, actorId: actor.data.id, req }) : null
        const reviewedAt = new Date(now()).toISOString()

        switch (input.action) {
          case 'verify': {
            if (!evidence || !evidenceSource) return invalidEvidence('Independent evidence is required before publication.')
            const geometry = publicGeometry(input.publicAvoidGeometry, facts, region)
            const validUntil = verifiedPublicValidity({ observedAt: evidence.observedAt, validUntil: input.validUntil, publicValiditySec: region.publicValiditySec, now: now() })
            nextSnapshot = PublishedReportSnapshotSchema.parse({
              ...publicationFacts(facts), status: 'verified', publicRevision: (oldPublication?.snapshot.publicRevision ?? 0) + 1,
              publicAvoidGeometry: geometry, validUntil, visible: true,
              publicVerification: { source: evidenceSource, verifiedAt: reviewedAt, validUntil, resolvedAt: null },
            })
            status = 'verified'
            break
          }
          case 'correct': {
            if (report.status !== 'verified' && (input.publicAvoidGeometry !== undefined || input.validUntil !== undefined)) {
              throw new AppError(400, 'INVALID_INPUT', 'Only a verified report can receive public area or expiry corrections.')
            }
            if (report.status === 'verified') {
              const published = requiredPublication(oldPublication)
              const geometryChanged = input.publicAvoidGeometry !== undefined && fingerprint(input.publicAvoidGeometry) !== fingerprint(published.publicAvoidGeometry)
              const expiryChanged = input.validUntil !== undefined && input.validUntil !== published.validUntil
              if (!factsChanged && !geometryChanged && !expiryChanged) throw new AppError(400, 'INVALID_INPUT', 'Correct at least one fact, public area or expiry field.')
              if (!evidence || !evidenceSource) return invalidEvidence('New independent evidence is required for a verified report correction.')
              const geometry = publicGeometry(input.publicAvoidGeometry ?? published.publicAvoidGeometry, facts, region)
              const validUntil = verifiedPublicValidity({
                observedAt: evidence.observedAt, validUntil: input.validUntil, previousValidUntil: published.validUntil,
                publicValiditySec: region.publicValiditySec, now: now(),
              })
              nextSnapshot = PublishedReportSnapshotSchema.parse({
                ...published, ...publicationFacts(facts), publicRevision: published.publicRevision + 1,
                publicAvoidGeometry: geometry, validUntil,
                publicVerification: { source: evidenceSource, verifiedAt: reviewedAt, validUntil, resolvedAt: null },
              })
            } else {
              if (!factsChanged) throw new AppError(400, 'INVALID_INPUT', 'Correct at least one report fact.')
              if (oldPublication?.kind === 'published' && oldPublication.snapshot.visible) {
                nextSnapshot = PublishedReportSnapshotSchema.parse({
                  ...oldPublication.snapshot, ...publicationFacts(facts), publicRevision: oldPublication.snapshot.publicRevision + 1,
                })
              }
            }
            break
          }
          case 'reject': {
            status = 'rejected'
            if (oldPublication?.kind === 'published' && oldPublication.snapshot.visible) {
              nextSnapshot = PublishedReportSnapshotSchema.parse({ ...oldPublication.snapshot, status, publicRevision: oldPublication.snapshot.publicRevision + 1 })
            } else if (oldPublication?.kind === 'routing_only') {
              nextSnapshot = PublicSnapshotSchema.parse({ ...oldPublication.snapshot, status, publicRevision: oldPublication.snapshot.publicRevision + 1 })
            }
            break
          }
          case 'resolve': {
            const published = requiredPublication(oldPublication)
            nextSnapshot = PublishedReportSnapshotSchema.parse({
              ...published, status: 'resolved', publicRevision: published.publicRevision + 1,
              publicVerification: { ...published.publicVerification, resolvedAt: reviewedAt },
            })
            status = 'resolved'
            break
          }
          case 'reopen': {
            status = 'pending'
            if (oldPublication?.kind === 'published') nextSnapshot = PublishedReportSnapshotSchema.parse({
              ...oldPublication.snapshot, visible: false, publicRevision: oldPublication.snapshot.publicRevision + 1,
            })
            else if (oldPublication?.kind === 'routing_only') nextSnapshot = PublicSnapshotSchema.parse({
              ...oldPublication.snapshot, publicRevision: oldPublication.snapshot.publicRevision + 1,
            })
            break
          }
          default: {
            const unreachable: never = input
            throw new Error(`Unexpected review action: ${unreachable}`)
          }
        }

        const nextVersion = report.rowVersion + 1
        const lifecycleChanged = status !== report.status
        const basisChanged = lifecycleChanged || facts.observedAt !== report.facts.observedAt
          || fingerprint(facts.location) !== fingerprint(report.facts.location)
        const confirmation = await readConfirmation(payload, report, req)
        if (confirmation) {
          if (basisChanged && confirmation.active) await payload.update({
            collection: 'personal-avoidances', id: confirmation.id, data: { active: false }, overrideAccess: true, req,
          })
          else if (!basisChanged && confirmation.confirmationReportVersion === report.rowVersion) await payload.update({
            collection: 'personal-avoidances', id: confirmation.id, data: { confirmationReportVersion: nextVersion }, overrideAccess: true, req,
          })
        }
        const updated = ReportRecordSchema.parse(await payload.update({
          collection: 'hazard-reports', id: report.id,
          data: { status, facts, rowVersion: nextVersion, publicSnapshot: z.json().parse(nextSnapshot) }, overrideAccess: true, req,
        }))
        const publicChanged = fingerprint(nextSnapshot) !== fingerprint(oldSnapshot)
        const nextRegion = publicChanged ? { ...region, hazardVersion: region.hazardVersion + 1 } : region
        if (publicChanged) await payload.update({ collection: 'regions', id: region.id, data: { hazardVersion: nextRegion.hazardVersion }, overrideAccess: true, req })
        const personalBefore = await getPersonalVersion(payload, region.id, report.ownerSessionHash, req)
        const personalChanged = factsChanged || lifecycleChanged || before.personalAvoidance?.effective === true
        const personalAfter = personalChanged ? await incrementPersonalVersion(payload, transaction, nextRegion, report.ownerSessionHash) : personalBefore
        const result = PrivateReportDTOSchema.parse(await view(updated, nextRegion, req))
        await payload.create({
          collection: 'report-events', data: {
            id: randomUUID(), reportId: report.id, actorId: actor.data.id, actorRole: actor.data.role,
            action: input.action, reason: input.reason,
            before: { report: before, publicSnapshot: z.json().parse(oldSnapshot) },
            after: {
              report: result, publicSnapshot: z.json().parse(nextSnapshot), extraEvidence: evidence ? z.json().parse(evidence) : null,
              verifiedBy: actor.data, reviewedAt,
              changes: { factsChanged, lifecycleChanged, publicChanged, personalConfirmationInvalidated: basisChanged && !!confirmation?.active },
            },
            contextVersions: {
              hazardVersionBefore: region.hazardVersion, hazardVersion: nextRegion.hazardVersion,
              personalVersionBefore: personalBefore, personalVersion: personalAfter, configVersion: region.configVersion,
              rowVersionBefore: report.rowVersion, rowVersion: nextVersion,
              publicRevisionBefore: before.publicRevision, publicRevision: result.publicRevision,
            },
          }, overrideAccess: true, req,
        })
        if ((input.action === 'verify' || (input.action === 'correct' && status === 'verified'))
          && result.publicVerification && Date.parse(result.publicVerification.validUntil) <= now()) {
          return invalidEvidence('The public verification expired before the review could be committed.')
        }
        return result
      })
    },
  }
}

export type ReviewService = ReturnType<typeof createReviewService>
