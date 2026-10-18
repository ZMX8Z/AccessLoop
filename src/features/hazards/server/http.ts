import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { z } from 'zod'

import { resolveAdminSession } from '@/server/auth/admin-session'
import { AnonymousSessionRequired, requireAnonymousSession } from '@/server/auth/anonymous-session'
import { AppError } from '@/server/http/errors'
import { handleC1, jsonResult, parseRequest, readBoundedBody, readJSON, requireApplicationOrigin, requireIdempotencyKey } from '@/server/http/c1-request'
import { MAX_IMAGE_BYTES } from '@/server/photos/image'
import { c1Services } from '@/server/photos/runtime'
import {
  CreateReportInputSchema, UpdateReportInputSchema, PreviewInputSchema, DeactivateAvoidanceInputSchema, ReportListInputSchema,
} from '@/shared/contracts/hazards'
import { IdSchema } from '@/shared/contracts/common'

const AnalyzeInputSchema = z.strictObject({ photoId: IdSchema, consent: z.literal(true) })
const PurposeSchema = z.enum(['report', 'review_evidence'])

export function uploadPhoto(request: Request): Promise<Response> {
  return handleC1(async () => {
    requireApplicationOrigin(request)
    const idempotencyKey = requireIdempotencyKey(request)
    const contentType = request.headers.get('Content-Type') ?? ''
    if (!/^multipart\/form-data\s*;/i.test(contentType)) {
      throw new AppError(400, 'INVALID_INPUT', 'Send multipart form data with a file field.')
    }
    const body = await readBoundedBody(request, MAX_IMAGE_BYTES + 65536)
    let form: FormData
    try {
      form = await new Request(request.url, {
        method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(body),
      }).formData()
    } catch { throw new AppError(400, 'INVALID_INPUT', 'Send valid multipart form data.') }
    if ([...form.keys()].some((key) => !['file', 'purpose'].includes(key))
      || form.getAll('file').length !== 1 || form.getAll('purpose').length > 1) {
      throw new AppError(400, 'INVALID_INPUT', 'Provide one file and an optional purpose.')
    }
    const purpose = parseRequest(PurposeSchema, form.get('purpose') ?? 'report')
    const file = form.get('file')
    if (!(file instanceof File)) throw new AppError(400, 'INVALID_INPUT', 'Provide an image file.')
    if (file.size > MAX_IMAGE_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', 'The image exceeds 5 MiB.')
    const services = await c1Services()
    const bytes = Buffer.from(await file.arrayBuffer())
    if (purpose === 'report') {
      const { ownerSessionHash } = await requireAnonymousSession(request)
      const result = await services.photos.upload({
        subject: { kind: 'anonymous', ownerSessionHash }, purpose, idempotencyKey, bytes, mime: file.type,
      })
      return jsonResult(result.result, 201)
    }
    const admin = await resolveAdminSession(request)
    if (!admin) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in as an administrator to upload review evidence.')
    const result = await services.photos.upload({
      subject: { kind: 'admin', adminId: admin.id }, purpose, idempotencyKey, bytes, mime: file.type,
    })
    return jsonResult(result.result, 201)
  })
}

export function readPhoto(request: Request, photoId: string): Promise<Response> {
  return handleC1(async () => {
    const admin = await resolveAdminSession(request)
    let ownerSessionHash: string | undefined
    try { ownerSessionHash = (await requireAnonymousSession(request)).ownerSessionHash } catch (error) {
      if (!(error instanceof AnonymousSessionRequired)) throw error
    }
    const services = await c1Services()
    const response = await services.photos.read({ photoId, ownerSessionHash, admin: admin !== null, signal: request.signal })
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'private, no-store')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('X-Request-Id', randomUUID())
    return new Response(response.body, { status: response.status, headers })
  })
}

export function analyzePhoto(request: Request): Promise<Response> {
  return handleC1(async () => {
    requireApplicationOrigin(request)
    const idempotencyKey = requireIdempotencyKey(request)
    const { ownerSessionHash } = await requireAnonymousSession(request)
    const input = parseRequest(AnalyzeInputSchema, await readJSON(request))
    const services = await c1Services()
    const submitted = await services.analysisTasks.submit({ ownerSessionHash, idempotencyKey, input })
    const work = submitted.run
    if (work) after(async () => {
      try { await work() } catch { console.error(JSON.stringify({ event: 'analysis_task_storage_failed', jobId: submitted.task.jobId })) }
    })
    return jsonResult(submitted.task, submitted.task.status === 'pending' ? 202 : 200)
  })
}

export function readAnalysisTask(request: Request, rawJobId: string): Promise<Response> {
  return handleC1(async () => {
    const jobId = parseRequest(z.string().regex(/^[a-f0-9]{64}$/), rawJobId)
    const { ownerSessionHash } = await requireAnonymousSession(request)
    return jsonResult(await (await c1Services()).analysisTasks.read({ ownerSessionHash, jobId }))
  })
}

export function createReport(request: Request): Promise<Response> {
  return handleC1(async () => {
    requireApplicationOrigin(request)
    const idempotencyKey = requireIdempotencyKey(request)
    const { ownerSessionHash } = await requireAnonymousSession(request)
    const input = parseRequest(CreateReportInputSchema, await readJSON(request))
    return jsonResult((await (await c1Services()).hazards.create({ ownerSessionHash, idempotencyKey, input })).result, 201)
  })
}

export function updateReport(request: Request, reportId: string): Promise<Response> {
  return handleC1(async () => {
    requireApplicationOrigin(request)
    const idempotencyKey = requireIdempotencyKey(request)
    const { ownerSessionHash } = await requireAnonymousSession(request)
    const input = parseRequest(UpdateReportInputSchema, await readJSON(request))
    return jsonResult((await (await c1Services()).hazards.update({ ownerSessionHash, reportId, idempotencyKey, input })).result)
  })
}

export function previewAvoidance(request: Request, reportId: string): Promise<Response> {
  return handleC1(async () => {
    requireApplicationOrigin(request)
    const { ownerSessionHash } = await requireAnonymousSession(request)
    const input = parseRequest(PreviewInputSchema, await readJSON(request))
    return jsonResult(await (await c1Services()).hazards.preview({ ownerSessionHash, reportId, input }))
  })
}

export function confirmAvoidance(request: Request, reportId: string): Promise<Response> {
  return handleC1(async () => {
    requireApplicationOrigin(request)
    const idempotencyKey = requireIdempotencyKey(request)
    const { ownerSessionHash } = await requireAnonymousSession(request)
    // Service preserves the contract's 422 consent and 409 stale-preview errors.
    const input = await readJSON(request)
    return jsonResult((await (await c1Services()).hazards.confirm({ ownerSessionHash, reportId, idempotencyKey, input })).result)
  })
}

export function deactivateAvoidance(request: Request, reportId: string): Promise<Response> {
  return handleC1(async () => {
    requireApplicationOrigin(request)
    const idempotencyKey = requireIdempotencyKey(request)
    const { ownerSessionHash } = await requireAnonymousSession(request)
    const input = parseRequest(DeactivateAvoidanceInputSchema, await readJSON(request))
    return jsonResult((await (await c1Services()).hazards.deactivate({ ownerSessionHash, reportId, idempotencyKey, input })).result)
  })
}

export async function reportIdentity(request: Request) {
  const admin = await resolveAdminSession(request)
  let ownerSessionHash: string | undefined
  try { ownerSessionHash = (await requireAnonymousSession(request)).ownerSessionHash } catch (error) {
    if (!(error instanceof AnonymousSessionRequired)) throw error
  }
  return { ownerSessionHash, admin: admin !== null }
}

export function getReport(request: Request, reportId: string): Promise<Response> {
  return handleC1(async () => jsonResult(await (await c1Services()).hazards.get({ reportId, ...await reportIdentity(request) })))
}

export function listReports(request: Request): Promise<Response> {
  return handleC1(async () => {
    const params = new URL(request.url).searchParams
    if ([...params.keys()].some((key) => !['scope', 'bbox'].includes(key) || params.getAll(key).length !== 1)) {
      throw new AppError(400, 'INVALID_INPUT', 'Check the report query parameters.')
    }
    const input = parseRequest(ReportListInputSchema, {
      ...(params.has('scope') ? { scope: params.get('scope') } : {}),
      ...(params.has('bbox') ? { bbox: params.get('bbox')?.split(',').map((value) => value.trim() ? Number(value) : NaN) } : {}),
    })
    const identity = input.scope === 'mine' ? await requireAnonymousSession(request) : {}
    return jsonResult(await (await c1Services()).hazards.list({ ...input, ...identity }))
  })
}
