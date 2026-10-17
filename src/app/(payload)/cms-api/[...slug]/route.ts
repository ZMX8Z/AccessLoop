import { hasMatchingOrigin } from '@/server/http/origin'
import config, { appOrigin, assertPayloadEnvironment } from '@payload-config'
import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST, REST_PUT } from '@payloadcms/next/routes'
import { randomUUID } from 'node:crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type PayloadHandler = ReturnType<typeof REST_GET>

function withCMSHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Request-Id', requestId)
  headers.set('Cache-Control', 'private, no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function configured(handler: PayloadHandler, write = false): PayloadHandler {
  return async (request, context) => {
    const requestId = randomUUID()
    try {
      assertPayloadEnvironment()
    } catch (error) {
      return withCMSHeaders(Response.json(
        { errors: [{ message: error instanceof Error ? error.message : 'Payload is not configured.' }] },
        { status: 503 },
      ), requestId)
    }
    if (write && (!appOrigin || !hasMatchingOrigin(request, appOrigin))) {
      return withCMSHeaders(Response.json(
        { errors: [{ message: 'Requests must originate from the configured application.' }] },
        { status: 403 },
      ), requestId)
    }
    return withCMSHeaders(await handler(request, context), requestId)
  }
}

export const GET = configured(REST_GET(config))
export const POST = configured(REST_POST(config), true)
export const DELETE = configured(REST_DELETE(config), true)
export const PATCH = configured(REST_PATCH(config), true)
export const PUT = configured(REST_PUT(config), true)
export const OPTIONS = configured(REST_OPTIONS(config))
