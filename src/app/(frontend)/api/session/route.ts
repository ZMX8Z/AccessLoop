import { appOrigin } from '@/payload.config'
import { initializeAnonymousSession } from '@/server/auth/session-http'
import { getBusinessRepository } from '@/server/storage/runtime'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return initializeAnonymousSession(request, {
    applicationOrigin: appOrigin ?? '',
    regionId: process.env.REGION_ID?.trim() ?? '',
    secret: process.env.SESSION_SECRET ?? '',
    secure: process.env.NODE_ENV === 'production',
    repository: getBusinessRepository,
  })
}
import { randomUUID } from 'node:crypto'


function methodNotAllowed(): Response {
  const requestId = randomUUID()
  return Response.json({
    error: { code: 'INVALID_INPUT', message: 'Use POST with an empty JSON object to initialize a session.' }, requestId,
  }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId } })
}

export const GET = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
