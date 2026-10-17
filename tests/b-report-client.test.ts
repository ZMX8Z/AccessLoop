import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, ensureSession, resetSession } from '../src/shared/client/api';
import * as api from '../src/features/hazards/client/api';
import type { CreateReportInput, PreviewDTO, PrivateReportDTO, PublicReportDTO } from '../src/shared/contracts/hazards';
import type { RegionDTO } from '../src/shared/contracts/region';

const passage = { presetPassageId: 'passage-1', passageVersion: 2 };
const geometry = { type: 'Polygon' as const, coordinates: [[[151.23, -33.917], [151.231, -33.917], [151.231, -33.918], [151.23, -33.917]]] as [number, number][][] };
const report: PrivateReportDTO = {
  id: 'report-1', regionId: 'region-1', rowVersion: 4, status: 'pending', publicRevision: null,
  photoId: 'photo-1', analysis: null, location: [151.23, -33.917], category: 'obstruction',
  description: 'A trolley blocks the path.', observedAt: '2030-01-01T00:00:00.000Z', passage,
  personalAvoidance: null, publicAvoidGeometry: null, publicVerification: null, publicActivity: 'inactive',
  createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z', isDemo: false,
};
const publicReport: PublicReportDTO = {
  id: 'public-report', regionId: 'region-1', publicRevision: 2, status: 'verified',
  location: [151.23, -33.917], category: 'obstruction', description: 'A barrier blocks the path.',
  observedAt: '2030-01-01T00:00:00.000Z', publicAvoidGeometry: geometry,
  publicVerification: { source: 'admin_field_check', verifiedAt: '2030-01-01T00:00:00.000Z', validUntil: '2030-01-02T00:00:00.000Z', resolvedAt: null },
  publicActivity: 'active', isDemo: false,
};
const preview: PreviewDTO = {
  expectedVersion: 4, observedAt: '2030-01-01T00:20:00.000Z', passage, configVersion: 3,
  avoidGeometry: geometry, validUntil: '2030-01-01T01:20:00.000Z',
  previewDigest: 'signed-renewal-preview', expiresAt: '2030-01-01T00:25:00.000Z',
};
const createInput: CreateReportInput = {
  photoId: 'photo-1', category: 'obstruction', description: 'A trolley blocks the path.',
  location: [151.23, -33.917], observedAt: '2030-01-01T00:00:00.000Z', passage,
};
const region: RegionDTO = {
  id: 'region-1', name: 'Test region', bbox: [151.22, -33.93, 151.24, -33.91], timezone: 'Australia/Sydney', isDemo: false,
  hazardVersion: 0, configVersion: 3, personalValiditySec: 3600, publicValiditySec: 86400, avoidanceBufferM: 2,
  routing: { profile: 'wheelchair', defaultRestrictions: { maximum_incline: 6, maximum_sloped_kerb: 0.03, minimum_width: 1 }, supportedRestrictions: { maximum_incline: [6], maximum_sloped_kerb: [0.03], minimum_width: [1] } },
};
const json = (data: unknown) => Response.json({ data, requestId: 'request-1' });
const failure = (status: number, code: string) => Response.json({ error: { code, message: 'Request refused.' }, requestId: 'failure-1' }, { status });
const sessionResponse = () => json({ ready: true, regionId: 'region-1', isDemo: false });

// These tests keep the real API client and session cache; only the HTTP boundary is replaced.
async function withFetch(run: () => Promise<void>, fetcher: typeof fetch) {
  const previous = globalThis.fetch;
  resetSession();
  globalThis.fetch = fetcher;
  try { await run(); } finally { globalThis.fetch = previous; resetSession(); }
}

// Regression: a supplied retry key must never be interpreted as useMock=true.
test('report writes expose 403 and 409 without returning a fabricated success', async () => {
  for (const [status, code] of [[403, 'FORBIDDEN'], [409, 'VERSION_CONFLICT']] as const) {
    await withFetch(async () => {
      await assert.rejects(api.createReport(createInput, 'stable-report-key'), error => error instanceof ApiError && error.code === code);
      await assert.rejects(api.confirmAvoidance('report-1', { expectedVersion: 4, observedAt: preview.observedAt, passage, previewDigest: preview.previewDigest, consent: true }, 'stable-confirm-key'), error => error instanceof ApiError && error.code === code);
    }, async () => failure(status, code));
  }
});

test('a repeated write retains the caller idempotency key and the exact payload', async () => {
  const attempts: { path: string; key: string | null; body: unknown }[] = [];
  await withFetch(async () => {
    assert.equal((await api.createReport(createInput, 'same-action-retry-key')).id, 'report-1');
    assert.equal((await api.createReport(createInput, 'same-action-retry-key')).id, 'report-1');
    assert.deepEqual(attempts, [
      { path: '/api/reports', key: 'same-action-retry-key', body: createInput },
      { path: '/api/reports', key: 'same-action-retry-key', body: createInput },
    ]);
  }, async (url, options) => {
    attempts.push({ path: String(url), key: new Headers(options?.headers).get('Idempotency-Key'), body: JSON.parse(String(options?.body)) });
    return json(report);
  });
});

test('renewal previews send the new observation without an idempotency key', async () => {
  await withFetch(async () => {
    const input = { expectedVersion: 4, observedAt: '2030-01-01T00:20:00.000Z', passage };
    assert.equal((await api.previewAvoidance('report/1', input)).previewDigest, 'signed-renewal-preview');
  }, async (url, options) => {
    assert.equal(String(url), '/api/reports/report%2F1/avoidance-preview');
    assert.equal(options?.method, 'POST');
    assert.equal(new Headers(options?.headers).has('Idempotency-Key'), false);
    assert.deepEqual(JSON.parse(String(options?.body)), { expectedVersion: 4, observedAt: '2030-01-01T00:20:00.000Z', passage: { presetPassageId: 'passage-1', passageVersion: 2 } });
    return json(preview);
  });
});

test('expired session errors reset the cache without replaying a write under a new identity', async () => {
  const paths: string[] = [];
  await withFetch(async () => {
    await ensureSession();
    await assert.rejects(api.createReport(createInput, 'identity-bound-key'), error => error instanceof ApiError && error.code === 'UNAUTHENTICATED');
    assert.deepEqual(paths, ['/api/session', '/api/reports']);
    await ensureSession();
    assert.deepEqual(paths, ['/api/session', '/api/reports', '/api/session']);
  }, async url => { paths.push(String(url)); return String(url) === '/api/session' ? sessionResponse() : failure(401, 'UNAUTHENTICATED'); });
});

test('upload initializes a session, retains multipart data and validates its DTO', async () => {
  const paths: string[] = [];
  await withFetch(async () => {
    const file = new File(['jpeg bytes'], 'photo.jpg', { type: 'image/jpeg' });
    const upload = await api.uploadPhoto(file, 'report', 'upload-action-key');
    assert.equal(upload.photoId, 'uploaded-photo');
    assert.deepEqual(paths, ['/api/session', '/api/uploads']);
  }, async (url, options) => {
    paths.push(String(url));
    if (String(url) === '/api/session') return sessionResponse();
    const form = options?.body;
    assert.ok(form instanceof FormData);
    assert.equal(form.get('purpose'), 'report');
    assert.equal((form.get('file') as File).name, 'photo.jpg');
    assert.equal(new Headers(options?.headers).get('Idempotency-Key'), 'upload-action-key');
    assert.equal(new Headers(options?.headers).has('Content-Type'), false);
    return json({ photoId: 'uploaded-photo', purpose: 'report', mime: 'image/jpeg', bytes: 10, width: 20, height: 30 });
  });
});

test('mine list creates a session while public list keeps its strict public DTO boundary', async () => {
  const paths: string[] = [];
  await withFetch(async () => {
    assert.equal((await api.fetchReports('public')).items[0].id, 'public-report');
    assert.equal((await api.fetchReports('mine')).items[0].id, 'report-1');
    assert.deepEqual(paths, ['/api/reports?scope=public', '/api/session', '/api/reports?scope=mine']);
    globalThis.fetch = async () => json({ items: [{ ...publicReport, photoId: 'private-photo' }], truncated: false });
    await assert.rejects(api.fetchReports('public'), error => error instanceof ApiError && error.code === 'INVALID_RESPONSE');
  }, async url => {
    paths.push(String(url));
    if (String(url) === '/api/session') return sessionResponse();
    return json({ items: String(url).endsWith('scope=mine') ? [report] : [publicReport], truncated: false });
  });
});

test('configuration loads current region and passages after session initialization', async () => {
  const paths: string[] = [];
  await withFetch(async () => {
    const result = await api.loadReportConfig();
    assert.equal(result.region.id, 'region-1');
    assert.deepEqual(result.passages, [{ id: 'passage-1', passageVersion: 2, name: 'East passage', geometry: { type: 'LineString', coordinates: [[151.23, -33.917], [151.231, -33.917]] }, isDemo: false }]);
    assert.equal(paths[0], '/api/session');
    assert.deepEqual(paths.slice(1).sort(), ['/api/passages', '/api/region']);
  }, async url => {
    paths.push(String(url));
    if (String(url) === '/api/session') return sessionResponse();
    if (String(url) === '/api/region') return json(region);
    return json({ configVersion: 3, items: [{ id: 'passage-1', passageVersion: 2, name: 'East passage', geometry: { type: 'LineString', coordinates: [[151.23, -33.917], [151.231, -33.917]] }, isDemo: false }] });
  });
});


test('analysis, patch and deactivation use the contract payloads and stable write keys', async () => {
  const calls: { path: string; method: string | undefined; body: unknown; key: string | null }[] = [];
  await withFetch(async () => {
    const result = await api.analyzePhoto('photo-1', 'analysis-key');
    assert.equal(result.analysisId, 'analysis-1');
    assert.equal((await api.patchReport('report-1', { expectedVersion: 4, description: 'Updated facts.' }, 'patch-key')).id, 'report-1');
    assert.equal((await api.deleteAvoidance('report-1', 4, 'delete-key')).id, 'report-1');
    assert.deepEqual(calls, [
      { path: '/api/analyze', method: 'POST', body: { photoId: 'photo-1', consent: true }, key: 'analysis-key' },
      { path: '/api/reports/report-1', method: 'PATCH', body: { expectedVersion: 4, description: 'Updated facts.' }, key: 'patch-key' },
      { path: '/api/reports/report-1/avoidance', method: 'DELETE', body: { expectedVersion: 4 }, key: 'delete-key' },
    ]);
  }, async (url, options) => {
    calls.push({ path: String(url), method: options?.method, body: JSON.parse(String(options?.body)), key: new Headers(options?.headers).get('Idempotency-Key') });
    return json(String(url) === '/api/analyze' ? completedAnalysis : report);
  });
});

test('report detail accepts the authorized DTO and rejects a fabricated partial record', async () => {
  await withFetch(async () => {
    assert.equal((await api.fetchReport('report-1')).id, 'report-1');
    globalThis.fetch = async () => json(publicReport);
    assert.equal((await api.fetchReport('public-report')).id, 'public-report');
    globalThis.fetch = async () => json({ id: 'made-up-report' });
    await assert.rejects(api.fetchReport('made-up-report'), error => error instanceof ApiError && error.code === 'INVALID_RESPONSE');
  }, async () => json(report));
});

test('configuration refuses a passage snapshot from a different config version', async () => {
  await withFetch(async () => {
    await assert.rejects(api.loadReportConfig(), error => error instanceof ApiError && error.code === 'CONFIG_CONFLICT');
  }, async url => String(url) === '/api/session' ? sessionResponse() : String(url) === '/api/region' ? json(region) : json({ configVersion: 4, items: [] }));
});

const uploadedPhoto = { photoId: 'photo-1', purpose: 'report' as const, mime: 'image/jpeg' as const, bytes: 10, width: 20, height: 30 };
const completedAnalysis = {
  analysisId: 'analysis-1', photoId: 'photo-1', aiStatus: 'completed' as const,
  result: { image_quality: 'usable' as const, hazard_present: true, category: 'construction' as const, visible_passage: 'blocked' as const, description: 'A barrier crosses the path.', evidence: ['A barrier spans the path.'], uncertainties: [] },
  unavailableReason: null, model: 'glm-4.6v-flash', promptVersion: '1', schemaVersion: '1', createdAt: '2030-01-01T00:00:00.000Z', cacheHit: false,
};
async function draftModule() {
  const stateModule = await import('../src/features/hazards/client/report-state');
  assert.ok(stateModule, 'The report draft must keep photo, analysis and user facts independently.');
  return stateModule;
}

test('a late analysis for the previous photo cannot associate with the replacement photo', async () => {
  const { draftReducer, initialDraft } = await draftModule();
  let draft = draftReducer(initialDraft, { type: 'photo', photo: uploadedPhoto });
  draft = draftReducer(draft, { type: 'photo', photo: { ...uploadedPhoto, photoId: 'photo-2' } });
  draft = draftReducer(draft, { type: 'analysis', analysis: completedAnalysis });
  assert.equal(draft.photo?.photoId, 'photo-2');
  assert.equal(draft.analysis, null);
  assert.equal(draft.analysisId, undefined);
});

test('receiving AI evidence preserves user facts until the user explicitly applies it', async () => {
  const { draftReducer, initialDraft } = await draftModule();
  let draft = draftReducer(initialDraft, { type: 'photo', photo: uploadedPhoto });
  draft = draftReducer(draft, { type: 'facts', category: 'surface_damage', description: 'I observed broken paving.' });
  draft = draftReducer(draft, { type: 'analysis', analysis: completedAnalysis });
  assert.equal(draft.description, 'I observed broken paving.');
  assert.equal(draft.category, 'surface_damage');
  assert.equal(draft.analysisId, 'analysis-1');
  draft = draftReducer(draft, { type: 'apply_analysis' });
  assert.equal(draft.description, 'A barrier crosses the path.');
  assert.equal(draft.category, 'construction');
});

test('manual reporting clears the analysis association while preserving visible evidence and facts', async () => {
  const { draftReducer, initialDraft } = await draftModule();
  let draft = draftReducer(initialDraft, { type: 'photo', photo: uploadedPhoto });
  draft = draftReducer(draft, { type: 'analysis', analysis: completedAnalysis });
  draft = draftReducer(draft, { type: 'facts', category: 'other', description: 'My own observation.' });
  draft = draftReducer(draft, { type: 'manual' });
  assert.equal(draft.analysisId, undefined);
  assert.equal(draft.analysis?.analysisId, 'analysis-1');
  assert.equal(draft.description, 'My own observation.');
  assert.equal(draft.edited, true);
});

test('changing photos clears old suggestions and associations but keeps facts the user edited', async () => {
  const { draftReducer, initialDraft } = await draftModule();
  let draft = draftReducer(initialDraft, { type: 'photo', photo: uploadedPhoto });
  draft = draftReducer(draft, { type: 'analysis', analysis: completedAnalysis });
  draft = draftReducer(draft, { type: 'apply_analysis' });
  draft = draftReducer(draft, { type: 'photo', photo: null });
  assert.equal(draft.description, '');
  assert.equal(draft.category, 'obstruction');
  assert.equal(draft.analysis, null);
  assert.equal(draft.analysisId, undefined);
  draft = draftReducer(draft, { type: 'facts', category: 'other', description: 'My retained observation.' });
  draft = draftReducer(draft, { type: 'photo', photo: uploadedPhoto });
  assert.equal(draft.description, 'My retained observation.');
  assert.equal(draft.category, 'other');
});

test('uncertain analysis remains evidence and cannot overwrite fact fields when applied', async () => {
  const { draftReducer, initialDraft } = await draftModule();
  let draft = draftReducer(initialDraft, { type: 'photo', photo: uploadedPhoto });
  draft = draftReducer(draft, { type: 'analysis', analysis: { ...completedAnalysis, aiStatus: 'uncertain', result: { ...completedAnalysis.result, category: 'uncertain', hazard_present: null, visible_passage: 'unknown' } } });
  draft = draftReducer(draft, { type: 'apply_analysis' });
  assert.equal(draft.category, 'obstruction');
  assert.equal(draft.description, '');
});

test('renewal confirmation binds the reviewed preview and requires a fresh explicit consent', async () => {
  const { confirmationInput } = await draftModule();
  const now = Date.parse('2030-01-01T00:21:00.000Z');
  assert.throws(() => confirmationInput(preview, false, now), error => error instanceof ApiError && error.code === 'CONFIRMATION_REQUIRED');
  assert.deepEqual(confirmationInput(preview, true, now), {
    expectedVersion: 4, observedAt: '2030-01-01T00:20:00.000Z',
    passage: { presetPassageId: 'passage-1', passageVersion: 2 }, previewDigest: 'signed-renewal-preview', consent: true,
  });
});

test('confirmation rejects missing previews and expiry at either deadline', async () => {
  const { confirmationInput } = await draftModule();
  const now = Date.parse('2030-01-01T00:25:00.000Z');
  for (const value of [null, preview, { ...preview, expiresAt: '2030-01-01T00:30:00.000Z', validUntil: '2030-01-01T00:25:00.000Z' }]) {
    assert.throws(() => confirmationInput(value, true, now), error => error instanceof ApiError && error.code === 'PREVIEW_STALE');
  }
});

test('personal effectiveness needs the server flag, active state, lifecycle, version and unexpired validity', async () => {
  const { isPersonalEffective } = await draftModule();
  const now = Date.parse('2030-01-01T00:21:00.000Z');
  const active = { ...report, personalAvoidance: { active: true, effective: true, passage, avoidGeometry: geometry, decisionSource: 'user_manual' as const, observedAt: preview.observedAt, confirmedAt: preview.observedAt, validUntil: preview.validUntil, confirmationReportVersion: 4 } };
  assert.equal(isPersonalEffective(active, now), true);
  for (const invalid of [
    report,
    { ...active, status: 'resolved' as const },
    { ...active, status: 'rejected' as const },
    { ...active, rowVersion: 5 },
    { ...active, personalAvoidance: { ...active.personalAvoidance, active: false } },
    { ...active, personalAvoidance: { ...active.personalAvoidance, effective: false } },
    { ...active, personalAvoidance: { ...active.personalAvoidance, validUntil: '2030-01-01T00:21:00.000Z' } },
  ]) assert.equal(isPersonalEffective(invalid, now), false);
});
