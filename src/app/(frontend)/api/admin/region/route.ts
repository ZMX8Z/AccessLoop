import { getAdminRegion, patchAdminRegion } from '@/server/admin/http'
import { methodNotAllowed } from '@/server/http/c1-request'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = getAdminRegion
export const PATCH = patchAdminRegion
export const POST = () => methodNotAllowed('GET, PATCH')
export const PUT = POST
export const DELETE = POST
