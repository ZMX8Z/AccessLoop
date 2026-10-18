import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { z } from 'zod'

import { issueSessionCredential, sessionOwnerHash } from '../src/server/auth/session-cookie'
import { createBusinessRepository } from '../src/server/storage/business-repository'
import { withTransaction } from '../src/server/storage/transaction'
import { createHazardService } from '../src/features/hazards/server/service'
import { bufferPassage } from '../src/features/routing/server/geometry'
import { IdSchema } from '../src/shared/contracts/common'
import { PrivateReportDTOSchema, PublicReportDTOSchema } from '../src/shared/contracts/hazards'
import { RegionAdminDTOSchema } from '../src/shared/contracts/admin-region'
import { UsageSummarySchema } from '../src/shared/contracts/route-result'
import { AnalysisDTOSchema } from '../src/shared/contracts/vision'
import { dRoutingFixture } from '../src/shared/fixtures/d-routing'

class AdminCheckFailed extends Error {
  constructor(readonly checkId: string) { super(checkId) }
}
function check(condition: unknown, checkId: string): asserts condition {
  if (!condition) throw new AdminCheckFailed(checkId)
}
const ErrorEnvelopeSchema = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string(), details: z.unknown().optional() }), requestId: IdSchema,
})
const NativeDocumentSchema = z.object({ id: z.union([z.string(), z.number()]) })
const NativeListSchema = z.object({ docs: z.array(NativeDocumentSchema), totalDocs: z.number().int().nonnegative() })

async function availableLoopbackPort(): Promise<number> {
  const listener = createServer()
  await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve) })
  const address = listener.address()
  check(address && typeof address !== 'string', 'loopback_address')
  const port = address.port
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()))
  return port
}

test('production admin HTTP enforces role boundaries and completes C2 review and C3 configuration commands', {
  skip: process.env.ACCESSLOOP_ADMIN_HTTP_TESTS !== '1', timeout: 240_000,
}, async (t) => {
  const database = z.url().safeParse(process.env.DATABASE_URL)
  check(database.success, 'isolated_database_url_required')
  const databaseURL = new URL(database.data)
  check(['postgres:', 'postgresql:'].includes(databaseURL.protocol)
    && ['localhost', '127.0.0.1'].includes(databaseURL.hostname)
    && /^[A-Za-z0-9_]*_test[A-Za-z0-9_]*$/.test(decodeURIComponent(databaseURL.pathname.slice(1))), 'local_test_database_required')
  check(process.env.APP_MODE === 'demo' && process.env.DISABLE_PAYLOAD_HMR === 'true', 'isolated_demo_test_environment_required')
  check(Buffer.byteLength(process.env.SESSION_SECRET ?? '') >= 32, 'test_session_secret_required')

  const run = `admin-http-${randomUUID()}`
  const regionIds = [run, `${run}-outside`]
  const regionId = regionIds[0]
  const credential = issueSessionCredential(process.env.SESSION_SECRET ?? '')
  const owner = sessionOwnerHash(credential)
  const anonymousCookie = `accessloop_session=${credential}`
  const photoId = `${run}-photo`
  const analysisId = `${run}-analysis`
  const ownAdmins: number[] = []
  let payload: Payload | undefined
  let server: ChildProcess | undefined
  let serverFailed = false
  let stage = 'fixture_setup'
  let last = { httpStatus: 0, code: '', requestId: '' }
  let failure: Error | undefined
  let cleanupFailed = false
  const enter = (name: string) => { stage = name; t.diagnostic(name) }
  async function stopServer() {
    if (!server?.pid || server.exitCode !== null || server.signalCode !== null) return
    const child = server
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    child.kill('SIGTERM')
    await Promise.race([exited, delay(8000)])
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await Promise.race([exited, delay(3000)])
    }
    check(child.exitCode !== null || child.signalCode !== null, 'owned_server_stopped')
  }
  t.after(stopServer)

  try {
    enter('create_random_test_region_accounts_and_metadata_only_evidence')
    const { getPayload, createLocalReq } = await import('payload')
    const { default: config } = await import('../src/payload.config')
    const parentConfig = await config
    payload = await getPayload({ config: { ...parentConfig, telemetry: false } })
    const business = createBusinessRepository(payload)
    await business.ensureSession(owner)
    for (const id of regionIds) await business.seedRegion({
      region: { ...dRoutingFixture.region, id },
      presetPassages: [{ ...dRoutingFixture.passages[0], id: `${id}-passage` }],
      source: { kind: 'synthetic', note: 'Isolated administrative HTTP fixture. No field survey, real photo upload or model call.' },
    })
    const existing = await payload.find({ collection: 'admins', where: { and: [{ enabled: { equals: true } }, { role: { equals: 'operator' } }] }, overrideAccess: true, limit: 1 })
    let manager = existing.docs[0]
    if (!manager) {
      check((await payload.count({ collection: 'admins', overrideAccess: true })).totalDocs === 0, 'existing_operator_or_empty_test_accounts_required')
      manager = await payload.create({ collection: 'admins', data: {
        email: `${run}-bootstrap@example.invalid`, password: randomUUID(), role: 'operator', enabled: true,
      }, overrideAccess: true, context: { bootstrapAdmin: true } })
      ownAdmins.push(manager.id)
    }
    const managerReq = await createLocalReq({ user: { ...manager, collection: 'admins' } }, payload)
    const password = randomUUID()
    const operator = await payload.create({ collection: 'admins', data: {
      email: `${run}-operator@example.invalid`, password, role: 'operator', enabled: true,
    }, overrideAccess: true, req: managerReq })
    ownAdmins.push(operator.id)
    const reviewer = await payload.create({ collection: 'admins', data: {
      email: `${run}-reviewer@example.invalid`, password, role: 'report_admin', enabled: true,
    }, overrideAccess: true, req: managerReq })
    ownAdmins.push(reviewer.id)
    const createdAt = new Date(Date.now() - 1000).toISOString()
    await withTransaction(payload, async ({ execute }) => {
      for (const id of regionIds) {
        const fixturePhoto = id === regionId ? photoId : `${id}-photo`
        await execute(sql`INSERT INTO photos(id,region_id,owner_session_hash,purpose,upload_state,image_hash,filename,mime_type)
          VALUES (${fixturePhoto},${id},${owner},'report','ready',${`sha256:${'d'.repeat(64)}`},${`${fixturePhoto}.png`},'image/png')`)
      }
    })
    const visionConfig = { model: process.env.VISION_MODEL?.trim() || 'glm-4.6v', promptVersion: process.env.VISION_PROMPT_VERSION?.trim() || '1', schemaVersion: process.env.VISION_SCHEMA_VERSION?.trim() || '1' }
    await payload.create({ collection: 'ai-analyses', data: {
      id: analysisId, regionId, ownerSessionHash: owner, photoId, imageHash: `sha256:${'d'.repeat(64)}`, cacheKey: `${run}-analysis-cache`,
      analysis: AnalysisDTOSchema.parse({ analysisId, photoId, ...visionConfig, createdAt, cacheHit: false, aiStatus: 'unavailable', result: null, unavailableReason: 'provider_unavailable' }),
    }, overrideAccess: true })
    const hazards = createHazardService(payload, { regionId, sessionSecret: process.env.SESSION_SECRET ?? '', visionConfig })
    const passage = { ...dRoutingFixture.passages[0], id: `${regionId}-passage` }
    const location = passage.geometry.coordinates[0]
    const created = await hazards.create({ ownerSessionHash: owner, idempotencyKey: `${run}-create`, input: {
      photoId, location, category: 'construction', description: 'Synthetic administrative HTTP test; no real-world observation.', observedAt: createdAt,
    } })
    const reportId = created.result.id
    const previewInput = { expectedVersion: created.result.rowVersion, observedAt: createdAt, passage: { presetPassageId: passage.id, passageVersion: passage.passageVersion } }
    const preview = await hazards.preview({ ownerSessionHash: owner, reportId, input: previewInput })
    const initiallyConfirmed = await hazards.confirm({ ownerSessionHash: owner, reportId, idempotencyKey: `${run}-confirm`, input: { ...previewInput, previewDigest: preview.previewDigest, consent: true } })
    check(initiallyConfirmed.result.personalAvoidance?.effective, 'fixture_personal_confirmation')
    const foreignHazards = createHazardService(payload, { regionId: regionIds[1], sessionSecret: process.env.SESSION_SECRET ?? '', visionConfig })
    const foreign = await foreignHazards.create({ ownerSessionHash: owner, idempotencyKey: `${run}-outside-create`, input: {
      photoId: `${regionIds[1]}-photo`, location, category: 'construction', description: 'Separate test region.', observedAt: createdAt,
    } })

    enter('start_owned_production_server_on_random_loopback_port')
    const port = await availableLoopbackPort()
    const base = `http://127.0.0.1:${port}`
    const childEnvironment: NodeJS.ProcessEnv = {
      ...process.env, NODE_ENV: 'production', APP_BASE_URL: base, REGION_ID: regionId,
      NEXT_TELEMETRY_DISABLED: '1', PAYLOAD_TELEMETRY_DEBUG: '1', TRUSTED_MAINTAINER_REFERENCES: '[]',
      OSS_ENDPOINT: '', OSS_BUCKET: '', OSS_REGION: '', OSS_ACCESS_KEY_ID: '', OSS_ACCESS_KEY_SECRET: '', VISION_API_KEY: '', ORS_API_KEY: '',
    }
    server = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: process.cwd(), env: childEnvironment, windowsHide: true, stdio: 'ignore',
    })
    server.once('error', () => { serverFailed = true })
    const readyDeadline = Date.now() + 45_000
    let ready = false
    while (Date.now() < readyDeadline) {
      check(!serverFailed && server.exitCode === null && server.signalCode === null, 'owned_server_startup')
      t.signal.throwIfAborted()
      try {
        const health = await fetch(`${base}/api/health`, { redirect: 'manual', signal: AbortSignal.timeout(1000) })
        ready = health.status === 200
        await health.body?.cancel()
        if (ready) break
      } catch { /* Wait only for this owned local server. */ }
      await delay(200)
    }
    check(ready, 'owned_server_health')
    const request = async (urlPath: string, init: RequestInit = {}) => {
      last = { httpStatus: 0, code: '', requestId: '' }
      // Payload accepts cookie authentication only with a trusted Origin or browser fetch metadata.
      const browserHeaders = new Headers(init.headers)
      browserHeaders.set('Sec-Fetch-Site', 'same-origin')
      const response = await fetch(`${base}${urlPath}`, { ...init, headers: browserHeaders, redirect: 'manual', signal: AbortSignal.any([t.signal, AbortSignal.timeout(20_000)]) })
      last = { httpStatus: response.status, code: '', requestId: response.headers.get('X-Request-Id') ?? '' }
      return response
    }
    async function success<T>(response: Response, schema: z.ZodType<T>, status = 200) {
      const body: unknown = await response.json()
      const error = ErrorEnvelopeSchema.safeParse(body)
      if (error.success) last.code = error.data.error.code
      check(response.status === status, 'success_http_status')
      const parsed = z.strictObject({ data: schema, requestId: IdSchema }).safeParse(body)
      check(parsed.success, 'success_response_schema')
      check(parsed.data.requestId === response.headers.get('X-Request-Id') && response.headers.get('Cache-Control')?.includes('no-store'), 'business_response_headers')
      return parsed.data.data
    }
    async function expectError(response: Response, status: number, code: string) {
      const parsed = ErrorEnvelopeSchema.safeParse(await response.json())
      if (parsed.success) last.code = parsed.data.error.code
      check(response.status === status, 'error_http_status')
      check(parsed.success && parsed.data.error.code === code, 'error_response_code')
      check(parsed.data.requestId === response.headers.get('X-Request-Id'), 'error_request_id')
    }
    const headers = (cookie?: string) => ({ Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) })
    async function login(email: string) {
      const response = await request('/cms-api/admins/login', { method: 'POST', headers: headers(), body: JSON.stringify({ email, password }) })
      check(response.status === 200, 'administrator_login')
      const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).find((value) => value.startsWith('payload-token='))
      await response.body?.cancel()
      check(cookie, 'administrator_session_cookie')
      return cookie
    }
    const operatorCookie = await login(operator.email)
    const reviewerCookie = await login(reviewer.email)
    const reportPath = `/api/reports/${encodeURIComponent(reportId)}`
    const review = (cookie: string, key: string, body: unknown, includeOrigin = true) => request(`${reportPath}/review`, {
      method: 'PATCH', headers: { ...headers(cookie), ...(includeOrigin ? {} : { Origin: '' }), 'Idempotency-Key': key }, body: JSON.stringify(body),
    })

    enter('real_payload_server_components_mount_with_role_specific_content')
    const operatorDashboard = await request('/admin', { headers: { Cookie: operatorCookie } })
    check(operatorDashboard.status === 200, 'operator_dashboard_status')
    const operatorMarkup = await operatorDashboard.text()
    check(operatorMarkup.includes('AccessLoop administration'), 'operator_dashboard_component_mount')
    check(operatorMarkup.includes('Region and preset passages'), 'operator_dashboard_region_configuration')
    check(operatorMarkup.includes('Service usage'), 'operator_dashboard_usage')
    const reviewerDashboard = await request('/admin', { headers: { Cookie: reviewerCookie } })
    check(reviewerDashboard.status === 200, 'reviewer_dashboard_status')
    const reviewerMarkup = await reviewerDashboard.text()
    check(reviewerMarkup.includes('Service usage') && !reviewerMarkup.includes('Region and preset passages'), 'reviewer_has_no_operator_configuration')
    const detail = await request(`/admin/collections/hazard-reports/${encodeURIComponent(reportId)}`, { headers: { Cookie: reviewerCookie } })
    check(detail.status === 200, 'native_report_detail_status')
    const detailMarkup = await detail.text()
    check(detailMarkup.includes('Review report') && detailMarkup.includes('Demonstration record.'), 'real_report_review_component')

    enter('anonymous_role_origin_and_native_read_only_boundaries')
    await expectError(await request('/api/admin/region', { headers: { Cookie: anonymousCookie } }), 401, 'UNAUTHENTICATED')
    await expectError(await request('/api/admin/usage-summary'), 401, 'UNAUTHENTICATED')
    await expectError(await request('/api/admin/region', { headers: { Cookie: reviewerCookie } }), 403, 'FORBIDDEN')
    await expectError(await request('/api/admin/region', { method: 'PATCH', headers: { ...headers(reviewerCookie), 'Idempotency-Key': `${run}-reviewer-config` }, body: JSON.stringify({ expectedVersion: 1, reason: 'Forbidden fixture edit.', changes: { name: 'Not authorized' } }) }), 403, 'FORBIDDEN')
    await expectError(await review(reviewerCookie, `${run}-missing-origin`, { expectedVersion: 2, action: 'reject', reason: 'Origin rejection fixture.' }, false), 403, 'FORBIDDEN')
    await expectError(await review(anonymousCookie, `${run}-anonymous-review`, { expectedVersion: 2, action: 'reject', reason: 'Anonymous rejection fixture.' }), 401, 'UNAUTHENTICATED')
    for (const urlPath of [`/cms-api/hazard-reports/${reportId}`, `/cms-api/ai-analyses/${analysisId}`, `/cms-api/report-events?where[reportId][equals]=${reportId}`]) {
      const response = await request(urlPath, { headers: { Cookie: reviewerCookie } })
      check(response.status === 200, 'authorized_native_read')
      const raw: unknown = await response.json()
      check(urlPath.includes('report-events') ? NativeListSchema.safeParse(raw).success : NativeDocumentSchema.safeParse(raw).success, 'native_read_schema')
    }
    const foreignRead = await request(`/cms-api/hazard-reports/${foreign.result.id}`, { headers: { Cookie: reviewerCookie } })
    check([403, 404].includes(foreignRead.status), 'native_region_isolation')
    await foreignRead.body?.cancel()
    for (const [urlPath, method] of [
      ['/cms-api/hazard-reports', 'POST'], [`/cms-api/hazard-reports/${reportId}`, 'PATCH'],
      ['/cms-api/ai-analyses', 'POST'], [`/cms-api/ai-analyses/${analysisId}`, 'PATCH'], ['/cms-api/report-events', 'POST'],
    ]) {
      const response = await request(urlPath, { method, headers: headers(operatorCookie), body: JSON.stringify({ status: 'verified', rowVersion: 999, context: { internalPhotoWrite: true } }) })
      check([401, 403, 404, 501].includes(response.status), 'native_business_write_rejected')
      await response.body?.cancel()
    }

    enter('independent_evidence_verify_replay_and_public_whitelist')
    const publicGeometry = bufferPassage(passage.geometry, dRoutingFixture.region.avoidanceBufferM, dRoutingFixture.region.bbox)
    const beforeBadEvidence = await business.requireRegion(regionId)
    await expectError(await review(reviewerCookie, `${run}-missing-evidence`, { expectedVersion: 2, action: 'verify', reason: 'Synthetic missing-evidence test.', publicAvoidGeometry: publicGeometry }), 422, 'EVIDENCE_REQUIRED')
    check((await payload.findByID({ collection: 'hazard-reports', id: reportId, overrideAccess: true })).rowVersion === 2, 'failed_verify_preserves_report_version')
    check((await business.requireRegion(regionId)).hazardVersion === beforeBadEvidence.hazardVersion, 'failed_verify_preserves_public_version')
    const evidence = () => ({ kind: 'field_observation', observedAt: new Date(Date.now() - 1000).toISOString(), summary: 'Synthetic independent test evidence only; no actual field visit occurred.' })
    const verifyInput = { expectedVersion: 2, action: 'verify', reason: 'Validate the isolated synthetic review workflow.', extraEvidence: evidence(), publicAvoidGeometry: publicGeometry }
    const verifyKey = `${run}-verify`
    const verified = await success(await review(reviewerCookie, verifyKey, verifyInput), PrivateReportDTOSchema)
    check(verified.status === 'verified' && verified.publicRevision === 1 && verified.rowVersion === 3, 'verified_versions')
    const afterVerify = await business.requireRegion(regionId)
    check(afterVerify.hazardVersion === beforeBadEvidence.hazardVersion + 1, 'verify_publishes_effective_version')
    const published = await success(await request(reportPath), PublicReportDTOSchema)
    check(published.publicActivity === 'active' && published.status === 'verified', 'public_active_snapshot')
    check(!/photoId|analysis|ownerSessionHash|actorId|extraEvidence|keyFingerprint/.test(JSON.stringify(published)), 'public_whitelist_does_not_leak_private_fields')
    const replayed = await success(await review(reviewerCookie, verifyKey, verifyInput), PrivateReportDTOSchema)
    check(JSON.stringify(replayed) === JSON.stringify(verified) && (await business.requireRegion(regionId)).hazardVersion === afterVerify.hazardVersion, 'review_replay_is_read_only')
    await expectError(await review(reviewerCookie, `${run}-stale-version`, { expectedVersion: 2, action: 'resolve', reason: 'Stale version fixture.', extraEvidence: evidence() }), 409, 'VERSION_CONFLICT')

    enter('configuration_display_replay_and_active_geometry_conflict')
    const configuration = await success(await request('/api/admin/region', { headers: { Cookie: operatorCookie } }), RegionAdminDTOSchema)
    const configInput = { expectedVersion: configuration.region.configVersion, reason: 'Rename the isolated test region.', changes: { name: `HTTP region ${randomUUID()}` } }
    const configKey = `${run}-config`
    const patchConfiguration = (body: unknown, key = configKey) => request('/api/admin/region', { method: 'PATCH', headers: { ...headers(operatorCookie), 'Idempotency-Key': key }, body: JSON.stringify(body) })
    const changed = await success(await patchConfiguration(configInput), RegionAdminDTOSchema)
    check(changed.region.configVersion === configuration.region.configVersion + 1 && changed.region.hazardVersion === configuration.region.hazardVersion, 'configuration_display_versions')
    const replayedConfig = await success(await patchConfiguration(configInput), RegionAdminDTOSchema)
    check(JSON.stringify(replayedConfig) === JSON.stringify(changed), 'configuration_idempotent_replay')
    const conflictResponse = await patchConfiguration({ expectedVersion: changed.region.configVersion, reason: 'Synthetic conflicting boundary probe.', changes: { bbox: [151.231, -33.93, 151.24, -33.91] } }, `${run}-config-conflict`)
    await expectError(conflictResponse, 409, 'CONFIG_CONFLICT')
    const afterConflict = await success(await request('/api/admin/region', { headers: { Cookie: operatorCookie } }), RegionAdminDTOSchema)
    check(JSON.stringify(afterConflict) === JSON.stringify(changed), 'configuration_conflict_is_atomic')

    enter('usage_fixed_window_and_disabled_administrator_replay')
    const usage = await success(await request('/api/admin/usage-summary', { headers: { Cookie: reviewerCookie } }), UsageSummarySchema)
    check(Date.parse(usage.windowEnd) - Date.parse(usage.windowStart) === 86_400_000 && Math.abs(Date.parse(usage.windowEnd) - Date.now()) < 10_000, 'fixed_recent_usage_window')
    check(!/keyFingerprint|password|secret|cookie|location|route/i.test(JSON.stringify(usage)), 'usage_does_not_expose_credentials_or_positions')
    await expectError(await request('/api/admin/usage-summary?from=2000-01-01', { headers: { Cookie: reviewerCookie } }), 400, 'INVALID_INPUT')
    await withTransaction(payload, async ({ execute }) => { await execute(sql`UPDATE admins SET enabled=false WHERE id=${reviewer.id}`) })
    try { await expectError(await review(reviewerCookie, verifyKey, verifyInput), 401, 'UNAUTHENTICATED') }
    finally { await withTransaction(payload, async ({ execute }) => { await execute(sql`UPDATE admins SET enabled=true WHERE id=${reviewer.id}`) }) }
    await withTransaction(payload, async ({ execute }) => { await execute(sql`UPDATE admins SET enabled=false WHERE id=${operator.id}`) })
    try { await expectError(await patchConfiguration(configInput), 401, 'UNAUTHENTICATED') }
    finally { await withTransaction(payload, async ({ execute }) => { await execute(sql`UPDATE admins SET enabled=true WHERE id=${operator.id}`) }) }

    enter('resolve_reopen_and_reject_do_not_restore_personal_or_public_effects')
    const resolved = await success(await review(reviewerCookie, `${run}-resolve`, { expectedVersion: verified.rowVersion, action: 'resolve', reason: 'Synthetic independent resolution evidence.', extraEvidence: evidence() }), PrivateReportDTOSchema)
    check(resolved.status === 'resolved' && resolved.publicActivity === 'inactive' && resolved.personalAvoidance?.effective === false, 'resolved_effects_are_inactive')
    const reopened = await success(await review(reviewerCookie, `${run}-reopen`, { expectedVersion: resolved.rowVersion, action: 'reopen', reason: 'Reopen only the synthetic test report.' }), PrivateReportDTOSchema)
    check(reopened.status === 'pending' && reopened.personalAvoidance?.effective === false, 'reopen_does_not_restore_confirmation')
    await expectError(await request(reportPath), 404, 'NOT_FOUND')
    const rejected = await success(await review(reviewerCookie, `${run}-reject`, { expectedVersion: reopened.rowVersion, action: 'reject', reason: 'Reject the synthetic fixture after reopening.' }), PrivateReportDTOSchema)
    check(rejected.status === 'rejected' && rejected.personalAvoidance?.effective === false, 'rejection_remains_inactive')
    await expectError(await request(reportPath), 404, 'NOT_FOUND')
  } catch (error) {
    failure = new Error(JSON.stringify({ stage, check: error instanceof AdminCheckFailed ? error.checkId : 'operation_failed', ...last }))
  } finally {
    enter('stop_owned_server_and_remove_only_random_test_fixtures')
    try { await stopServer() } catch { cleanupFailed = true }
    if (payload) {
      try {
        await withTransaction(payload, async ({ execute }) => {
          for (const id of regionIds) {
            await execute(sql`DELETE FROM idempotency_records WHERE result->>'regionId'=${id} OR result->'region'->>'id'=${id}`)
            await execute(sql`DELETE FROM report_events WHERE report_id IN (SELECT id FROM hazard_reports WHERE region_id=${id}) OR report_id=${`region:${id}`}`)
            await execute(sql`DELETE FROM personal_avoidances WHERE region_id=${id}`)
            await execute(sql`DELETE FROM hazard_reports WHERE region_id=${id}`)
            await execute(sql`DELETE FROM ai_analyses WHERE region_id=${id}`)
            // These rows were inserted as metadata-only fixtures; no OSS object ever existed.
            await execute(sql`DELETE FROM photos WHERE region_id=${id} AND owner_session_hash=${owner}`)
            await execute(sql`DELETE FROM external_operations WHERE region_id=${id}`)
            await execute(sql`DELETE FROM route_snapshots WHERE region_id=${id}`)
            await execute(sql`DELETE FROM route_cache WHERE region_id=${id}`)
            await execute(sql`DELETE FROM preset_passages WHERE region_id=${id}`)
            await execute(sql`DELETE FROM session_contexts WHERE region_id=${id}`)
            await execute(sql`DELETE FROM regions WHERE id=${id}`)
          }
          await execute(sql`DELETE FROM anonymous_sessions WHERE owner_session_hash=${owner}`)
          for (const id of ownAdmins.slice().reverse()) await execute(sql`DELETE FROM admins WHERE id=${id}`)
        })
      } catch { cleanupFailed = true }
      try { await payload.destroy() } catch { cleanupFailed = true }
    }
  }
  if (cleanupFailed) throw new Error(JSON.stringify({ stage: 'cleanup', code: 'OWNED_FIXTURE_CLEANUP_FAILED', previousCheckFailed: !!failure }))
  if (failure) throw failure
})
