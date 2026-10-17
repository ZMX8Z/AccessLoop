import { headers } from 'next/headers'
import Link from 'next/link'
import type { Payload, ServerProps } from 'payload'

import { isEnabledAdmin } from '@/collections/Admins'
import { AppError } from '@/server/http/errors'
import { adminServices } from '@/server/admin/runtime'
import { c1Services } from '@/server/photos/runtime'
import { getPassages, requireRegion } from '@/server/storage/regions'
import { bufferPassage, validateAvoidGeometry, validateReportPassage } from '@/features/routing/server/geometry'
import type { PrivateReportDTO } from '@/shared/contracts/hazards'
import type { RegionDTO } from '@/shared/contracts/region'
import type { AvoidGeometry } from '@/shared/contracts/geo'
import { AdminHazardReview, AdminRegionConfig, AdminUsageSummary } from './index'

async function authenticatedAdmin(payload: Payload) {
  // Payload component user props are a display projection, not the authorization principal.
  const { user } = await payload.auth({ headers: new Headers(await headers()) })
  return isEnabledAdmin(user) ? { id: String(user.id), role: user.role } : null
}

async function passageProposal(payload: Payload, report: PrivateReportDTO, region: RegionDTO): Promise<AvoidGeometry | null> {
  try {
    if (report.personalAvoidance) return validateAvoidGeometry(report.personalAvoidance.avoidGeometry, region.bbox)
    if (!report.passage || !('presetPassageId' in report.passage)) return null
    const { items } = await getPassages(payload, region.id)
    const reference = report.passage
    const passage = items.find((item) => item.id === reference.presetPassageId && item.passageVersion === reference.passageVersion)
    if (!passage) return null
    validateReportPassage(report.location, passage.geometry, region.bbox)
    return bufferPassage(passage.geometry, region.avoidanceBufferM, region.bbox)
  } catch (error) {
    if (error instanceof AppError) return null
    throw error
  }
}

async function readReviewData(payload: Payload, regionId: string, id: string) {
  try {
    const region = await requireRegion(payload, regionId)
    const report = await (await c1Services()).hazards.get({ reportId: id, admin: true })
    if (!('rowVersion' in report)) return null
    const suggestedGeometry = await passageProposal(payload, report, region)
    return { report, region, suggestedGeometry }
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return null
    throw error
  }
}

export async function ReportReviewPanel({ payload, id }: Pick<ServerProps, 'payload' | 'id'>) {
  if (id === undefined || !await authenticatedAdmin(payload)) return null
  const regionId = process.env.REGION_ID?.trim()
  if (!regionId) return <p>The report region has not been configured.</p>
  const data = await readReviewData(payload, regionId, String(id))
  if (!data) return <p>This legacy record has no complete report facts. Its read-only data remains below.</p>
  return <AdminHazardReview key={`${data.report.id}:${data.report.rowVersion}`} {...data} />
}

export async function AccessLoopDashboard({ payload }: Pick<ServerProps, 'payload'>) {
  const actor = await authenticatedAdmin(payload)
  if (!actor) return null
  const services = await adminServices()
  const displayRegion = await requireRegion(payload, services.regionId)
  const usage = await services.usage()
  const region = actor.role === 'operator' ? await services.region.get({ actor }) : null
  return <div className="accessloop-admin">
    <h2>AccessLoop administration</h2>
    {displayRegion.isDemo && <p role="note">Demonstration region: {displayRegion.name}. Records and review actions here are demonstration data.</p>}
    <p>Review reports from the read-only collection list below. Public verification requires separate evidence and an explicit review action.</p>
    <p><Link href="/admin/collections/hazard-reports">Open reports</Link> · <Link href="/admin/collections/report-events">Open audit history</Link></p>
    <AdminUsageSummary initialData={usage} />
    {region && <AdminRegionConfig key={region.region.configVersion} initialData={region} />}
  </div>
}
