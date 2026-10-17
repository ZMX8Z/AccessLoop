import assert from 'node:assert/strict'
import test from 'node:test'

import { renderReportExport } from '../src/features/hazards/server/export'
import { readBoundedBody, requireIdempotencyKey } from '../src/server/http/c1-request'
import { AppError } from '../src/server/http/errors'
import type { PrivateReportDTO, PublicReportDTO } from '../src/shared/contracts/hazards'

const report: PrivateReportDTO = {
  id: 'synthetic-report', regionId: 'synthetic-region', rowVersion: 1, status: 'pending', publicRevision: null,
  photoId: 'synthetic-private-photo', analysis: null, location: [0.1, 0.1], category: 'obstruction',
  description: '<script>alert("unsafe")</script>', observedAt: '2026-10-17T07:00:00.000Z',
  passage: null, personalAvoidance: null, publicAvoidGeometry: null, publicVerification: null,
  publicActivity: 'inactive', createdAt: '2026-10-17T07:00:00.000Z', updatedAt: '2026-10-17T07:00:00.000Z', isDemo: true,
}

test('private HTML export escapes facts and uses only the authorized photo endpoint', async () => {
  const response = renderReportExport(report)
  const body = await response.text()
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /script-src 'nonce-/)
  assert.ok(response.headers.has('X-Request-Id'))
  assert.match(body, /&lt;script&gt;/)
  assert.doesNotMatch(body, /<script>alert/)
  assert.match(body, /\/api\/photos\/synthetic-private-photo/)
  assert.match(body, /Manual observation/)
  assert.doesNotMatch(body, /Hazard Certificate/)
})

test('public HTML export contains no private photo or AI fields', async () => {
  const publicReport: PublicReportDTO = {
    id: report.id, regionId: report.regionId, publicRevision: 1, status: 'verified',
    location: report.location, category: report.category, description: report.description,
    observedAt: report.observedAt,
    publicAvoidGeometry: { type: 'Polygon', coordinates: [[[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.1]]] },
    publicVerification: { source: 'admin_field_check', verifiedAt: report.observedAt, validUntil: '2026-10-18T07:00:00.000Z', resolvedAt: null },
    publicActivity: 'active', isDemo: true,
  }
  const body = await renderReportExport(publicReport).text()
  assert.doesNotMatch(body, /\/api\/photos\/|AI Analysis Model|synthetic-private-photo|Personal Avoidance Status/)
  assert.match(body, /admin_field_check/)
})

test('HTTP bodies enforce actual byte limits even without a Content-Length header', async () => {
  await assert.rejects(readBoundedBody(new Request('http://localhost/api/uploads', { method: 'POST', body: '12345' }), 4),
    (error) => error instanceof AppError && error.code === 'FILE_TOO_LARGE')
  assert.equal((await readBoundedBody(new Request('http://localhost/api/uploads', { method: 'POST', body: '1234' }), 4)).toString(), '1234')
  assert.throws(() => requireIdempotencyKey(new Request('http://localhost/api/uploads')),
    (error) => error instanceof AppError && error.code === 'INVALID_INPUT')
})
