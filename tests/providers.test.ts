import assert from 'node:assert/strict';
import test from 'node:test';

import { createGeocodingAdapter } from '../src/server/providers/geocoding';
import { createOrsAdapter } from '../src/server/providers/ors';
import { ProviderError } from '../src/server/providers/provider-error';
import type { BBox } from '../src/shared/contracts/common';
import type { AvoidGeometry } from '../src/shared/contracts/geo';
import type { RouteInput } from '../src/shared/contracts/routing';

// Synthetic provider payloads; no live routes or field observations are asserted.
const routeInput: RouteInput = {
  start: [151.229, -33.917], end: [151.233, -33.918], profile: 'wheelchair',
  restrictions: { maximum_incline: 6, maximum_sloped_kerb: 0.06, minimum_width: 0.9 },
};
const bbox: BBox = [151.22, -33.93, 151.24, -33.91];
const avoid: AvoidGeometry = {
  type: 'Polygon',
  coordinates: [[[151.23, -33.917], [151.231, -33.917], [151.231, -33.918], [151.23, -33.917]]],
};
const routePayload = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.229, -33.917], [151.233, -33.918]] },
    properties: { summary: { distance: 680, duration: 620 }, segments: [], way_points: [0, 1] },
  }],
  metadata: { attribution: 'Synthetic provider example' },
};
function point(id: number, location = [151.23, -33.92], source = 'openstreetmap') {
  return {
    type: 'Feature', geometry: { type: 'Point', coordinates: location },
    properties: { gid: `${source}:venue:${id}`, source, layer: 'venue', source_id: String(id), name: `Place ${id}`, label: `Place ${id}, Kensington` },
  };
}
function jsonFetch(body: unknown, status = 200, headers: HeadersInit = {}): typeof fetch {
  return async () => Response.json(body, { status, headers });
}
function expectError(code: string, status: number, retryable: boolean) {
  return (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.equal(error.retryable, retryable);
    return true;
  };
}

test('ORS sends unchanged endpoints and all wheelchair restrictions to the official GeoJSON endpoint', async () => {
  let requests = 0;
  const adapter = createOrsAdapter({ apiKey: 'server-secret', fetch: async (url, options) => {
    requests += 1;
    assert.equal(String(url), 'https://api.heigit.org/openrouteservice/v2/directions/wheelchair/geojson');
    assert.equal(options?.method, 'POST');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.cache, 'no-store');
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('Authorization'), 'server-secret');
    assert.match(headers.get('Accept') ?? '', /application\/geo\+json/);
    assert.deepEqual(JSON.parse(String(options?.body)), {
      coordinates: [[151.229, -33.917], [151.233, -33.918]],
      instructions: false, elevation: false, units: 'm',
      options: { profile_params: { restrictions: { maximum_incline: 6, maximum_sloped_kerb: 0.06, minimum_width: 0.9 } }, avoid_polygons: avoid },
    });
    return Response.json(routePayload);
  } });
  assert.deepEqual(await adapter.directions(routeInput, avoid), {
    geometry: { type: 'LineString', coordinates: [[151.229, -33.917], [151.233, -33.918]] }, distanceM: 680, durationS: 620,
  });
  assert.equal(requests, 1);
  assert.ok(!adapter.identity.includes('server-secret'));
  assert.match(adapter.keyFingerprint, /^sha256:[0-9a-f]{64}$/);
});

test('ORS omits avoid_polygons when there is no avoidance', async () => {
  const adapter = createOrsAdapter({ apiKey: 'key', fetch: async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal('avoid_polygons' in body.options, false);
    return Response.json(routePayload);
  } });
  await adapter.directions(routeInput);
});

test('provider configuration rejects arbitrary hosts, paths, credentials, query strings and non-HTTPS URLs before fetching', () => {
  for (const create of [createOrsAdapter, createGeocodingAdapter]) {
    for (const baseUrl of ['http://api.heigit.org', 'https://evil.example', 'https://api.heigit.org/other', 'https://api.heigit.org.evil.example/openrouteservice', 'https://secret@api.heigit.org/openrouteservice', 'https://api.heigit.org/openrouteservice?key=x']) {
      assert.throws(() => create({ apiKey: 'key', baseUrl }), expectError('PROVIDER_UNAVAILABLE', 503, false));
    }
  }
});

test('missing keys fail only the requested capability without making an external call', async () => {
  const failFetch: typeof fetch = async () => assert.fail('A key is required before fetching.');
  await assert.rejects(createOrsAdapter({ apiKey: '', fetch: failFetch }).directions(routeInput), expectError('PROVIDER_UNAVAILABLE', 503, false));
  await assert.rejects(createGeocodingAdapter({ apiKey: '  ', fetch: failFetch }).search('Library', bbox), expectError('PROVIDER_UNAVAILABLE', 503, false));
});

test('ORS rejects zero or multiple routes, malformed LineStrings and invalid summaries', async () => {
  const invalid = [
    { ...routePayload, features: [] },
    { ...routePayload, features: [...routePayload.features, ...routePayload.features] },
    { ...routePayload, features: [{ ...routePayload.features[0], geometry: { type: 'MultiLineString', coordinates: [[[151.229, -33.917], [151.233, -33.918]]] } }] },
    { ...routePayload, features: [{ ...routePayload.features[0], geometry: { type: 'LineString', coordinates: [[151.229, -33.917]] } }] },
    { ...routePayload, features: [{ ...routePayload.features[0], geometry: { type: 'LineString', coordinates: [[181, 0], [151.233, -33.918]] } }] },
    { ...routePayload, features: [{ ...routePayload.features[0], properties: { summary: { distance: -1, duration: 620 } } }] },
    { ...routePayload, features: [{ ...routePayload.features[0], properties: { summary: { distance: 680, duration: null } } }] },
  ];
  for (const body of invalid) {
    await assert.rejects(createOrsAdapter({ apiKey: 'key', fetch: jsonFetch(body) }).directions(routeInput), expectError('INVALID_PROVIDER_RESULT', 502, false));
  }
  const infinite = JSON.stringify(routePayload).replace('"duration":620', '"duration":1e999');
  await assert.rejects(createOrsAdapter({ apiKey: 'key', fetch: async () => new Response(infinite) }).directions(routeInput), expectError('INVALID_PROVIDER_RESULT', 502, false));
});

test('both providers distinguish quota exhaustion from authentication and server failures without leaking upstream details or retrying', async () => {
  const cases = [
    { status: 403, body: { error: 'Quota exceeded' }, code: 'QUOTA_EXHAUSTED', wantStatus: 503, retryable: false },
    { status: 401, body: { error: 'private server-secret' }, code: 'PROVIDER_UNAVAILABLE', wantStatus: 503, retryable: false },
    { status: 403, body: { error: 'private server-secret' }, code: 'PROVIDER_UNAVAILABLE', wantStatus: 503, retryable: false },
    { status: 500, body: { error: 'private server-secret' }, code: 'PROVIDER_UNAVAILABLE', wantStatus: 503, retryable: true },
    { status: 503, body: { error: 'private server-secret' }, code: 'PROVIDER_UNAVAILABLE', wantStatus: 503, retryable: true },
  ];
  for (const useSearch of [false, true]) {
    for (const item of cases) {
      let requests = 0;
      const options = { apiKey: 'server-secret', fetch: async () => { requests += 1; return Response.json(item.body, { status: item.status }); } };
      const call = useSearch ? createGeocodingAdapter(options).search('Library', bbox) : createOrsAdapter(options).directions(routeInput);
      await assert.rejects(call, (error: unknown) => {
        expectError(item.code, item.wantStatus, item.retryable)(error);
        assert.ok(!JSON.stringify(error).includes('server-secret'));
        assert.ok(!String(error).includes('private'));
        return true;
      });
      assert.equal(requests, 1);
    }
  }
});

test('quota responses expose only a validated reset timestamp and rate limits expose bounded numeric retry metadata', async () => {
  const quota = createOrsAdapter({ apiKey: 'key', fetch: jsonFetch({ error: 'Quota exceeded' }, 403, { 'x-ratelimit-reset': '1792206000' }) });
  await assert.rejects(quota.directions(routeInput), (error: unknown) => {
    expectError('QUOTA_EXHAUSTED', 503, false)(error);
    assert.ok(error instanceof ProviderError);
    assert.equal(error.quotaResetAt, '2026-10-17T03:00:00.000Z');
    assert.deepEqual(error.details, { resetAt: '2026-10-17T03:00:00.000Z' });
    return true;
  });
  for (const value of ['12', 'malformed-private-secret']) {
    const rateLimited = createGeocodingAdapter({ apiKey: 'key', fetch: jsonFetch({ error: 'private' }, 429, { 'Retry-After': value }) });
    await assert.rejects(rateLimited.search('Library', bbox), (error: unknown) => {
      expectError('RATE_LIMITED', 429, true)(error);
      assert.ok(error instanceof ProviderError);
      assert.equal(error.retryAfterSec, value === '12' ? 12 : 60);
      assert.deepEqual(error.details, { retryAfterSec: value === '12' ? 12 : 60 });
      return true;
    });
  }
});

test('ORS maps explicit not-found route codes to NO_ROUTE and rejects redirects without retry', async () => {
  for (const code of [2009, 2010]) {
    await assert.rejects(createOrsAdapter({ apiKey: 'key', fetch: jsonFetch({ error: { code, message: 'private' } }, 404) }).directions(routeInput), expectError('NO_ROUTE', 422, false));
  }
  const redirect = createOrsAdapter({ apiKey: 'key', fetch: async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }) });
  await assert.rejects(redirect.directions(routeInput), expectError('PROVIDER_UNAVAILABLE', 503, false));
});

test('network failures and timeouts stay distinguishable, and deadlines include response-body reads', async () => {
  await assert.rejects(createOrsAdapter({ apiKey: 'key', fetch: async () => { throw new Error('private-key'); } }).directions(routeInput), expectError('PROVIDER_UNAVAILABLE', 503, true));
  const hangingFetch: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(createOrsAdapter({ apiKey: 'key', fetch: hangingFetch, timeoutMs: 5 }).directions(routeInput), expectError('PROVIDER_TIMEOUT', 504, true));
  const hangingBody: typeof fetch = async () => new Response(new ReadableStream({ start() { /* deliberately never closes */ } }));
  await assert.rejects(createGeocodingAdapter({ apiKey: 'key', fetch: hangingBody, timeoutMs: 5 }).search('Library', bbox), expectError('PROVIDER_TIMEOUT', 504, true));
});

test('search sends regional bounds, five-result and data-source limits to official Pelias and filters outside results again', async () => {
  const adapter = createGeocodingAdapter({ apiKey: 'server-secret', fetch: async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, 'https://api.heigit.org/pelias/v1/search');
    assert.equal(url.searchParams.get('text'), 'UNSW Library');
    assert.equal(url.searchParams.get('size'), '5');
    assert.equal(url.searchParams.get('boundary.rect.min_lon'), '151.22');
    assert.equal(url.searchParams.get('boundary.rect.min_lat'), '-33.93');
    assert.equal(url.searchParams.get('boundary.rect.max_lon'), '151.24');
    assert.equal(url.searchParams.get('boundary.rect.max_lat'), '-33.91');
    assert.equal(url.searchParams.get('sources'), 'openstreetmap,whosonfirst,geonames');
    assert.equal(options?.redirect, 'error');
    assert.ok(!url.toString().includes('server-secret'));
    assert.equal(new Headers(options?.headers).get('Authorization'), 'server-secret');
    return Response.json({ type: 'FeatureCollection', features: [point(1), point(2, [150, -34]), point(3, [151.23, -33.92], 'unknown')], geocoding: { version: '0.2' } });
  } });
  const results = await adapter.search('  UNSW   Library  ', bbox);
  assert.equal(results.length, 1);
  assert.deepEqual({ ...results[0], id: 'stable-id' }, { id: 'stable-id', name: 'Place 1, Kensington', location: [151.23, -33.92], source: 'openstreetmap' });
});

test('search caps results at five, removes duplicates and keeps IDs stable across result ordering and label changes', async () => {
  const first = createGeocodingAdapter({ apiKey: 'key', fetch: jsonFetch({ type: 'FeatureCollection', features: [point(1), point(1), point(2), point(3), point(4), point(5), point(6)] }) });
  const results = await first.search('Library', bbox);
  assert.equal(results.length, 5);
  assert.equal(new Set(results.map(item => item.id)).size, 5);
  const renamed = point(1);
  renamed.properties.label = 'A renamed library';
  const second = createGeocodingAdapter({ apiKey: 'key', fetch: jsonFetch({ type: 'FeatureCollection', features: [point(2), renamed] }) });
  assert.equal((await second.search('Library', bbox))[1].id, results[0].id);
});

test('search returns an empty list only for valid empty or region-filtered results', async () => {
  for (const features of [[], [point(1, [150, -34])]]) {
    assert.deepEqual(await createGeocodingAdapter({ apiKey: 'key', fetch: jsonFetch({ type: 'FeatureCollection', features }) }).search('Library', bbox), []);
  }
  for (const body of [
    {}, { type: 'FeatureCollection', features: null },
    { type: 'FeatureCollection', features: [point(1, [NaN, 0])] },
    { type: 'FeatureCollection', features: [], geocoding: { errors: ['upstream unavailable'] } },
  ]) {
    await assert.rejects(createGeocodingAdapter({ apiKey: 'key', fetch: jsonFetch(body) }).search('Library', bbox), expectError('INVALID_PROVIDER_RESULT', 502, false));
  }
});

test('search rejects invalid query lengths and bounds without calling the provider', async () => {
  const adapter = createGeocodingAdapter({ apiKey: 'key', fetch: async () => assert.fail('Input must be validated before fetching.') });
  for (const query of ['', 'a', 'a'.repeat(101)]) {
    await assert.rejects(adapter.search(query, bbox), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'INVALID_INPUT');
  }
  await assert.rejects(adapter.search('Library', [151.24, -33.93, 151.22, -33.91]), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'INVALID_INPUT');
});


test('malformed success JSON and interrupted body streams remain distinct provider failures', async () => {
  const malformed = createOrsAdapter({ apiKey: 'key', fetch: async () => new Response('not JSON') });
  await assert.rejects(malformed.directions(routeInput), expectError('INVALID_PROVIDER_RESULT', 502, false));
  const interrupted = createGeocodingAdapter({ apiKey: 'key', fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.error(new TypeError('private-network-detail')); },
  })) });
  await assert.rejects(interrupted.search('Library', bbox), expectError('PROVIDER_UNAVAILABLE', 503, true));
});
