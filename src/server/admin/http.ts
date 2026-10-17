import { resolveAdminSession } from '@/server/auth/admin-session'
import { AppError } from '@/server/http/errors'
import { handleC1, jsonResult, readJSON, requireApplicationOrigin, requireIdempotencyKey } from '@/server/http/c1-request'
import { adminServices } from './runtime'

async function requireAdmin(request: Request, operatorOnly = false) {
  const actor = await resolveAdminSession(request)
  if (!actor) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in as an enabled administrator.')
  if (operatorOnly && actor.role !== 'operator') throw new AppError(403, 'FORBIDDEN', 'A deployment operator is required.')
  return actor
}

function requireNoQuery(request: Request): void {
  if ([...new URL(request.url).searchParams].length) {
    throw new AppError(400, 'INVALID_INPUT', 'This endpoint does not accept query parameters.')
  }
}

export function reviewReport(request: Request, reportId: string): Promise<Response> {
  return handleC1(async () => {
    requireApplicationOrigin(request)
    const actor = await requireAdmin(request)
    const idempotencyKey = requireIdempotencyKey(request)
    const input = await readJSON(request, 1_048_576)
    return jsonResult((await (await adminServices()).reviews.review({ actor, reportId, idempotencyKey, input })).result)
  })
}

export function getAdminRegion(request: Request): Promise<Response> {
  return handleC1(async () => {
    const actor = await requireAdmin(request, true)
    requireNoQuery(request)
    return jsonResult(await (await adminServices()).region.get({ actor }))
  })
}

export function patchAdminRegion(request: Request): Promise<Response> {
  return handleC1(async () => {
    requireApplicationOrigin(request)
    const actor = await requireAdmin(request, true)
    requireNoQuery(request)
    const idempotencyKey = requireIdempotencyKey(request)
    const input = await readJSON(request, 1_048_576)
    return jsonResult((await (await adminServices()).region.patch({ actor, idempotencyKey, input })).result)
  })
}

export function getAdminUsage(request: Request): Promise<Response> {
  return handleC1(async () => {
    await requireAdmin(request)
    requireNoQuery(request)
    return jsonResult(await (await adminServices()).usage())
  })
}
