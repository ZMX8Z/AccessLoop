import { uploadPhoto } from '@/features/hazards/server/http'
import { methodNotAllowed } from '@/server/http/c1-request'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const POST = uploadPhoto
export const GET = () => methodNotAllowed('POST')
export const PUT = GET
export const PATCH = GET
export const DELETE = GET
