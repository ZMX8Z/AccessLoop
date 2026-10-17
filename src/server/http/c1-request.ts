import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { AnonymousSessionRequired } from '@/server/auth/errors'
import { hasMatchingOrigin } from './origin'
import { AppError, errorResponse } from './errors'
import { StorageError } from '@/server/storage/value'

export function requireApplicationOrigin(request: Request): void {
  const configured = process.env.APP_BASE_URL?.trim()
  if (!configured || !hasMatchingOrigin(request, new URL(configured).origin)) {
    throw new AppError(403, 'FORBIDDEN', 'Requests must originate from this application.')
  }
}

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get('Idempotency-Key')
  if (!value || !/^[\x21-\x7e]{8,128}$/.test(value)) {
    throw new AppError(400, 'INVALID_INPUT', 'Provide an Idempotency-Key of 8 to 128 characters.')
  }
  return value
}

export async function readBoundedBody(request: Request, maximumBytes: number): Promise<Buffer> {
  const declared = request.headers.get('Content-Length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    throw new AppError(413, 'FILE_TOO_LARGE', 'The request body is too large.')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new AppError(400, 'INVALID_INPUT', 'A request body is required.')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > maximumBytes) {
        await reader.cancel()
        throw new AppError(413, 'FILE_TOO_LARGE', 'The request body is too large.')
      }
      chunks.push(part.value)
    }
    return Buffer.concat(chunks)
  } finally { reader.releaseLock() }
}

export async function readJSON(request: Request): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AppError(400, 'INVALID_INPUT', 'Send a JSON request body.')
  }
  try { return JSON.parse((await readBoundedBody(request, 32768)).toString('utf8')) }
  catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(400, 'INVALID_INPUT', 'Send a valid JSON request body.')
  }
}

export function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new AppError(400, 'INVALID_INPUT', 'Check the request fields.', {
      fields: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    })
  }
  return result.data
}

export function jsonResult(data: unknown, status = 200): Response {
  const requestId = randomUUID()
  return Response.json({ data, requestId }, {
    status, headers: { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId },
  })
}

export async function handleC1(operation: () => Promise<Response>): Promise<Response> {
  try { return await operation() }
  catch (error) {
    if (error instanceof AnonymousSessionRequired) {
      return errorResponse(new AppError(401, 'UNAUTHENTICATED', 'Initialize a session before continuing.'))
    }
    if (error instanceof StorageError) {
      const status = error.code === 'NOT_FOUND' ? 404
        : error.code === 'REGION_NOT_CONFIGURED' ? 503 : 409
      const code = error.code === 'REGION_NOT_CONFIGURED' ? 'PROVIDER_UNAVAILABLE' : error.code
      return errorResponse(new AppError(status, code, error.message))
    }
    const response = errorResponse(error)
    if (!(error instanceof AppError)) {
      // Keep raw messages, inputs, SQL and provider credentials out of diagnostics.
      console.error(JSON.stringify({
        event: 'c1_request_failed', requestId: response.headers.get('X-Request-Id'),
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        frames: error instanceof Error ? error.stack?.split('\n').slice(1, 7)
          .map((line) => line.match(/\bat\s+(?:async\s+)?([A-Za-z0-9_.$<>]+)/)?.[1] ?? 'anonymous') : [],
        ...(error instanceof z.ZodError ? { issues: error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })) } : {}),
      }))
    }
    return response
  }
}

export function methodNotAllowed(allowed: string): Response {
  const response = errorResponse(new AppError(405, 'INVALID_INPUT', 'This method is not allowed.'))
  response.headers.set('Allow', allowed)
  return response
}
