import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'

import { ConfirmationRecordSchema } from '@/features/hazards/server/records'
import type { ActiveGeometryBinding } from '@/features/routing/server/geometry'
import { AppError } from '@/server/http/errors'
import { requireRegion } from '@/server/storage/regions'
import { withTransaction, type Transaction } from '@/server/storage/transaction'
import { fingerprint } from '@/server/storage/value'
import { IdSchema } from '@/shared/contracts/common'
import { AvoidGeometrySchema } from '@/shared/contracts/geo'
import { RegionAdminDTOSchema, type RegionAdminDTO } from '@/shared/contracts/admin-region'
import { PublishedReportSnapshotSchema, ReportFactsSchema } from '@/shared/contracts/hazards'
import { InstantSchema, PresetPassageSchema } from '@/shared/contracts/region'

export const RegionActorSchema = z.strictObject({
  id: IdSchema,
  role: z.enum(['operator', 'report_admin']),
})
export type RegionActor = z.infer<typeof RegionActorSchema>

function forbidden(): never {
  throw new AppError(403, 'FORBIDDEN', 'An enabled operator is required to manage region configuration.')
}

export function configurationConflict(reportIds: string[]): never {
  throw new AppError(409, 'CONFIG_CONFLICT', 'Resolve the affected active reports before changing this configuration.', {
    reportIds: [...new Set(reportIds)].sort(),
  })
}

export async function requireRegionOperator(payload: Payload, transaction: Transaction, actor: RegionActor) {
  if (actor.role !== 'operator') return forbidden()
  const accountId = z.coerce.number().int().positive().safeParse(actor.id)
  if (!accountId.success) return forbidden()
  // The locked account cannot be disabled or demoted before this command commits.
  await transaction.execute(sql`SELECT id FROM admins WHERE id = ${accountId.data} FOR SHARE`)
  const { docs } = await payload.find({
    collection: 'admins', where: { id: { equals: accountId.data } }, limit: 1, depth: 0,
    overrideAccess: true, req: transaction.req,
  })
  const account = docs[0]
  if (!account || account.enabled !== true || account.role !== 'operator') return forbidden()
}

export async function readRegionConfiguration(payload: Payload, regionId: string, req: PayloadRequest): Promise<RegionAdminDTO> {
  const region = await requireRegion(payload, regionId, req)
  const { docs } = await payload.find({
    collection: 'preset-passages', where: { regionId: { equals: regionId } },
    limit: 0, pagination: false, sort: 'id', depth: 0, overrideAccess: true, req,
  })
  return RegionAdminDTOSchema.parse({
    region,
    presetPassages: docs.map((row) => PresetPassageSchema.parse({
      id: row.id, name: row.name, geometry: row.geometry, passageVersion: row.passageVersion, isDemo: region.isDemo,
    })),
  })
}

export async function activeRegionBindings(payload: Payload, regionId: string, now: number, req: PayloadRequest): Promise<ActiveGeometryBinding[]> {
  const { docs: reports } = await payload.find({
    collection: 'hazard-reports', where: { regionId: { equals: regionId } },
    limit: 0, pagination: false, depth: 0, overrideAccess: true, req,
  })
  const bindings: ActiveGeometryBinding[] = []
  for (const report of reports) {
    if (report.publicSnapshot == null) continue
    const state = z.object({ visible: z.boolean().optional(), status: z.enum(['verified', 'resolved', 'rejected']), validUntil: InstantSchema }).safeParse(report.publicSnapshot)
    if (!state.success) return configurationConflict([report.id])
    if (state.data.visible === false || state.data.status !== 'verified' || Date.parse(state.data.validUntil) <= now) continue
    const snapshot = PublishedReportSnapshotSchema.safeParse(report.publicSnapshot)
    if (!snapshot.success) return configurationConflict([report.id])
    if (!snapshot.data.visible || snapshot.data.status !== 'verified' || Date.parse(snapshot.data.validUntil) <= now) continue
    bindings.push({ reportId: report.id, location: snapshot.data.location, geometry: snapshot.data.publicAvoidGeometry })
  }
  const reportsById = new Map(reports.map((report) => [report.id, report]))
  const { docs: confirmations } = await payload.find({
    collection: 'personal-avoidances', where: { and: [
      { regionId: { equals: regionId } }, { active: { equals: true } },
      { validUntil: { greater_than: new Date(now).toISOString() } },
    ] }, limit: 0, pagination: false, depth: 0, overrideAccess: true, req,
  })
  for (const confirmation of confirmations) {
    const report = reportsById.get(confirmation.reportId)
    if (!report || report.ownerSessionHash !== confirmation.ownerSessionHash
      || report.status === 'resolved' || report.status === 'rejected'
      || report.rowVersion !== confirmation.confirmationReportVersion) continue
    const facts = ReportFactsSchema.safeParse(report.facts)
    const record = ConfirmationRecordSchema.safeParse(confirmation)
    if (!facts.success || !record.success) return configurationConflict([report.id])
    const passage = record.data.confirmedPath.passage
    // Geometry is independently validated by D before the patch is allowed.
    const validGeometry = AvoidGeometrySchema.safeParse(record.data.avoidGeometry)
    if (!validGeometry.success) return configurationConflict([report.id])
    bindings.push({
      reportId: report.id, location: facts.data.location, geometry: validGeometry.data,
      ...('presetPassageId' in passage ? { presetPassageId: passage.presetPassageId } : {}),
    })
  }
  return bindings
}

/** Account authorization precedes both a new command and an idempotent replay. */
export async function runRegionCommand(payload: Payload, input: {
  actor: RegionActor; regionId: string; key: string; request: unknown; now: Date
}, command: (transaction: Transaction) => Promise<RegionAdminDTO>) {
  const id = fingerprint({
    subject: `admin:${input.actor.id}`, method: 'PATCH', path: '/api/admin/region',
    purpose: `region:${input.regionId}`, key: input.key,
  })
  const requestFingerprint = fingerprint(input.request)
  return withTransaction(payload, async (transaction) => {
    await requireRegionOperator(payload, transaction, input.actor)
    await transaction.lock(`idempotency:${id}`)
    const { req } = transaction
    const { docs } = await payload.find({
      collection: 'idempotency-records', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req,
    })
    const previous = docs[0]
    if (previous && Date.parse(previous.expiresAt) > input.now.getTime()) {
      if (previous.requestFingerprint !== requestFingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was already used with different input.')
      return { replayed: true, result: RegionAdminDTOSchema.parse(previous.result) }
    }
    if (previous) await payload.delete({ collection: 'idempotency-records', id, overrideAccess: true, req })
    const result = RegionAdminDTOSchema.parse(await command(transaction))
    await payload.create({ collection: 'idempotency-records', data: {
      id, requestFingerprint, result, expiresAt: new Date(input.now.getTime() + 86_400_000).toISOString(),
    }, overrideAccess: true, req })
    return { replayed: false, result }
  })
}
