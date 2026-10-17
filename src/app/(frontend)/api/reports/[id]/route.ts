import { getReport, updateReport } from '@/features/hazards/server/http'
import { methodNotAllowed } from '@/server/http/c1-request'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ id: string }> }
export const GET = async (request: Request, context: Context) => getReport(request, (await context.params).id)
export const PATCH = async (request: Request, context: Context) => updateReport(request, (await context.params).id)
export const POST = () => methodNotAllowed('GET, PATCH')
export const PUT = POST
export const DELETE = POST
