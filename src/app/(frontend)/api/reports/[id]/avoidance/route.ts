import { confirmAvoidance, deactivateAvoidance } from '@/features/hazards/server/http'
import { methodNotAllowed } from '@/server/http/c1-request'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ id: string }> }
export const POST = async (request: Request, context: Context) => confirmAvoidance(request, (await context.params).id)
export const DELETE = async (request: Request, context: Context) => deactivateAvoidance(request, (await context.params).id)
export const GET = () => methodNotAllowed('POST, DELETE')
export const PUT = GET
export const PATCH = GET
