import { reviewReport } from '@/server/admin/http'
import { methodNotAllowed } from '@/server/http/c1-request'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }
export const PATCH = async (request: Request, context: Context) => reviewReport(request, (await context.params).id)
export const GET = () => methodNotAllowed('PATCH')
export const POST = GET
export const PUT = GET
export const DELETE = GET
