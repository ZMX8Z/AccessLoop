import { randomUUID } from 'node:crypto'

import { hasMatchingOrigin } from '@/server/http/origin'
import type { BusinessRepository } from '@/server/storage/business-repository'
import { SessionDataSchema, SessionInputSchema } from '@/shared/contracts/session'

import { issueSessionCredential, readSessionCredential, sessionCookieHeader, sessionOwnerHash } from './session-cookie'

type Dependencies = {
  applicationOrigin: string
  regionId: string
  secret: string
  secure: boolean
  repository: () => Promise<Pick<BusinessRepository, 'requireRegion' | 'ensureSession' | 'ensureSessionContext'>>
}

class InvalidSessionBody extends Error {}

async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new InvalidSessionBody()
  const reader = request.body?.getReader()
  if (!reader) throw new InvalidSessionBody()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024) { await reader.cancel(); throw new InvalidSessionBody() }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch { throw new InvalidSessionBody() }
  finally { reader.releaseLock() }
}

export async function initializeAnonymousSession(request: Request, options: Dependencies): Promise<Response> {
  const requestId = randomUUID()
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId })
  const failure = (status: number, code: string, message: string) =>
    Response.json({ error: { code, message }, requestId }, { status, headers })

  if (!options.applicationOrigin || !hasMatchingOrigin(request, options.applicationOrigin)) {
    return failure(403, 'FORBIDDEN', 'Requests must originate from this application.')
  }
  try {
    const parsed = SessionInputSchema.safeParse(await readBody(request))
    if (!parsed.success) return failure(400, 'INVALID_INPUT', 'Send an empty JSON object to initialize a session.')
  } catch {
    return failure(400, 'INVALID_INPUT', 'Send an empty JSON object to initialize a session.')
  }
  try {
    if (!options.regionId) return failure(503, 'PROVIDER_UNAVAILABLE', 'The application region is not configured yet.')
    const existing = readSessionCredential(request.headers.get('cookie'), options.secret)
    const credential = existing ?? issueSessionCredential(options.secret)
    const repository = await options.repository()
    const region = await repository.requireRegion(options.regionId)
    const ownerSessionHash = sessionOwnerHash(credential)
    await repository.ensureSession(ownerSessionHash)
    await repository.ensureSessionContext(region.id, ownerSessionHash)
    const data = SessionDataSchema.parse({ ready: true, regionId: region.id, isDemo: region.isDemo })
    if (!existing) headers.set('Set-Cookie', sessionCookieHeader(credential, options.secure))
    return Response.json({ data, requestId }, { headers })
  } catch {
    return failure(503, 'PROVIDER_UNAVAILABLE', 'Session initialization is unavailable. Please try again later.')
  }
}
