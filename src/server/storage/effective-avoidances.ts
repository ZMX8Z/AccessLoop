import type { Payload } from 'payload'

import {
  PersonalAvoidanceSchema, PublicAvoidanceSchema, PublicSnapshotSchema,
  type PersonalAvoidance, type PublicAvoidance, type RegionRecord,
} from '@/shared/contracts/storage'

import { requireRegion } from './regions'
import { getPersonalVersion, requireSession } from './sessions'
import { withTransaction } from './transaction'

export type EffectiveAvoidanceSnapshot = {
  region: RegionRecord
  personalVersion: number
  publicAvoidances: PublicAvoidance[]
  personalAvoidances: PersonalAvoidance[]
  evaluatedAt: string
}

export async function getEffectiveAvoidances(
  payload: Payload,
  input: { regionId: string; ownerSessionHash: string; now?: Date },
): Promise<EffectiveAvoidanceSnapshot> {
  return withTransaction(payload, async ({ req }) => {
    await requireSession(payload, input.ownerSessionHash, req)
    const region = await requireRegion(payload, input.regionId, req)
    const evaluatedAt = (input.now ?? new Date()).toISOString()
    const personalVersion = await getPersonalVersion(payload, input.regionId, input.ownerSessionHash, req)
    const publicReports = await payload.find({
      collection: 'hazard-reports',
      where: { and: [{ regionId: { equals: input.regionId } }, { publicSnapshot: { exists: true } }] },
      limit: 0, pagination: false, depth: 0, overrideAccess: true, req,
    })
    const publicAvoidances: PublicAvoidance[] = []
    for (const report of publicReports.docs) {
      const snapshot = PublicSnapshotSchema.parse(report.publicSnapshot)
      if (snapshot.status === 'verified' && Date.parse(snapshot.validUntil) > Date.parse(evaluatedAt)) {
        publicAvoidances.push(PublicAvoidanceSchema.parse({
          id: report.id, publicRevision: snapshot.publicRevision,
          publicAvoidGeometry: snapshot.publicAvoidGeometry, validUntil: snapshot.validUntil,
        }))
      }
    }
    const confirmations = await payload.find({
      collection: 'personal-avoidances',
      where: { and: [
        { regionId: { equals: input.regionId } }, { ownerSessionHash: { equals: input.ownerSessionHash } },
        { active: { equals: true } }, { validUntil: { greater_than: evaluatedAt } },
      ] },
      limit: 0, pagination: false, depth: 0, overrideAccess: true, req,
    })
    const personalAvoidances: PersonalAvoidance[] = []
    for (const confirmation of confirmations.docs) {
      const reports = await payload.find({
        collection: 'hazard-reports',
        where: { and: [
          { id: { equals: confirmation.reportId } }, { regionId: { equals: input.regionId } },
          { ownerSessionHash: { equals: input.ownerSessionHash } },
        ] },
        limit: 1, depth: 0, overrideAccess: true, req,
      })
      const report = reports.docs[0]
      if (!report || report.status === 'resolved' || report.status === 'rejected'
        || report.rowVersion !== confirmation.confirmationReportVersion) continue
      personalAvoidances.push(PersonalAvoidanceSchema.parse({
        id: report.id, rowVersion: report.rowVersion,
        confirmationReportVersion: confirmation.confirmationReportVersion,
        avoidGeometry: confirmation.avoidGeometry, validUntil: confirmation.validUntil,
      }))
    }
    publicAvoidances.sort((left, right) => left.id.localeCompare(right.id))
    personalAvoidances.sort((left, right) => left.id.localeCompare(right.id))
    return { region, personalVersion, publicAvoidances, personalAvoidances, evaluatedAt }
  }, 'repeatable read')
}
