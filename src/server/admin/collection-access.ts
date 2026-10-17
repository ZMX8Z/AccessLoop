import type { Access, Where } from 'payload'

import { isEnabledAdmin, isOperator } from '@/collections/Admins'

export const readAdminRegionData: Access = ({ req }) => {
  const regionId = process.env.REGION_ID?.trim()
  return isEnabledAdmin(req.user) && regionId ? { regionId: { equals: regionId } } : false
}

export const readAdminAudit: Access = async ({ req }) => {
  const regionId = process.env.REGION_ID?.trim()
  if (!isEnabledAdmin(req.user) || !regionId) return false
  const { docs } = await req.payload.find({
    collection: 'hazard-reports', where: { regionId: { equals: regionId } },
    pagination: false, limit: 0, depth: 0, overrideAccess: true, req,
    select: { id: true },
  })
  const reportIds = docs.map((report) => report.id)
  if (isOperator(req.user)) reportIds.push(`region:${regionId}`)
  if (reportIds.length === 0) return false
  return { reportId: { in: reportIds } } satisfies Where
}
