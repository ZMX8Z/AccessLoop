import {
  PersonalAvoidanceDTOSchema, PrivateReportDTOSchema, PublicReportDTOSchema,
  PublishedReportSnapshotSchema,
  type PrivateReportDTO, type PublicReportDTO,
} from '@/shared/contracts/hazards'
import { PublicSnapshotSchema, type RegionRecord } from '@/shared/contracts/storage'
import type { AnalysisDTO } from '@/shared/contracts/vision'
import type { BBox } from '@/shared/contracts/common'
import { validateAvoidGeometry } from '@/features/routing/server/geometry'

import type { ConfirmationRecord, ReportRecord } from './records'

const historicalBounds: BBox = [-180, -90, 180, 90]

function publication(raw: unknown) {
  if (raw == null) return null
  const complete = PublishedReportSnapshotSchema.safeParse(raw)
  if (complete.success) return { kind: 'published', value: complete.data } as const
  // C0 rows only carried a routing projection. They cannot establish public disclosure.
  return { kind: 'routing_only', value: PublicSnapshotSchema.parse(raw) } as const
}

function activity(status: 'verified' | 'resolved' | 'rejected', validUntil: string, now: number) {
  return status !== 'verified' ? 'inactive' : Date.parse(validUntil) > now ? 'active' : 'expired'
}

export function publicReportDTO(input: {
  report: { id: string; regionId: string; publicSnapshot?: unknown }
  region: RegionRecord
  now: number
}): PublicReportDTO | null {
  const published = publication(input.report.publicSnapshot)
  if (!published || published.kind !== 'published' || !published.value.visible) return null
  const snapshot = published.value
  const publicActivity = activity(snapshot.status, snapshot.validUntil, input.now)
  const geometry = validateAvoidGeometry(snapshot.publicAvoidGeometry, publicActivity === 'active' ? input.region.bbox : historicalBounds)
  return PublicReportDTOSchema.parse({
    id: input.report.id,
    regionId: input.report.regionId,
    publicRevision: snapshot.publicRevision,
    status: snapshot.status,
    location: snapshot.location,
    category: snapshot.category,
    description: snapshot.description,
    observedAt: snapshot.observedAt,
    publicAvoidGeometry: geometry,
    publicVerification: snapshot.publicVerification,
    publicActivity,
    isDemo: input.region.isDemo,
  })
}

export function privateReportDTO(input: {
  report: ReportRecord
  confirmation: ConfirmationRecord | null
  analysis: AnalysisDTO | null
  region: RegionRecord
  now: number
}): PrivateReportDTO {
  const { report, confirmation, region, now } = input
  const published = publication(report.publicSnapshot)
  const snapshot = published?.kind === 'published' && published.value.visible ? published.value : null
  const effective = !!confirmation && confirmation.active && Date.parse(confirmation.validUntil) > now
    && confirmation.confirmationReportVersion === report.rowVersion
    && report.status !== 'resolved' && report.status !== 'rejected'
  const confirmationGeometry = confirmation ? validateAvoidGeometry(confirmation.avoidGeometry, effective ? region.bbox : historicalBounds) : null
  const personal = confirmation && confirmationGeometry ? PersonalAvoidanceDTOSchema.parse({
    active: confirmation.active,
    effective,
    passage: confirmation.confirmedPath.passage,
    avoidGeometry: confirmationGeometry,
    decisionSource: confirmation.decisionSource,
    observedAt: confirmation.observedAt,
    confirmedAt: confirmation.confirmedAt,
    validUntil: confirmation.validUntil,
    confirmationReportVersion: confirmation.confirmationReportVersion,
  }) : null
  return PrivateReportDTOSchema.parse({
    id: report.id,
    regionId: report.regionId,
    rowVersion: report.rowVersion,
    status: report.status,
    publicRevision: published?.value.publicRevision ?? null,
    photoId: report.facts.photoId,
    analysis: input.analysis,
    location: report.facts.location,
    category: report.facts.category,
    description: report.facts.description,
    observedAt: report.facts.observedAt,
    passage: report.facts.passage,
    personalAvoidance: personal,
    publicAvoidGeometry: snapshot ? validateAvoidGeometry(snapshot.publicAvoidGeometry,
      activity(snapshot.status, snapshot.validUntil, now) === 'active' ? region.bbox : historicalBounds) : null,
    publicVerification: snapshot?.publicVerification ?? null,
    publicActivity: snapshot ? activity(snapshot.status, snapshot.validUntil, now) : 'inactive',
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    isDemo: region.isDemo,
  })
}
