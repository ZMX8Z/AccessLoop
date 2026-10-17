import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import type { Payload } from 'payload'
import sharp from 'sharp'
import { z } from 'zod'

import { readSessionCredential, sessionOwnerHash } from '../src/server/auth/session-cookie'
import { processReportImage } from '../src/server/photos/image'
import { PhotoRecordSchema } from '../src/server/photos/service'
import { fingerprint } from '../src/server/storage/value'
import { IdSchema } from '../src/shared/contracts/common'
import { PreviewDTOSchema, PrivateReportDTOSchema, PublicReportDTOSchema } from '../src/shared/contracts/hazards'
import { UploadDTOSchema } from '../src/shared/contracts/photos'
import { PresetPassageSchema, RegionSchema, RoutingContextSchema, type RoutingContextDTO } from '../src/shared/contracts/region'
import { SessionDataSchema } from '../src/shared/contracts/session'

const ErrorEnvelopeSchema = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string(), details: z.unknown().optional() }), requestId: IdSchema,
})
const PassageListSchema = z.strictObject({ configVersion: z.number().int().positive(), items: z.array(PresetPassageSchema).min(1) })
const PrivateListSchema = z.strictObject({ items: z.array(PrivateReportDTOSchema), truncated: z.boolean() })
const PublicListSchema = z.strictObject({ items: z.array(PublicReportDTOSchema), truncated: z.boolean() })

class CheckFailed extends Error {
  constructor(readonly checkId: string) { super(checkId) }
}
function check(condition: unknown, checkId: string): asserts condition {
  if (!condition) throw new CheckFailed(checkId)
}
const digest = (input: Buffer | string) => createHash('sha256').update(input).digest('hex')
const contextBinding = (value: RoutingContextDTO) => ({
  regionId: value.regionId, hazardVersion: value.hazardVersion, personalVersion: value.personalVersion,
  configVersion: value.configVersion, activeDigest: value.activeDigest, nextExpiryAt: value.nextExpiryAt,
})

test('C1 local HTTP and real private OSS support the complete manual report lifecycle', {
  skip: process.env.ACCESSLOOP_C1_HTTP_TESTS !== '1', timeout: 240_000,
}, async (t) => {
  const target = new URL(process.env.APP_BASE_URL ?? '')
  check(['localhost', '127.0.0.1'].includes(target.hostname), 'local_target_required')
  check(['http:', 'https:'].includes(target.protocol) && !target.username && !target.password, 'local_http_target_required')
  check(target.pathname === '/' && !target.search && !target.hash, 'application_origin_required')
  check(process.env.APP_MODE === 'demo', 'demo_mode_required')
  const base = target.origin
  const run = `c1-http-${randomUUID()}`
  const photoIds = new Set<string>()
  const reportIds = new Set<string>()
  const uploadOperations = new Set<string>()
  const commandOperations = new Set<string>()
  let payload: Payload | undefined
  let regionId: string | undefined
  let ownerA: string | undefined
  let stage = 'initialize'
  let last = { httpStatus: 0, code: '', requestId: '' }
  let failure: Error | undefined
  let cleanupFailed = false
  const enter = (name: string) => { stage = name; t.diagnostic(name) }
  const request = async (path: string, init: RequestInit = {}) => {
    last = { httpStatus: 0, code: '', requestId: '' }
    const response = await fetch(`${base}${path}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(30_000) })
    last = { httpStatus: response.status, code: '', requestId: response.headers.get('X-Request-Id') ?? '' }
    return response
  }
  async function success<T>(response: Response, schema: z.ZodType<T>, status = 200): Promise<T> {
    const body: unknown = await response.json()
    const error = ErrorEnvelopeSchema.safeParse(body)
    if (error.success) last.code = error.data.error.code
    check(response.status === status, 'success_http_status')
    const parsed = z.strictObject({ data: schema, requestId: IdSchema }).safeParse(body)
    check(parsed.success, 'success_response_schema')
    check(parsed.data.requestId === response.headers.get('X-Request-Id'), 'success_request_id')
    check(response.headers.get('Cache-Control')?.includes('no-store'), 'success_private_cache')
    return parsed.data.data
  }
  async function expectError(response: Response, status: number, code: string) {
    const parsed = ErrorEnvelopeSchema.safeParse(await response.json())
    if (parsed.success) last.code = parsed.data.error.code
    check(response.status === status, 'error_http_status')
    check(parsed.success, 'error_response_schema')
    check(parsed.data.error.code === code, 'error_code')
    check(parsed.data.requestId === response.headers.get('X-Request-Id'), 'error_request_id')
    check(response.headers.get('Cache-Control')?.includes('no-store'), 'error_private_cache')
  }
  const jsonHeaders = (cookie?: string) => ({ Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) })
  const routingContext = async (cookie: string) => success(await request('/api/routing-context', { headers: { Cookie: cookie } }), RoutingContextSchema)
  const sameContext = (a: RoutingContextDTO, b: RoutingContextDTO, label: string) => check(JSON.stringify(contextBinding(a)) === JSON.stringify(contextBinding(b)), label)

  try {
    enter('sessions_and_persisted_synthetic_region')
    const { getPayload } = await import('payload')
    const { default: config } = await import('../src/payload.config')
    payload = await getPayload({ config })
    const first = await request('/api/session', { method: 'POST', headers: jsonHeaders(), body: '{}' })
    const a = await success(first, SessionDataSchema)
    const cookieA = first.headers.get('Set-Cookie')?.split(';')[0]
    check(cookieA, 'session_a_cookie')
    const second = await request('/api/session', { method: 'POST', headers: jsonHeaders(), body: '{}' })
    const b = await success(second, SessionDataSchema)
    const cookieB = second.headers.get('Set-Cookie')?.split(';')[0]
    check(cookieB && cookieB !== cookieA, 'independent_session_b_cookie')
    check(a.regionId === b.regionId && a.isDemo && b.isDemo, 'sessions_demo_region')
    const credential = readSessionCredential(cookieA, process.env.SESSION_SECRET ?? '')
    check(credential, 'local_session_secret_matches_server')
    ownerA = sessionOwnerHash(credential)
    const region = await success(await request('/api/region'), RegionSchema)
    regionId = region.id
    check(region.id === a.regionId && region.id === process.env.REGION_ID && region.isDemo, 'configured_demo_region')
    const storedRegion = await payload.findByID({ collection: 'regions', id: region.id, overrideAccess: true })
    check(z.object({ kind: z.literal('synthetic') }).safeParse(storedRegion.seedSource).success, 'synthetic_region_only')
    const passages = await success(await request('/api/passages'), PassageListSchema)
    check(passages.configVersion === region.configVersion, 'passage_configuration_version')
    const passage = passages.items[0]
    check(passage.isDemo, 'synthetic_passage_only')
    const passageRef = { presetPassageId: passage.id, passageVersion: passage.passageVersion }
    const baselineA = await routingContext(cookieA)
    const baselineB = await routingContext(cookieB)

    enter('real_oss_upload_replay_and_content_conflict')
    const original = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#46785a' } }).jpeg().toBuffer()
    const changed = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#885a42' } }).jpeg().toBuffer()
    const processed = await processReportImage(original, 'image/jpeg')
    const uploadKey = `${run}-upload`
    const uploadOperation = fingerprint({ regionId, subject: { kind: 'anonymous', ownerSessionHash: ownerA }, purpose: 'report', method: 'POST', path: '/api/uploads', key: uploadKey })
    uploadOperations.add(uploadOperation)
    const upload = async (bytes: Buffer) => {
      const form = new FormData()
      form.set('file', new File([new Uint8Array(bytes)], 'synthetic-c1-check.jpg', { type: 'image/jpeg' }))
      return request('/api/uploads', { method: 'POST', headers: { Origin: base, Cookie: cookieA, 'Idempotency-Key': uploadKey }, body: form })
    }
    const uploaded = await success(await upload(original), UploadDTOSchema, 201)
    photoIds.add(uploaded.photoId)
    const metadata = PhotoRecordSchema.parse(await payload.findByID({ collection: 'photos', id: uploaded.photoId, overrideAccess: true }))
    check(metadata.regionId === regionId && metadata.ownerSessionHash === ownerA, 'new_photo_database_ownership')
    check(metadata.imageHash === processed.imageHash && metadata.uploadState === 'ready', 'new_photo_sanitized_hash')
    const countBeforeReplay = (await payload.count({ collection: 'photos', where: { and: [{ regionId: { equals: regionId } }, { ownerSessionHash: { equals: ownerA } }] }, overrideAccess: true })).totalDocs
    const replayed = await success(await upload(original), UploadDTOSchema, 201)
    check(JSON.stringify(uploaded) === JSON.stringify(replayed), 'upload_replay_same_dto')
    const replayMetadata = PhotoRecordSchema.parse(await payload.findByID({ collection: 'photos', id: uploaded.photoId, overrideAccess: true }))
    check(replayMetadata.filename === metadata.filename && replayMetadata.prefix === metadata.prefix, 'upload_replay_same_object_path')
    check((await payload.count({ collection: 'photos', where: { and: [{ regionId: { equals: regionId } }, { ownerSessionHash: { equals: ownerA } }] }, overrideAccess: true })).totalDocs === countBeforeReplay, 'upload_replay_no_new_photo')
    await expectError(await upload(changed), 409, 'IDEMPOTENCY_CONFLICT')

    enter('photo_read_ownership_and_native_cms_bypasses')
    const photoPath = `/api/photos/${encodeURIComponent(uploaded.photoId)}`
    const photoResponse = await request(photoPath, { headers: { Cookie: cookieA } })
    check(photoResponse.status === 200, 'authorized_photo_http_status')
    check(photoResponse.headers.get('Content-Type') === uploaded.mime, 'authorized_photo_mime')
    check(photoResponse.headers.get('Cache-Control')?.includes('no-store') && photoResponse.headers.get('X-Content-Type-Options') === 'nosniff', 'authorized_photo_private_headers')
    check(photoResponse.headers.get('Location') === null && !!photoResponse.headers.get('X-Request-Id'), 'authorized_photo_proxy_headers')
    check(`sha256:${digest(Buffer.from(await photoResponse.arrayBuffer()))}` === processed.imageHash, 'authorized_photo_bytes_hash')
    await expectError(await request(photoPath, { headers: { Cookie: cookieB } }), 404, 'NOT_FOUND')
    await expectError(await request(photoPath), 404, 'NOT_FOUND')
    for (const [path, method] of [
      ['/cms-api/photos', 'GET'], [`/cms-api/photos/${encodeURIComponent(uploaded.photoId)}?depth=5`, 'GET'],
      [`/cms-api/photos/file/${encodeURIComponent(metadata.filename)}`, 'GET'],
      ['/cms-api/photos', 'POST'], [`/cms-api/photos/${encodeURIComponent(uploaded.photoId)}`, 'PATCH'],
      [`/cms-api/photos/${encodeURIComponent(uploaded.photoId)}`, 'DELETE'],
    ]) {
      const response = await request(path, {
        method, headers: jsonHeaders(cookieA),
        ...(method === 'POST' || method === 'PATCH' ? { body: JSON.stringify({ context: { internalPhotoWrite: true, internalPhotoRead: true }, uploadState: 'ready' }) } : {}),
      })
      check([403, 404, 501].includes(response.status), 'native_photo_access_rejected')
      await response.body?.cancel()
    }

    const command = async (path: string, method: 'POST' | 'PATCH' | 'DELETE', key: string, body: unknown) => {
      commandOperations.add(fingerprint({ subject: ownerA, method, path, key, purpose: `region:${regionId}` }))
      return request(path, { method, headers: { ...jsonHeaders(cookieA), 'Idempotency-Key': key }, body: JSON.stringify(body) })
    }
    enter('manual_report_creation_and_public_private_lists')
    const description = 'Synthetic test <img src=x onerror="alert(1)"> & no real observation.'
    const facts = { photoId: uploaded.photoId, location: passage.geometry.coordinates[0], category: 'construction', description, observedAt: new Date().toISOString(), passage: passageRef }
    const created = await success(await command('/api/reports', 'POST', `${run}-create`, facts), PrivateReportDTOSchema, 201)
    reportIds.add(created.id)
    check(created.rowVersion === 1 && created.status === 'pending' && created.analysis === null && created.personalAvoidance === null && created.publicRevision === null, 'manual_report_initial_state')
    const reportPath = `/api/reports/${encodeURIComponent(created.id)}`
    const publicList = await success(await request('/api/reports'), PublicListSchema)
    check(!publicList.items.some((item) => item.id === created.id), 'unpublished_report_absent_from_public')
    const mineA = await success(await request('/api/reports?scope=mine', { headers: { Cookie: cookieA } }), PrivateListSchema)
    const mineB = await success(await request('/api/reports?scope=mine', { headers: { Cookie: cookieB } }), PrivateListSchema)
    check(mineA.items.some((item) => item.id === created.id) && !mineB.items.some((item) => item.id === created.id), 'mine_report_session_isolation')
    await success(await request(reportPath, { headers: { Cookie: cookieA } }), PrivateReportDTOSchema)
    await expectError(await request(reportPath, { headers: { Cookie: cookieB } }), 404, 'NOT_FOUND')
    await expectError(await request(reportPath), 404, 'NOT_FOUND')
    const beforePreviewA = await routingContext(cookieA)
    check(beforePreviewA.personalVersion === baselineA.personalVersion + 1 && beforePreviewA.hazardVersion === baselineA.hazardVersion, 'creation_changes_only_personal_version')
    sameContext(await routingContext(cookieB), baselineB, 'creation_leaves_other_session_unchanged')

    enter('preview_requires_explicit_consent_and_preserves_context')
    const previewInput = { expectedVersion: created.rowVersion, observedAt: new Date().toISOString(), passage: passageRef }
    const preview = await success(await request(`${reportPath}/avoidance-preview`, { method: 'POST', headers: jsonHeaders(cookieA), body: JSON.stringify(previewInput) }), PreviewDTOSchema)
    check(preview.configVersion === region.configVersion && Date.parse(preview.expiresAt) > Date.now(), 'live_preview')
    sameContext(await routingContext(cookieA), beforePreviewA, 'preview_does_not_write_context')
    const confirmKey = `${run}-confirm`
    await expectError(await command(`${reportPath}/avoidance`, 'POST', `${run}-no-consent`, { ...previewInput, previewDigest: preview.previewDigest, consent: false }), 422, 'CONFIRMATION_REQUIRED')
    await expectError(await command(`${reportPath}/avoidance`, 'POST', `${run}-missing-preview`, { ...previewInput, consent: true }), 409, 'PREVIEW_STALE')
    sameContext(await routingContext(cookieA), beforePreviewA, 'rejected_confirmations_do_not_write_context')
    const confirmInput = { ...previewInput, previewDigest: preview.previewDigest, consent: true }
    const confirmed = await success(await command(`${reportPath}/avoidance`, 'POST', confirmKey, confirmInput), PrivateReportDTOSchema)
    check(confirmed.rowVersion === created.rowVersion + 1 && confirmed.personalAvoidance?.active && confirmed.personalAvoidance.effective, 'explicit_personal_confirmation')
    check(confirmed.personalAvoidance.confirmationReportVersion === confirmed.rowVersion, 'confirmation_binds_committed_version')
    const confirmedA = await routingContext(cookieA)
    check(confirmedA.personalVersion === beforePreviewA.personalVersion + 1 && confirmedA.activeDigest !== beforePreviewA.activeDigest && confirmedA.hazardVersion === baselineA.hazardVersion, 'confirmation_changes_personal_effective_set')
    sameContext(await routingContext(cookieB), baselineB, 'confirmation_leaves_other_session_unchanged')
    const replay = await success(await command(`${reportPath}/avoidance`, 'POST', confirmKey, confirmInput), PrivateReportDTOSchema)
    check(digest(JSON.stringify(replay)) === digest(JSON.stringify(confirmed)), 'confirmation_replays_original_result')
    sameContext(await routingContext(cookieA), confirmedA, 'confirmation_replay_does_not_increment_version')
    await expectError(await command(reportPath, 'PATCH', `${run}-stale-version`, { expectedVersion: created.rowVersion, description: 'Stale synthetic edit.' }), 409, 'VERSION_CONFLICT')

    enter('authorized_export_escapes_html_and_keeps_photos_private')
    const exported = await request(`${reportPath}/export`, { headers: { Cookie: cookieA } })
    check(exported.status === 200 && exported.headers.get('Content-Type')?.startsWith('text/html'), 'export_html_response')
    check(exported.headers.get('Cache-Control')?.includes('no-store') && !!exported.headers.get('X-Request-Id'), 'export_private_headers')
    const csp = exported.headers.get('Content-Security-Policy') ?? ''
    check(csp.includes("default-src 'none'") && csp.includes("script-src 'nonce-") && csp.includes("img-src 'self'") && csp.includes("frame-ancestors 'none'"), 'export_content_security_policy')
    const html = await exported.text()
    check(!html.includes('<img src=x onerror=') && html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp;'), 'export_escapes_user_text')
    check(html.includes(`src="${photoPath}"`) && !html.includes('.aliyuncs.com'), 'export_uses_authorized_photo_entry')
    await expectError(await request(`${reportPath}/export`, { headers: { Cookie: cookieB } }), 404, 'NOT_FOUND')

    enter('fact_correction_preserves_binding_and_deactivation_removes_personal_effect')
    const patched = await success(await command(reportPath, 'PATCH', `${run}-description`, { expectedVersion: confirmed.rowVersion, description: 'Corrected synthetic description.' }), PrivateReportDTOSchema)
    check(patched.personalAvoidance?.active && patched.personalAvoidance.effective && patched.personalAvoidance.confirmationReportVersion === patched.rowVersion, 'description_edit_preserves_confirmation_binding')
    sameContext(await routingContext(cookieB), baselineB, 'correction_leaves_other_session_unchanged')
    const disabled = await success(await command(`${reportPath}/avoidance`, 'DELETE', `${run}-deactivate`, { expectedVersion: patched.rowVersion }), PrivateReportDTOSchema)
    check(disabled.personalAvoidance?.active === false && disabled.personalAvoidance.effective === false, 'deactivation_clears_personal_effect')
    const disabledA = await routingContext(cookieA)
    check(disabledA.hazardVersion === baselineA.hazardVersion && disabledA.activeDigest === baselineA.activeDigest && disabledA.nextExpiryAt === baselineA.nextExpiryAt, 'deactivation_restores_original_effective_geometry')
    sameContext(await routingContext(cookieB), baselineB, 'deactivation_leaves_other_session_unchanged')
    check(!(await success(await request('/api/reports'), PublicListSchema)).items.some((item) => item.id === created.id), 'private_changes_never_publish_report')
    if (process.env.ACCESSLOOP_PRODUCTION_HTTP === '1') {
      enter('production_hides_development_demonstrations')
      for (const path of ['/c0-demo', '/c1-demo']) {
        const response = await request(path)
        check(response.status === 404, 'production_demo_page_not_found')
        await response.body?.cancel()
      }
    }
  } catch (error) {
    failure = new Error(JSON.stringify({ stage, check: error instanceof CheckFailed ? error.checkId : 'operation_failed', ...last }))
  } finally {
    enter('cleanup_only_this_test_run')
    if (payload && regionId && ownerA) {
      try {
        for (const id of uploadOperations) {
          const { docs } = await payload.find({ collection: 'photo-upload-operations', where: { id: { equals: id } }, overrideAccess: true, limit: 1 })
          if (docs[0]) photoIds.add(docs[0].photoId)
        }
        for (const id of commandOperations) {
          const { docs } = await payload.find({ collection: 'idempotency-records', where: { id: { equals: id } }, overrideAccess: true, limit: 1 })
          const result = PrivateReportDTOSchema.safeParse(docs[0]?.result)
          if (result.success && result.data.regionId === regionId && photoIds.has(result.data.photoId)) reportIds.add(result.data.id)
        }
        for (const id of reportIds) {
          const { docs } = await payload.find({ collection: 'hazard-reports', where: { and: [{ id: { equals: id } }, { regionId: { equals: regionId } }, { ownerSessionHash: { equals: ownerA } }] }, limit: 1, overrideAccess: true })
          if (!docs[0]) continue
          for (const collection of ['personal-avoidances', 'report-events'] as const) await payload.delete({ collection, where: { reportId: { equals: id } }, overrideAccess: true })
          await payload.delete({ collection: 'hazard-reports', id, overrideAccess: true })
        }
        for (const id of photoIds) {
          const { docs } = await payload.find({ collection: 'photos', where: { and: [{ id: { equals: id } }, { regionId: { equals: regionId } }, { ownerSessionHash: { equals: ownerA } }] }, limit: 1, overrideAccess: true })
          if (docs[0]) await payload.delete({ collection: 'photos', id, overrideAccess: true, disableTransaction: true, context: { internalPhotoWrite: true } })
        }
        for (const id of uploadOperations) await payload.delete({ collection: 'photo-upload-operations', where: { id: { equals: id } }, overrideAccess: true })
        for (const id of commandOperations) await payload.delete({ collection: 'idempotency-records', where: { id: { equals: id } }, overrideAccess: true })
      } catch { cleanupFailed = true }
    }
    if (payload) {
      try { await payload.destroy() } catch { cleanupFailed = true }
    }
  }
  if (failure) throw failure
  check(!cleanupFailed, 'test_fixture_cleanup_failed')
})
