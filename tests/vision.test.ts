import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'

import { createGlmAdapter, GlmProviderError, parseVisionPolicy } from '../src/server/providers/glm'
import { ProviderError } from '../src/server/providers/provider-error'
import {
  AnalysisDTOSchema, parseGlmToolResult, RecordHazardAnalysisTool, VisionResultSchema, type VisionResult,
} from '../src/shared/contracts/vision'

const visibleHazard: VisionResult = {
  image_quality: 'usable', hazard_present: true, category: 'construction', visible_passage: 'blocked',
  description: 'A barrier crosses the visible path.', evidence: ['A barrier spans the passage.'],
  uncertainties: ['No alternative passage is visible.'],
}
const bytes = Buffer.from('synthetic-image-bytes')
function toolCall(result: unknown = visibleHazard, name = 'record_hazard_analysis') {
  return { id: 'synthetic-call', type: 'function', function: { name, arguments: JSON.stringify(result) } }
}
function completion(result: unknown = visibleHazard) {
  return { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [toolCall(result)] } }] }
}
function jsonFetch(body: unknown, status = 200, headers: HeadersInit = {}): typeof fetch {
  return async () => Response.json(body, { status, headers })
}
function expectProviderError(code: string, status: number, retryable: boolean) {
  return (error: unknown) => {
    assert.ok(error instanceof ProviderError)
    assert.equal(error.code, code)
    assert.equal(error.status, status)
    assert.equal(error.retryable, retryable)
    assert.ok(!JSON.stringify(error).includes('server-secret'))
    assert.ok(!String(error).includes('private-upstream'))
    return true
  }
}

test('vision accepts the complete seven-field result and rejects missing, extra and coerced fields', () => {
  assert.deepEqual(VisionResultSchema.parse(visibleHazard), visibleHazard)
  const missing: Partial<VisionResult> = { ...visibleHazard }
  delete missing.uncertainties
  for (const value of [missing, { ...visibleHazard, hazard_present: 'true' }, { ...visibleHazard, category: 'stairs' },
    { ...visibleHazard, location: [0, 0] }, { ...visibleHazard, description: '' }, { ...visibleHazard, evidence: ['x'.repeat(301)] },
    { ...visibleHazard, uncertainties: Array.from({ length: 11 }, () => 'x') }]) {
    assert.equal(VisionResultSchema.safeParse(value).success, false)
  }
  assert.deepEqual(RecordHazardAnalysisTool.function.parameters.required?.slice().sort(), Object.keys(visibleHazard).sort())
  assert.equal(RecordHazardAnalysisTool.function.parameters.additionalProperties, false)
})

test('only usable visible obstruction evidence forms a completed analysis', () => {
  assert.deepEqual(parseGlmToolResult(completion()), { aiStatus: 'completed', result: visibleHazard, unavailableReason: null })
  const uncertainResults: VisionResult[] = [
    { ...visibleHazard, image_quality: 'poor' }, { ...visibleHazard, image_quality: 'unusable' },
    { ...visibleHazard, hazard_present: false }, { ...visibleHazard, hazard_present: null },
    { ...visibleHazard, category: 'uncertain' }, { ...visibleHazard, visible_passage: 'clear' },
    { ...visibleHazard, visible_passage: 'unknown' }, { ...visibleHazard, evidence: [] },
  ]
  for (const result of uncertainResults) {
    assert.deepEqual(parseGlmToolResult(completion(result)), { aiStatus: 'uncertain', result, unavailableReason: null })
  }
  assert.equal(parseGlmToolResult(completion({ ...visibleHazard, visible_passage: 'partially_blocked' })).aiStatus, 'completed')
})

test('blank model descriptions and evidence never form an accepted analysis', () => {
  for (const text of [' ', '\t\r\n', '\u3000']) {
    for (const result of [
      { ...visibleHazard, description: text },
      { ...visibleHazard, evidence: [text] },
      { ...visibleHazard, uncertainties: [text] },
    ]) {
      assert.deepEqual(parseGlmToolResult(completion(result)), {
        aiStatus: 'unavailable', result: null, unavailableReason: 'invalid_output',
      })
    }
  }
})

test('text, wrong tools, multiple tools, multiple choices and truncated output never count as a result', () => {
  const invalid = [
    {}, { choices: [] }, { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(visibleHazard) } }] },
    { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [toolCall(visibleHazard, 'execute_code')] } }] },
    { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [toolCall(), toolCall()] } }] },
    { choices: [...completion().choices, ...completion().choices] },
    { choices: [{ finish_reason: 'length', message: { tool_calls: [toolCall()] } }] },
  ]
  for (const value of invalid) assert.deepEqual(parseGlmToolResult(value), {
    aiStatus: 'unavailable', result: null, unavailableReason: 'no_valid_tool_result',
  })
})

test('invalid JSON, schema mismatch and refusal preserve explicit unavailable reasons', () => {
  const malformed = { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ type: 'function', function: { name: 'record_hazard_analysis', arguments: '{' } }] } }] }
  assert.equal(parseGlmToolResult(malformed).unavailableReason, 'invalid_output')
  assert.equal(parseGlmToolResult(completion({ ...visibleHazard, hazard_present: 'false' })).unavailableReason, 'invalid_output')
  assert.deepEqual(parseGlmToolResult({ choices: [{ finish_reason: 'stop', message: { refusal: 'Cannot comply.' } }] }), {
    aiStatus: 'unavailable', result: null, unavailableReason: 'refused',
  })
  assert.equal(parseGlmToolResult({ choices: [{ finish_reason: 'content_filter', message: {} }] }).unavailableReason, 'refused')
})

test('analysis DTO rejects mismatched status, result and unavailability reason', () => {
  const metadata = {
    analysisId: 'analysis-1', photoId: 'photo-1', model: 'glm-4.6v-flash', promptVersion: '1', schemaVersion: '1',
    createdAt: '2026-10-17T00:00:00.000Z', cacheHit: false,
  }
  const valid = { ...metadata, ...parseGlmToolResult(completion()) }
  assert.deepEqual(AnalysisDTOSchema.parse(valid), valid)
  for (const value of [
    { ...valid, result: null }, { ...valid, aiStatus: 'uncertain' }, { ...valid, unavailableReason: 'provider_timeout' },
    { ...valid, aiStatus: 'unavailable' }, { ...valid, cacheHit: 'false' }, { ...valid, extra: true },
  ]) assert.equal(AnalysisDTOSchema.safeParse(value).success, false)
})

test('GLM sends native image bytes and the sole result tool only to the official endpoint', async () => {
  let requests = 0
  const adapter = createGlmAdapter({ apiKey: 'server-secret', fetch: async (url, options) => {
    requests += 1
    assert.equal(String(url), 'https://open.bigmodel.cn/api/paas/v4/chat/completions')
    assert.equal(options?.method, 'POST')
    assert.equal(options?.redirect, 'error')
    assert.equal(options?.cache, 'no-store')
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer server-secret')
    const request = z.object({ model: z.string(), tools: z.array(z.unknown()), stream: z.boolean(),
      messages: z.array(z.object({ role: z.string(), content: z.union([z.string(), z.array(z.object({
        type: z.string(), image_url: z.object({ url: z.string() }).optional(), text: z.string().optional(),
      }))]) })) }).parse(JSON.parse(String(options?.body)))
    assert.equal(request.model, 'glm-4.6v-flash')
    assert.equal(request.stream, false)
    assert.deepEqual(request.tools, [RecordHazardAnalysisTool])
    const content = request.messages[1].content
    assert.ok(Array.isArray(content))
    assert.equal(content[0].image_url?.url, `data:image/jpeg;base64,${bytes.toString('base64')}`)
    return Response.json(completion())
  } })
  assert.equal((await adapter.analyze({ bytes, mime: 'image/jpeg' })).aiStatus, 'completed')
  assert.equal(requests, 1)
  assert.match(adapter.keyFingerprint, /^sha256:[a-f0-9]{64}$/)
  assert.ok(!adapter.identity.includes('server-secret'))
  assert.equal(adapter.timeoutMs, 8000)
})

test('GLM validates configuration and processed image size before requesting', async () => {
  for (const options of [{ apiKey: '' }, { apiKey: 'key', timeoutMs: 0 }, { apiKey: 'key', timeoutMs: 15001 }, { apiKey: 'key', model: 'https://evil.example' }]) {
    assert.throws(() => createGlmAdapter(options), expectProviderError('PROVIDER_UNAVAILABLE', 503, false))
  }
  const adapter = createGlmAdapter({ apiKey: 'key', fetch: async () => assert.fail('Must validate before network.') })
  for (const bytes_ of [Buffer.alloc(0), Buffer.alloc(5 * 1024 * 1024 + 1)]) {
    await assert.rejects(adapter.analyze({ bytes: bytes_, mime: 'image/png' }), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'INVALID_INPUT')
  }
})

test('GLM authentication and server errors are sanitized and are never automatically called quota failures', async () => {
  for (const status of [400, 401, 403, 404, 500, 503]) {
    let requests = 0
    const adapter = createGlmAdapter({ apiKey: 'server-secret', fetch: async () => {
      requests += 1
      return Response.json({ error: { message: 'private-upstream server-secret quota exceeded' } }, { status })
    } })
    await assert.rejects(adapter.analyze({ bytes, mime: 'image/jpeg' }), expectProviderError('PROVIDER_UNAVAILABLE', 503, status >= 500))
    assert.equal(requests, 1)
  }
})

test('GLM rate limits expose only bounded numeric retry metadata', async () => {
  for (const retryAfter of ['12', 'private-upstream server-secret', '99999999999999999']) {
    const adapter = createGlmAdapter({ apiKey: 'server-secret', fetch: jsonFetch({ error: 'private-upstream' }, 429, { 'Retry-After': retryAfter }) })
    await assert.rejects(adapter.analyze({ bytes, mime: 'image/png' }), (error: unknown) => {
      expectProviderError('RATE_LIMITED', 429, true)(error)
      assert.ok(error instanceof ProviderError)
      assert.equal(error.retryAfterSec, retryAfter === '12' ? 12 : 60)
      return true
    })
  }
})

test('GLM official business codes distinguish balance, period quota, capacity, rate and account configuration', async () => {
  const cases = [
    { upstreamCode: '1113', code: 'QUOTA_EXHAUSTED', status: 503, retryable: false },
    { upstreamCode: '1302', code: 'RATE_LIMITED', status: 429, retryable: true },
    { upstreamCode: '1305', code: 'PROVIDER_UNAVAILABLE', status: 503, retryable: true },
    { upstreamCode: '1308', code: 'QUOTA_EXHAUSTED', status: 503, retryable: false },
    { upstreamCode: '1310', code: 'QUOTA_EXHAUSTED', status: 503, retryable: false },
    { upstreamCode: '1309', code: 'PROVIDER_UNAVAILABLE', status: 503, retryable: false },
    { upstreamCode: '1311', code: 'PROVIDER_UNAVAILABLE', status: 503, retryable: false },
    { upstreamCode: '1315', code: 'PROVIDER_UNAVAILABLE', status: 503, retryable: false },
  ]
  for (const item of cases) {
    const adapter = createGlmAdapter({ apiKey: 'server-secret', fetch: jsonFetch({ error: { code: item.upstreamCode, message: 'private-upstream server-secret' } }, 429) })
    await assert.rejects(adapter.analyze({ bytes, mime: 'image/jpeg' }), (error: unknown) => {
      expectProviderError(item.code, item.status, item.retryable)(error)
      assert.ok(error instanceof GlmProviderError)
      assert.equal(error.upstreamStatus, 429)
      assert.equal(error.upstreamCode, item.upstreamCode)
      return true
    })
  }
  const numeric = createGlmAdapter({ apiKey: 'key', fetch: jsonFetch({ error: { code: 1302 } }, 429) })
  await assert.rejects(numeric.analyze({ bytes, mime: 'image/jpeg' }), (error: unknown) => error instanceof GlmProviderError && error.upstreamCode === '1302')
})

test('GLM error diagnostics reject arbitrary strings and oversized bodies without leaking messages', async () => {
  for (const body of [{ error: { code: 'private-upstream server-secret' } }, { error: { code: 1e100 } },
    { error: { code: '1302', message: 'private-upstream server-secret'.repeat(2000) } }]) {
    const adapter = createGlmAdapter({ apiKey: 'server-secret', fetch: jsonFetch(body, 429) })
    await assert.rejects(adapter.analyze({ bytes, mime: 'image/jpeg' }), (error: unknown) => {
      expectProviderError('RATE_LIMITED', 429, true)(error)
      assert.ok(error instanceof GlmProviderError)
      assert.equal(error.upstreamCode, undefined)
      return true
    })
  }
})

test('GLM rejects redirects and preserves network versus timeout errors', async () => {
  await assert.rejects(createGlmAdapter({ apiKey: 'key', fetch: async () => new Response(null, { status: 302 }) }).analyze({ bytes, mime: 'image/jpeg' }),
    expectProviderError('PROVIDER_UNAVAILABLE', 503, false))
  await assert.rejects(createGlmAdapter({ apiKey: 'key', fetch: async () => { throw new Error('private-upstream') } }).analyze({ bytes, mime: 'image/jpeg' }),
    expectProviderError('PROVIDER_UNAVAILABLE', 503, true))
  const hangingFetch: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
  await assert.rejects(createGlmAdapter({ apiKey: 'key', timeoutMs: 5, fetch: hangingFetch }).analyze({ bytes, mime: 'image/jpeg' }),
    expectProviderError('PROVIDER_TIMEOUT', 504, true))
  const hangingBody: typeof fetch = async () => new Response(new ReadableStream({ start() {} }))
  await assert.rejects(createGlmAdapter({ apiKey: 'key', timeoutMs: 5, fetch: hangingBody }).analyze({ bytes, mime: 'image/png' }),
    expectProviderError('PROVIDER_TIMEOUT', 504, true))
})

test('malformed successful JSON is unavailable while an interrupted response stream is a provider error', async () => {
  const malformed = createGlmAdapter({ apiKey: 'key', fetch: async () => new Response('not JSON') })
  assert.deepEqual(await malformed.analyze({ bytes, mime: 'image/jpeg' }), { aiStatus: 'unavailable', result: null, unavailableReason: 'invalid_output' })
  const interrupted = createGlmAdapter({ apiKey: 'key', fetch: async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('private-upstream')) } })) })
  await assert.rejects(interrupted.analyze({ bytes, mime: 'image/jpeg' }), expectProviderError('PROVIDER_UNAVAILABLE', 503, true))
})

test('vision budget supports an explicit unlimited daily choice and still requires a positive minute policy', () => {
  assert.deepEqual(parseVisionPolicy({ VISION_DAILY_BUDGET: 'unlimited' }), { minuteLimit: 10, dayLimit: Number.MAX_SAFE_INTEGER })
  assert.deepEqual(parseVisionPolicy({ VISION_RPM: '5', VISION_DAILY_BUDGET: '100' }), { minuteLimit: 5, dayLimit: 100 })
  for (const configuration of [{}, { VISION_DAILY_BUDGET: '0' }, { VISION_DAILY_BUDGET: '-1' },
    { VISION_DAILY_BUDGET: 'Infinity' }, { VISION_DAILY_BUDGET: '9999999999999999999999' },
    { VISION_DAILY_BUDGET: 'unlimited', VISION_RPM: '0' }, { VISION_DAILY_BUDGET: 'unlimited', VISION_RPM: '1.5' }]) {
    assert.throws(() => parseVisionPolicy(configuration), expectProviderError('PROVIDER_UNAVAILABLE', 503, false))
  }
})
