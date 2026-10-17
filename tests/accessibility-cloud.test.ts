import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccessibilityCloudAdapter } from '../src/server/providers/accessibility-cloud';
import { ProviderError } from '../src/server/providers/provider-error';
import { type BBox } from '../src/shared/contracts/common';
import { region, instant } from './routing-support';

const now = () => Date.parse(instant);
const bbox = region.bbox;
const token = 'synthetic-private-token';
const feature = (id = 'feature-7', sourceId = 'dataset-1', accessibility: unknown = { accessibleWith: { wheelchair: true } }) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [151.23, -33.92] },
  properties: { _id: id, sourceId, originalId: 'original-7', category: 'toilets', name: 'Test toilet', accessibility,
    address: 'Do not forward private address', contact: { email: 'private@example.test' } },
});
const collection = (features: unknown[]) => ({
  type: 'FeatureCollection', featureCount: features.length,
  related: {
    sources: { 'dataset-1': { _id: 'dataset-1', name: 'Campus facilities', licenseId: 'license-1', attribution: 'University data contributors' } },
    licenses: { 'license-1': { _id: 'license-1', name: 'CC BY 4.0', websiteURL: 'https://creativecommons.org/licenses/by/4.0/', privateNote: 'do not expose' } },
  }, features,
});
const adapter = (body: unknown) => createAccessibilityCloudAdapter({ appToken: token, licenseIds: ['license-1'], now, fetch: async () => Response.json(body) });

// Fails if configuration validation permits a request with a missing token or unreviewed license.
test('cloud fails closed for missing credentials or an empty/invalid license selection before HTTP', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json(collection([])); };
  for (const appToken of ['', '  ']) assert.throws(() => createAccessibilityCloudAdapter({ appToken, licenseIds: ['license-1'], fetch: fetcher }), { code: 'PROVIDER_UNAVAILABLE' });
  for (const licenseIds of [[], [''], ['license-1,license-2'], ['  ']]) {
    assert.throws(() => createAccessibilityCloudAdapter({ appToken: token, licenseIds, fetch: fetcher }), { code: 'PROVIDER_UNAVAILABLE' });
  }
  for (const timeoutMs of [0, Infinity, 8001]) assert.throws(() => createAccessibilityCloudAdapter({ appToken: token, licenseIds: ['license-1'], timeoutMs }), { code: 'PROVIDER_UNAVAILABLE' });
  assert.equal(calls, 0);
});

// Fails if the adapter sends an unbounded radius request, changes source identity or drops license credits.
test('cloud uses one official tile request and preserves dataset, license and boolean evidence', async () => {
  let calls = 0;
  const provider = createAccessibilityCloudAdapter({ appToken: token, licenseIds: ['license-1'], sourceIds: ['dataset-1'], now, fetch: async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, 'https://accessibility-cloud-v2.freetls.fastly.net/place-infos.json');
    assert.equal(url.searchParams.get('appToken'), token);
    assert.equal(url.searchParams.get('includeSourceIds'), 'dataset-1');
    assert.equal(url.searchParams.get('includeRelated'), 'source,source.license');
    assert.equal(url.searchParams.get('includePlacesWithoutAccessibility'), '1');
    assert.equal(url.searchParams.get('limit'), '101');
    assert.equal(url.searchParams.has('latitude'), false);
    assert.equal(url.searchParams.has('accuracy'), false);
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    return Response.json(collection([feature()]));
  } });
  const output = await provider.fetchPlaces(bbox, true);
  assert.equal(calls, 1);
  assert.equal(output.truncated, false);
  assert.equal(output.items.length, 1);
  const item = output.items[0];
  assert.match(item.id, /^ac-[a-f0-9]{64}$/);
  assert.deepEqual({ ...item, id: 'stable-id' }, {
    id: 'stable-id', sourceId: 'feature-7', source: 'accessibility.cloud', name: 'Test toilet', category: 'toilet',
    location: [151.23, -33.92], accessibility: 'yes', accessibilityNote: null, fetchedAt: instant, isDemo: true,
    rawAccessibility: { wheelchair: null, toiletWheelchair: null },
    sourceMetadata: { provider: 'accessibility.cloud', datasetId: 'dataset-1', datasetName: 'Campus facilities',
      originalId: 'original-7', licenseId: 'license-1', licenseName: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'University data contributors', rawWheelchair: { accessible: true, partiallyAccessible: null } },
  });
  assert.equal(JSON.stringify(output).includes('private'), false);
  assert.equal(JSON.stringify(output).includes('contact'), false);
});

// Fails if token permission or source/license configuration can reuse a less restricted provider cache.
test('cloud identities segregate token and source/license visibility without disclosing token', () => {
  const make = (options = {}) => createAccessibilityCloudAdapter({ appToken: token, licenseIds: ['license-1'], ...options });
  const first = make();
  assert.match(first.keyFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.identity.includes(token), false);
  assert.equal(first.keyFingerprint.includes(token), false);
  assert.equal(first.keyFingerprint, make({ sourceIds: ['dataset-1'], licenseIds: ['license-2'] }).keyFingerprint);
  assert.notEqual(first.identity, make({ appToken: 'other-token' }).identity);
  assert.notEqual(first.identity, make({ sourceIds: ['dataset-1'] }).identity);
  assert.notEqual(first.identity, make({ licenseIds: ['license-2'] }).identity);
  assert.equal(make({ sourceIds: ['z', 'a', 'z'], licenseIds: ['l2', 'l1'] }).identity, make({ sourceIds: ['a', 'z'], licenseIds: ['l1', 'l2'] }).identity);
});

// Fails if upstream ignores requested source filters or missing license metadata is treated as complete.
test('cloud checks configured sources and explicit licenses locally and marks omitted licenses incomplete', async () => {
  const body = collection([feature(), feature('hidden', 'hidden-dataset'), feature('missing', 'missing-dataset'), feature('unlicensed', 'unlicensed-dataset')]);
  Object.assign(body.related.sources, {
    'hidden-dataset': { name: 'Hidden dataset', licenseId: 'license-1' },
    'unlicensed-dataset': { name: 'Unapproved dataset', licenseId: 'license-2' },
  });
  const filtered = createAccessibilityCloudAdapter({ appToken: token, sourceIds: ['dataset-1'], licenseIds: ['license-1'], now, fetch: async () => Response.json(body) });
  const result = await filtered.fetchPlaces(bbox, true);
  assert.deepEqual(result.items.map((item) => item.sourceId), ['feature-7']);
  assert.equal(result.truncated, true);
  const tokenVisible = await adapter(body).fetchPlaces(bbox, false);
  assert.deepEqual(tokenVisible.items.map((item) => item.sourceId), ['feature-7', 'hidden']);
  assert.equal(tokenVisible.truncated, true);
  const noRelations = await adapter({ type: 'FeatureCollection', features: [feature()] }).fetchPlaces(bbox, true);
  assert.deepEqual(noRelations, { items: [], truncated: true });
});

// Fails if unknown or contradictory evidence becomes a positive wheelchair claim.
test('cloud normalizes boolean wheelchair evidence conservatively without manufacturing OSM tags', async () => {
  const cases: [unknown, unknown, string][] = [
    [true, undefined, 'yes'], [true, false, 'yes'], [false, true, 'limited'], [undefined, true, 'limited'],
    [false, false, 'no'], [false, undefined, 'no'], [true, true, 'unknown'], [undefined, false, 'unknown'],
    [undefined, undefined, 'unknown'], ['yes', undefined, 'unknown'], [null, null, 'unknown'],
  ];
  const features = cases.map(([accessible, partiallyAccessible], index) => feature(`f-${index}`, 'dataset-1', {
    accessibleWith: { wheelchair: accessible }, partiallyAccessibleWith: { wheelchair: partiallyAccessible },
  }));
  const result = await adapter(collection(features)).fetchPlaces(bbox, false);
  assert.deepEqual(result.items.map((item) => item.accessibility), cases.map((item) => item[2]));
  assert.ok(result.items.every((item) => item.rawAccessibility.wheelchair === null && item.rawAccessibility.toiletWheelchair === null));
  assert.deepEqual(result.items[9].sourceMetadata?.rawWheelchair, { accessible: null, partiallyAccessible: null });
});

// Fails if categories are guessed from a facility's name, rather than source category.
test('cloud maps known facility categories and keeps all others unknown', async () => {
  const categories = ['toilets', 'entrance', 'entrances', 'bench', 'shelter', 'rest_area', 'elevator', 'unknown'];
  const features = categories.map((category, index) => ({ ...feature(`f-${index}`), properties: { ...feature().properties, _id: `f-${index}`, category } }));
  const { items } = await adapter(collection(features)).fetchPlaces(bbox, false);
  assert.deepEqual(items.map((item) => item.category), ['toilet', 'entrance', 'entrance', 'rest_area', 'rest_area', 'rest_area', 'other', 'other']);
});

// Fails if a shared tile leaks points outside the application bbox or a raw cap is lost after filtering.
test('cloud bounds raw lookahead, deduplicates IDs and preserves truncation after regional filtering', async () => {
  const outside = { ...feature('outside'), geometry: { type: 'Point', coordinates: [0, 0] } };
  const small = await adapter(collection([feature(), feature(), outside])).fetchPlaces(bbox, true);
  assert.equal(small.items.length, 1);
  assert.equal(small.truncated, false);
  const capped = await adapter(collection([...Array.from({ length: 100 }, () => outside), feature()])).fetchPlaces(bbox, true);
  assert.equal(capped.items.length, 1);
  assert.equal(capped.truncated, true);
  const total = await adapter({ ...collection([feature()]), totalFeatureCount: 300 }).fetchPlaces(bbox, true);
  assert.equal(total.truncated, true);
  assert.deepEqual(await adapter(collection([])).fetchPlaces(bbox, true), { items: [], truncated: false });
});

// Fails if the query tile is calculated at an arbitrary fixed zoom and omits one edge of the bbox.
test('cloud chooses a single containing tile, handles tile boundaries and rejects polar bounds', async () => {
  const queries: string[] = [];
  const provider = createAccessibilityCloudAdapter({ appToken: token, licenseIds: ['license-1'], fetch: async (input) => {
    queries.push(String(input)); return Response.json(collection([]));
  } });
  for (const area of [
    [0.001, 0.001, 0.002, 0.002], [0, 0, 0.005, 0.005], [-0.001, -0.001, 0.001, 0.001], [-180, -85, 180, 85],
  ] as BBox[]) await provider.fetchPlaces(area, true);
  assert.deepEqual(queries.map((query) => {
    const url = new URL(query); return ['x', 'y', 'z'].map((key) => url.searchParams.get(key));
  }), [['32768', '32767', '16'], ['32768', '32767', '16'], ['0', '0', '0'], ['0', '0', '0']]);
  for (const area of [[1, 2, 0, 1], [0, 85, 1, 86], [0, -86, 1, -85]] as BBox[]) {
    await assert.rejects(provider.fetchPlaces(area, true), { code: 'INVALID_INPUT' });
  }
  assert.equal(queries.length, 4);
});

// Fails if provider garbage is silently dropped and a partial response is reported as successful.
test('cloud rejects malformed feature identities, coordinates, oversized pages and non-JSON data', async () => {
  for (const body of [
    {}, collection([{ ...feature(), geometry: { type: 'Point', coordinates: [151, 91] } }]),
    collection([{ ...feature(), properties: { ...feature().properties, _id: '' } }]),
    collection([{ ...feature(), properties: { ...feature().properties, sourceId: 42 } }]),
    collection([{ ...feature(), geometry: { type: 'LineString', coordinates: [[151, -33], [152, -33]] } }]),
    collection(Array.from({ length: 102 }, (_, index) => feature(`f-${index}`))),
  ]) await assert.rejects(adapter(body).fetchPlaces(bbox, true), { code: 'INVALID_PROVIDER_RESULT' });
  const invalid = createAccessibilityCloudAdapter({ appToken: token, licenseIds: ['license-1'], fetch: async () => new Response('{"features":NaN}') });
  await assert.rejects(invalid.fetchPlaces(bbox, true), { code: 'INVALID_PROVIDER_RESULT' });
});

// Fails if untrusted provider URL strings or a dataset identity collision reach the public DTO.
test('cloud keeps only safe license links and separates equal feature IDs from different datasets', async () => {
  const body = collection([feature(), feature('feature-7', 'dataset-2')]);
  Object.assign(body.related.sources, { 'dataset-2': { name: 'Other facilities', licenseId: 'license-1' } });
  body.related.licenses['license-1'].websiteURL = 'javascript:alert(1)';
  const { items } = await adapter(body).fetchPlaces(bbox, false);
  assert.equal(items.length, 2);
  assert.notEqual(items[0].id, items[1].id);
  assert.equal(items[0].sourceMetadata?.licenseUrl, null);
  assert.equal(items[0].id, (await adapter(collection([feature()])).fetchPlaces(bbox, false)).items[0].id);
});

test('cloud preserves actual HTTP license links while rejecting links with credentials', async () => {
  const body = collection([feature()]);
  body.related.licenses['license-1'].websiteURL = 'http://opendatacommons.org/licenses/odbl/1-0/';
  const first = await adapter(body).fetchPlaces(bbox, true);
  assert.equal(first.items[0].sourceMetadata?.licenseUrl, 'http://opendatacommons.org/licenses/odbl/1-0/');
  body.related.licenses['license-1'].websiteURL = 'https://user:password@example.test/license';
  const second = await adapter(body).fetchPlaces(bbox, true);
  assert.equal(second.items[0].sourceMetadata?.licenseUrl, null);
});

// Fails if the decoded stream exceeds the memory limit or redirects transmit credentials to another host.
test('cloud rejects redirects and oversized/interrupted response streams without exposing token', async () => {
  const responses = [
    new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }),
    new Response('{}', { headers: { 'Content-Length': '1048577' } }),
    new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(600000)); controller.enqueue(new Uint8Array(600000)); controller.close(); } })),
    new Response(new ReadableStream({ start(controller) { controller.error(new Error(`private-error-${token}`)); } })),
  ];
  for (const response of responses) {
    const provider = createAccessibilityCloudAdapter({ appToken: token, licenseIds: ['license-1'], fetch: async () => response });
    await assert.rejects(provider.fetchPlaces(bbox, true), (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(String(error).includes(token), false);
      assert.ok(['PROVIDER_UNAVAILABLE', 'INVALID_PROVIDER_RESULT'].includes(error.code));
      return true;
    });
  }
});

// Fails if a hanging fetch or decoded body can outlive the advertised total attempt timeout.
test('cloud aborts both a pending request and pending body at the total deadline', async () => {
  for (const pendingBody of [false, true]) {
    let signal: AbortSignal | undefined;
    const provider = createAccessibilityCloudAdapter({ appToken: token, licenseIds: ['license-1'], timeoutMs: 5, fetch: async (_url, init) => {
      signal = init?.signal ?? undefined;
      return pendingBody ? new Response(new ReadableStream()) : new Promise<Response>(() => {});
    } });
    await assert.rejects(provider.fetchPlaces(bbox, true), { code: 'PROVIDER_TIMEOUT', status: 504 });
    assert.equal(signal?.aborted, true);
  }
});

// Fails if upstream account privilege errors are called quota errors or retry loops bypass durable budgeting.
test('cloud classifies rate, auth, privilege, server and timeout errors as one safe attempt', async () => {
  for (const [status, code, retryable] of [
    [429, 'RATE_LIMITED', true], [401, 'PROVIDER_UNAVAILABLE', false], [402, 'PROVIDER_UNAVAILABLE', false],
    [403, 'PROVIDER_UNAVAILABLE', false], [500, 'PROVIDER_UNAVAILABLE', true], [408, 'PROVIDER_TIMEOUT', true], [504, 'PROVIDER_TIMEOUT', true],
  ] as const) {
    let calls = 0;
    const provider = createAccessibilityCloudAdapter({ appToken: token, licenseIds: ['license-1'], now, fetch: async () => {
      calls++; return new Response(`sensitive-url?appToken=${token}`, { status, headers: { 'Retry-After': '7' } });
    } });
    await assert.rejects(provider.fetchPlaces(bbox, true), (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, code);
      assert.equal(error.retryable, retryable);
      assert.equal(JSON.stringify(error).includes(token), false);
      if (status === 429) assert.equal(error.retryAfterSec, 7);
      return true;
    });
    assert.equal(calls, 1);
  }
});

// Fails if an abort-ignoring transport delivers a response after the caller has timed out and its body is leaked.
test('cloud cancels a response that arrives after the total deadline', async () => {
  let resolveFetch: ((response: Response) => void) | undefined;
  let cancelled = false;
  const provider = createAccessibilityCloudAdapter({ appToken: token, licenseIds: ['license-1'], timeoutMs: 5,
    fetch: () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
  });
  await assert.rejects(provider.fetchPlaces(bbox, true), { code: 'PROVIDER_TIMEOUT' });
  resolveFetch?.(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
});

// Fails if real ac-format multilingual names are rejected, or the selected display name depends on JSON insertion order.
test('cloud accepts localized facility names with English priority and a stable language fallback', async () => {
  const names = [
    { de: 'Deutscher Name', 'en-AU': 'Australian name', en: 'English name' },
    { de: 'Deutscher Name', 'en-AU': 'Australian name' },
    { fr: 'Nom français', de: 'Deutscher Name' },
    { de: 'Deutscher Name', fr: 'Nom français' },
    { en: '   ', 'en-AU': 'Australian name' },
    {}, null, undefined, 'Plain name',
  ];
  const body = collection(names.map((name, index) => ({
    ...feature(`name-${index}`), properties: { ...feature().properties, _id: `name-${index}`, name },
  })));
  const output = await adapter(body).fetchPlaces(bbox, true);
  assert.deepEqual(output.items.map((item) => item.name), [
    'English name', 'Australian name', 'Deutscher Name', 'Deutscher Name', 'Australian name',
    'Facility (name-5)', 'Facility (name-6)', 'Facility (name-7)', 'Plain name',
  ]);
});

// Fails if arbitrary objects become text, unbounded locale data is accepted, or control characters enter display labels.
test('cloud bounds localized names and returns plain labels with control characters removed', async () => {
  for (const name of [
    { en: { text: 'not a string' } }, { en: 42 }, { en: 'x'.repeat(2001) },
    { 'not a locale': 'bad' }, Array.from({ length: 2 }, () => 'bad'),
  ]) {
    const body = collection([{ ...feature(), properties: { ...feature().properties, name } }]);
    await assert.rejects(adapter(body).fetchPlaces(bbox, true), { code: 'INVALID_PROVIDER_RESULT' });
  }
  const body = collection([{ ...feature(), properties: { ...feature().properties, name: { en: '\u0000 <b>Facility</b>\n\t name \u202e' } } }]);
  const output = await adapter(body).fetchPlaces(bbox, true);
  // Markup remains an inert text string. Rendering/escaping stays with the consuming UI.
  assert.equal(output.items[0].name, '<b>Facility</b> name');
  const long = collection([{ ...feature(), properties: { ...feature().properties, name: { en: '🦽'.repeat(121) } } }]);
  assert.equal(Array.from((await adapter(long).fetchPlaces(bbox, true)).items[0].name).length, 60);
});
