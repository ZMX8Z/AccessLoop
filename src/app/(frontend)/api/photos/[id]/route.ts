import { readPhoto } from '@/features/hazards/server/http'
import { methodNotAllowed } from '@/server/http/c1-request'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) => readPhoto(request, (await context.params).id)
export const POST = () => methodNotAllowed('GET')
export const PUT = POST
export const PATCH = POST
export const DELETE = POST
