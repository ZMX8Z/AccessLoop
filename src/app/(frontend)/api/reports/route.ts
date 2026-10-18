import { createReport, listReports } from '@/features/hazards/server/http'
import { methodNotAllowed } from '@/server/http/c1-request'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = listReports
export const POST = createReport
export const PUT = () => methodNotAllowed('GET, POST')
export const PATCH = PUT
export const DELETE = PUT
