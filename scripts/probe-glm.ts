import nextEnv from '@next/env'
import { getPayload } from 'payload'
import sharp from 'sharp'

import { AppError } from '../src/server/http/errors'
import { ProviderGate } from '../src/server/providers/gate'
import { createGlmAdapter, GlmProviderError, parseVisionPolicy } from '../src/server/providers/glm'
import { ProviderError } from '../src/server/providers/provider-error'
import { createRoutingRepository } from '../src/server/storage/routing-repository'

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2)
  const match = arguments_.length === 0 ? null : arguments_.length === 1 ? /^--attempts=([1-3])$/.exec(arguments_[0]) : null
  if (arguments_.length > 0 && !match) {
    console.error('Usage: pnpm exec tsx scripts/probe-glm.ts [--attempts=1|2|3]')
    process.exitCode = 2
    return
  }
  const attemptLimit = match ? Number(match[1]) : 1
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} })
  process.env.DISABLE_PAYLOAD_HMR = 'true'
  const missing = ['DATABASE_URL', 'PAYLOAD_SECRET', 'SESSION_SECRET', 'APP_BASE_URL', 'REGION_ID', 'VISION_API_KEY', 'VISION_DAILY_BUDGET']
    .filter((name) => !process.env[name]?.trim())
  if (missing.length > 0 || (process.env.VISION_PROVIDER?.trim() || 'glm') !== 'glm') {
    console.info(JSON.stringify({ probe: 'glm', status: 'blocked', code: missing.length ? 'CONFIGURATION_MISSING' : 'PROVIDER_UNSUPPORTED', missing }))
    process.exitCode = 1
    return
  }
  const policy = parseVisionPolicy(process.env)
  let requestCount = 0
  const adapter = createGlmAdapter({
    apiKey: process.env.VISION_API_KEY ?? '', model: process.env.VISION_MODEL?.trim() || 'glm-4.6v-flash',
    timeoutMs: Number(process.env.VISION_TIMEOUT_MS?.trim() || '8000'),
    fetch: async (url, options) => {
      if (requestCount >= attemptLimit) throw new Error('PROBE_REQUEST_LIMIT')
      requestCount += 1
      return fetch(url, options)
    },
  })
  const { default: config, assertPayloadEnvironment } = await import('../src/payload.config')
  assertPayloadEnvironment()
  const payload = await getPayload({ config })
  try {
    const gate = new ProviderGate(createRoutingRepository(payload, {
      regionId: process.env.REGION_ID ?? '', sessionSecret: process.env.SESSION_SECRET ?? '',
    }))
    // Generated geometric scene contains no real people or location. This tests wiring, not hazard accuracy.
    const bytes = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#bdd8e6"/><path d="M260 150 L380 150 L610 480 L30 480 Z" fill="#a9a9a9"/><rect x="120" y="260" width="400" height="50" fill="#ee7b22"/><rect x="135" y="310" width="20" height="100" fill="#333"/><rect x="485" y="310" width="20" height="100" fill="#333"/></svg>'))
      .jpeg({ quality: 80 }).toBuffer()
    let passed = false
    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      const startedAt = Date.now()
      try {
        const result = await gate.run({
          service: 'vision', keyFingerprint: adapter.keyFingerprint, policy,
          maxAttemptMs: adapter.timeoutMs, deadlineAt: startedAt + adapter.timeoutMs + 1000,
          operation: async () => {
            try { return await adapter.analyze({ bytes, mime: 'image/jpeg' }) }
            catch (error) {
              // The operator controls probe attempts. Disable the gate's own retry to respect the hard cap.
              if (error instanceof GlmProviderError) throw new GlmProviderError(error.status, error.code, error.message, {
                retryable: false, retryAfterSec: error.retryAfterSec, quotaResetAt: error.quotaResetAt,
                upstreamStatus: error.upstreamStatus, upstreamCode: error.upstreamCode,
              })
              if (error instanceof ProviderError) throw new ProviderError(error.status, error.code, error.message, {
                retryable: false, retryAfterSec: error.retryAfterSec, quotaResetAt: error.quotaResetAt,
              })
              throw error
            }
          },
        })
        passed = result.aiStatus !== 'unavailable'
        console.info(JSON.stringify({
          probe: 'glm', status: passed ? 'passed' : 'failed', model: adapter.model,
          attempt, requestCount, elapsedMs: Date.now() - startedAt, aiStatus: result.aiStatus,
          toolResultValidated: passed, unavailableReason: result.unavailableReason,
          sample: 'synthetic-geometric-scene', accuracyValidation: 'not-performed',
        }))
        if (passed) break
      } catch (error) {
        console.info(JSON.stringify({
          probe: 'glm', status: 'failed', model: adapter.model, attempt, requestCount,
          elapsedMs: Date.now() - startedAt, code: error instanceof AppError ? error.code : 'PROBE_FAILED',
          ...(error instanceof GlmProviderError ? {
            upstreamStatus: error.upstreamStatus, upstreamCode: error.upstreamCode ?? null,
          } : {}),
          ...(error instanceof ProviderError && error.retryAfterSec !== undefined ? { retryAfterSec: error.retryAfterSec } : {}),
          toolResultValidated: false, sample: 'synthetic-geometric-scene', accuracyValidation: 'not-performed',
        }))
        break
      }
    }
    if (!passed) process.exitCode = 1
  } finally { await payload.destroy() }
}

main().then(() => process.exit(process.exitCode ?? 0)).catch(() => {
  console.error('GLM_PROBE_FAILED: Check configuration, database and provider access. No secret or upstream response is logged.')
  process.exit(1)
})
