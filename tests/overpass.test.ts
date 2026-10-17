import assert from 'node:assert/strict';
import test from 'node:test';

import { createOverpassAdapter } from '../src/server/providers/overpass';
import { ProviderError } from '../src/server/providers/provider-error';
import { region, instant } from './routing-support';

const now = () => Date.parse(instant);
const bbox = region.bbox;
const node = (id = 7, tags: Record<string, string> = { amenity: 'bench' }) => ({
  type: 'node', id, lat: -33.92, lon: 151.23, tags,
});
const response = (elements: unknown[]) => ({ version: 0.6, generator: 'Overpass API', osm3s: {}, elements });
const adapter = (body: unknown) => createOverpassAdapter({ now, fetch: async () => Response.json(body) });

test('Overpass sends one bounded region query to the fixed endpoint without external credentials', async () => {
  let calls = 0;
  const provider = createOverpassAdapter({ now, fetch: async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://overpass-api.de/api/interpreter');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    assert.match(new Headers(init?.headers).get('Content-Type') ?? '', /^application\/x-www-form-urlencoded/);
    assert.equal(new URLSearchParams(String(init?.body)).get('data'),
      '[out:json][timeout:8][maxsize:16777216];(nwr["amenity"~"^(toilets|bench|shelter)$"](-33.93,151.22,-33.91,151.24);nwr["entrance"](-33.93,151.22,-33.91,151.24);nwr["wheelchair"](-33.93,151.22,-33.91,151.24););out center 102;');
    return Response.json(response([node(7, { amenity: 'bench', name: 'OSM name', wheelchair: 'yes', website: 'https://private.example' })]));
  } });
  const output = await provider.fetchPlaces(bbox, true);
  assert.equal(calls, 1);
  assert.deepEqual(output, { items: [{
    id: 'osm-node-7', sourceId: 'node/7', source: 'openstreetmap', name: 'OSM name',
    category: 'rest_area', location: [151.23, -33.92], accessibility: 'yes', accessibilityNote: null,
    fetchedAt: instant, isDemo: true, rawAccessibility: { wheelchair: 'yes', toiletWheelchair: null },
  }], truncated: false });
  assert.equal(JSON.stringify(output).includes('private.example'), false);
  assert.match(provider.keyFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(provider.keyFingerprint, createOverpassAdapter().keyFingerprint);
});

test('Overpass maps node/way/relation identity, centers and four accessibility states from known tags', async () => {
  const elements = [
    node(1, { entrance: 'main', wheelchair: 'yes' }),
    { type: 'way', id: 1, center: { lat: -33.92, lon: 151.23 }, tags: { amenity: 'shelter', wheelchair: 'limited' } },
    { type: 'relation', id: 1, center: { lat: -33.92, lon: 151.23 }, tags: { amenity: 'toilets', wheelchair: 'no', 'toilets:wheelchair': 'no' } },
    node(2, { amenity: 'toilets', wheelchair: 'yes' }),
    node(3, { amenity: 'toilets', wheelchair: 'yes', 'toilets:wheelchair': 'no' }),
    node(4, { name: 'Accessible entrance and toilet', wheelchair: 'designated' }),
    node(5, { entrance: 'no', wheelchair: 'yes' }),
  ];
  const { items } = await adapter(response(elements)).fetchPlaces(bbox, false);
  assert.deepEqual(items.map((item) => [item.sourceId, item.category, item.accessibility]), [
    ['node/1', 'entrance', 'yes'], ['way/1', 'rest_area', 'limited'], ['relation/1', 'toilet', 'no'],
    ['node/2', 'toilet', 'unknown'], ['node/3', 'toilet', 'unknown'], ['node/4', 'other', 'unknown'],
    ['node/5', 'other', 'yes'],
  ]);
  assert.equal(new Set(items.map((item) => item.id)).size, 7);
  assert.ok(items.every((item) => item.isDemo === false));
  assert.equal(items[1].name.startsWith('OpenStreetMap '), true);
});

test('Overpass keeps raw source truncation after spatial filtering and duplicate removal', async () => {
  const outside = { ...node(999), lat: 0, lon: 0 };
  for (const count of [101, 102]) {
    const elements = [...Array.from({ length: 100 }, (_, index) => node(index + 1)), outside];
    if (count === 102) elements.push(node(1));
    const output = await adapter(response(elements)).fetchPlaces(bbox, true);
    assert.equal(output.items.length, 100);
    assert.equal(output.truncated, true);
  }
  const full = await adapter(response(Array.from({ length: 102 }, (_, index) => node(index + 1)))).fetchPlaces(bbox, true);
  assert.equal(full.items.length, 101);
  assert.equal(full.truncated, true);
  assert.equal((await adapter(response([node(), node()])).fetchPlaces(bbox, true)).items.length, 1);
});

test('Overpass accepts a genuine empty result and rejects partial HTTP 200 results with any remark', async () => {
  assert.deepEqual(await adapter(response([])).fetchPlaces(bbox, true), { items: [], truncated: false });
  for (const remark of ['runtime error: Query timed out secret-detail', 'runtime error: out of memory', '', null]) {
    await assert.rejects(adapter({ ...response([node()]), remark }).fetchPlaces(bbox, true), (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, 'INVALID_PROVIDER_RESULT');
      assert.equal(error.retryable, false);
      assert.equal(error.message.includes('secret-detail'), false);
      return true;
    });
  }
});

test('Overpass rejects malformed element identities and coordinates instead of returning partial places', async () => {
  for (const body of [
    {}, response([{ ...node(), id: undefined }]), response([{ ...node(), id: Number.MAX_SAFE_INTEGER + 1 }]),
    response([{ ...node(), type: 'area' }]), response([{ ...node(), lat: 91 }]),
    response([{ ...node(), lon: '151.23' }]), response([{ type: 'way', id: 7, tags: {} }]),
    response([{ type: 'relation', id: 7, center: { lat: 0, lon: 181 }, tags: {} }]),
    response([node(), { ...node(8), lat: null }]), response(Array.from({ length: 103 }, (_, index) => node(index + 1))),
  ]) await assert.rejects(adapter(body).fetchPlaces(bbox, true), { code: 'INVALID_PROVIDER_RESULT' });
});

test('Overpass rejects arbitrary endpoint URLs and invalid input before making a request', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json(response([])); };
  for (const baseUrl of [
    'http://overpass-api.de/api/interpreter', 'https://evil.example/api/interpreter',
    'https://overpass-api.de/api/interpreter?data=other', 'https://u:p@overpass-api.de/api/interpreter',
    'https://overpass-api.de:444/api/interpreter', 'https://overpass-api.de/api/interpreter#other',
  ]) assert.throws(() => createOverpassAdapter({ baseUrl, fetch: fetcher }), { code: 'PROVIDER_UNAVAILABLE' });
  const provider = createOverpassAdapter({ fetch: fetcher });
  await assert.rejects(provider.fetchPlaces([1, 1, 0, 0], true), { code: 'INVALID_INPUT' });
  assert.equal(calls, 0);
  for (const timeoutMs of [0, Infinity, 15001]) assert.throws(() => createOverpassAdapter({ timeoutMs }), { code: 'PROVIDER_UNAVAILABLE' });
});

test('Overpass bounds streamed bytes and rejects redirects, invalid JSON and interrupted response bodies', async () => {
  const oversized = createOverpassAdapter({ fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(600000)); controller.enqueue(new Uint8Array(600000)); controller.close(); },
  })) });
  await assert.rejects(oversized.fetchPlaces(bbox, true), { code: 'INVALID_PROVIDER_RESULT' });
  const declared = createOverpassAdapter({ fetch: async () => new Response('{}', { headers: { 'Content-Length': '1048577' } }) });
  await assert.rejects(declared.fetchPlaces(bbox, true), { code: 'INVALID_PROVIDER_RESULT' });
  const redirected = createOverpassAdapter({ fetch: async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }) });
  await assert.rejects(redirected.fetchPlaces(bbox, true), { code: 'PROVIDER_UNAVAILABLE' });
  const invalid = createOverpassAdapter({ fetch: async () => new Response('{"elements":NaN}') });
  await assert.rejects(invalid.fetchPlaces(bbox, true), { code: 'INVALID_PROVIDER_RESULT' });
  const interrupted = createOverpassAdapter({ fetch: async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('private-network-detail')); } })) });
  await assert.rejects(interrupted.fetchPlaces(bbox, true), { code: 'PROVIDER_UNAVAILABLE' });
});

test('Overpass total timeout aborts both a pending fetch and a pending body read', async () => {
  let fetchSignal: AbortSignal | undefined;
  const fetchTimeout = createOverpassAdapter({ timeoutMs: 5, fetch: async (_url, init) => {
    fetchSignal = init?.signal ?? undefined;
    return new Promise<Response>(() => {});
  } });
  await assert.rejects(fetchTimeout.fetchPlaces(bbox, true), { code: 'PROVIDER_TIMEOUT', status: 504 });
  assert.equal(fetchSignal?.aborted, true);
  let bodySignal: AbortSignal | undefined;
  const bodyTimeout = createOverpassAdapter({ timeoutMs: 5, fetch: async (_url, init) => {
    bodySignal = init?.signal ?? undefined;
    return new Response(new ReadableStream({ start(controller) {
      bodySignal?.addEventListener('abort', () => controller.error(new Error('aborted')));
    } }));
  } });
  await assert.rejects(bodyTimeout.fetchPlaces(bbox, true), { code: 'PROVIDER_TIMEOUT', status: 504 });
  assert.equal(bodySignal?.aborted, true);
});

test('Overpass maps rate, timeout, server and auth failures without leaking provider text or retrying internally', async () => {
  for (const [status, code, retryable] of [
    [429, 'RATE_LIMITED', true], [408, 'PROVIDER_TIMEOUT', true], [504, 'PROVIDER_TIMEOUT', true],
    [500, 'PROVIDER_UNAVAILABLE', true], [403, 'PROVIDER_UNAVAILABLE', false],
  ] as const) {
    let calls = 0;
    const provider = createOverpassAdapter({ fetch: async () => { calls++; return new Response('private-upstream-detail', { status, headers: { 'Retry-After': '7' } }); } });
    await assert.rejects(provider.fetchPlaces(bbox, true), (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, code);
      assert.equal(error.retryable, retryable);
      assert.equal(error.message.includes('private-upstream-detail'), false);
      if (status === 429) assert.equal(error.retryAfterSec, 7);
      return true;
    });
    assert.equal(calls, 1);
  }
  const boundedRate = createOverpassAdapter({ fetch: async () => new Response(null, { status: 429, headers: { 'Retry-After': '999999999999' } }) });
  await assert.rejects(boundedRate.fetchPlaces(bbox, true), (error: unknown) => error instanceof ProviderError && Number.isFinite(error.retryAfterSec) && error.retryAfterSec! <= 3600);
  const failedCleanup = createOverpassAdapter({ fetch: async () => new Response(new ReadableStream({
    cancel() { throw new Error('private-cleanup-detail'); },
  }), { status: 429, headers: { 'Retry-After': '7' } }) });
  await assert.rejects(failedCleanup.fetchPlaces(bbox, true), { code: 'RATE_LIMITED' });
});
