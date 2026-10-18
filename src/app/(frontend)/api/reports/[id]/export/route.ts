import { reportIdentity } from '@/features/hazards/server/http'
import { renderReportExport } from '@/features/hazards/server/export'
import { c1Services } from '@/server/photos/runtime'
import { handleC1, methodNotAllowed } from '@/server/http/c1-request'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) => handleC1(async () => {
  const reportId = (await context.params).id
  const report = await (await c1Services()).hazards.get({ reportId, ...await reportIdentity(request) })
  return renderReportExport(report)
})
export const POST = () => methodNotAllowed('GET')
export const PUT = POST
export const PATCH = POST
export const DELETE = POST
