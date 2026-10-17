import assert from 'node:assert/strict';
import test from 'node:test';

import { createPoiAdapter } from '../src/server/providers/poi';
import { PlacesService } from '../src/features/places/server/places';
import { ProviderError } from '../src/server/providers/provider-error';
import type { BBox, PlaceDTO } from '../src/shared/contracts';
import { fakeRepository, instant, region } from './routing-support';

const now = () => Date.parse(instant);
const bbox = region.bbox;
const point = [151.23, -33.92];

// Mirrors the official openpoiservice response, including its category_ids object.
function feature(id = 1, category = 'bench', tags: Record<string, string> = {}) {
  return {
    type: 'Feature', geometry: { type: 'Point', coordinates: point },
    properties: {
      osm_id: id, osm_type: 1, distance: 0,
      category_ids: { 162: { category_name: category, category_group: 'facilities' } },
      osm_tags: { name: 'OSM place', ...tags },
    },
  };
}
const collection = (features: unknown[]) => ({ type: 'FeatureCollection', features, information: {} });
const adapter = (body: unknown) => createPoiAdapter({ apiKey: 'test-only', now, fetch: async () => Response.json(body) });
const place = (id = 'osm-node-1', location = point as [number, number]): PlaceDTO => ({
  id, name: 'OSM bench', category: 'rest_area', location, accessibility: 'unknown',
  accessibilityNote: null, source: 'openstreetmap', sourceId: 'node/1', fetchedAt: instant,
  isDemo: true, rawAccessibility: { wheelchair: null, toiletWheelchair: null },
});

test('POI requests only the official bounded endpoint and preserves source identity and observed labels', async () => {
  const provider = createPoiAdapter({ apiKey: 'test-only', now, fetch: async (url, init) => {
    assert.equal(String(url), 'https://api.heigit.org/openpoiservice/v0/pois');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'test-only');
    // 102 includes lookahead even on the upstream version that returns limit - 1.
    assert.deepEqual(JSON.parse(String(init?.body)), {
      request: 'pois', geometry: { bbox: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] }, limit: 102,
    });
    return Response.json(collection([
      feature(7, 'toilets', { name: 'Actual OSM name', wheelchair: 'yes', 'toilets:wheelchair': 'yes', website: 'https://private.example' }),
      { ...feature(7, 'parking_entrance'), properties: { ...feature(7).properties, osm_type: 2 } },
    ]));
  } });
  const { items, truncated } = await provider.fetchPlaces(bbox, true);
  assert.equal(truncated, false);
  assert.equal(items.length, 2);
  assert.notEqual(items[0].id, items[1].id);
  assert.equal(items[0].name, 'Actual OSM name');
  assert.equal(items[0].source, 'openstreetmap');
  assert.equal(items[0].sourceId, 'node/7');
  assert.equal(items[1].sourceId, 'way/7');
  assert.equal(items[0].fetchedAt, instant);
  assert.equal(items[0].isDemo, true);
  assert.equal(JSON.stringify(items).includes('private.example'), false);
  assert.match(provider.keyFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(provider.identity.includes('test-only'), false);
  const { items: again } = await adapter(collection([feature(7)])).fetchPlaces(bbox, false);
  assert.equal(items[0].id, again[0].id);
  assert.equal(again[0].isDemo, false);
});

test('POI maps facility categories and yes/limited/no/unknown without guessing from names', async () => {
  const fixtures = [
    feature(1, 'bench', { wheelchair: 'yes' }),
    feature(2, 'parking_entrance', { wheelchair: 'limited' }),
    feature(3, 'toilets', { wheelchair: 'no', 'toilets:wheelchair': 'no' }),
    feature(4, 'toilets', { wheelchair: 'yes' }),
    feature(5, 'toilets', { wheelchair: 'yes', 'toilets:wheelchair': 'no' }),
    feature(6, 'cafe', { name: 'Wheelchair accessible toilet', wheelchair: 'designated' }),
  ];
  const { items } = await adapter(collection(fixtures)).fetchPlaces(bbox, true);
  assert.deepEqual(items.map((item) => [item.category, item.accessibility]), [
    ['rest_area', 'yes'], ['entrance', 'limited'], ['toilet', 'no'], ['toilet', 'unknown'],
    ['toilet', 'unknown'], ['other', 'unknown'],
  ]);
  assert.deepEqual(items[3].rawAccessibility, { wheelchair: 'yes', toiletWheelchair: null });
  assert.deepEqual(await adapter(collection([])).fetchPlaces(bbox, true), { items: [], truncated: false });
});

test('POI filters only out-of-bounds points, deduplicates OSM identity and keeps one lookahead item', async () => {
  const outside = { ...feature(999), geometry: { type: 'Point', coordinates: [0, 0] } };
  const { items, truncated } = await adapter(collection([outside, ...Array.from({ length: 101 }, (_, i) => feature(i + 1))])).fetchPlaces(bbox, true);
  assert.equal(items.length, 101);
  assert.equal(truncated, true);
  assert.equal(items.some((item) => item.sourceId === 'node/999'), false);
  const duplicate = await adapter(collection([feature(), feature()])).fetchPlaces(bbox, true);
  assert.equal(duplicate.items.length, 1);
  assert.equal(duplicate.truncated, false);
  const fixedUpstream = await adapter(collection(Array.from({ length: 102 }, (_, i) => feature(i + 1)))).fetchPlaces(bbox, true);
  assert.equal(fixedUpstream.items.length, 101);
  assert.equal(fixedUpstream.truncated, true);
  const oldUpstream = await adapter(collection([outside, ...Array.from({ length: 100 }, (_, i) => feature(i + 1))])).fetchPlaces(bbox, true);
  assert.equal(oldUpstream.items.length, 100);
  assert.equal(oldUpstream.truncated, true);
});

test('POI rejects malformed source geometry and identity instead of reporting an empty result', async () => {
  const valid = feature();
  for (const body of [
    {}, collection([{ ...valid, geometry: { type: 'LineString', coordinates: [point, point] } }]),
    collection([{ ...valid, geometry: { type: 'Point', coordinates: [181, 0] } }]),
    collection([{ ...valid, properties: { ...valid.properties, osm_type: 4 } }]),
    collection([{ ...valid, properties: { ...valid.properties, osm_id: undefined } }]),
    collection([{ ...valid, properties: { ...valid.properties, osm_id: Number.MAX_SAFE_INTEGER + 1 } }]),
    collection(Array.from({ length: 103 }, () => valid)),
  ]) await assert.rejects(adapter(body).fetchPlaces(bbox, true), { code: 'INVALID_PROVIDER_RESULT' });
});

test('POI rejects arbitrary URLs before any request and bounds oversized and redirected responses', async () => {
  let calls = 0;
  for (const baseUrl of ['https://evil.example', 'http://api.heigit.org/openpoiservice/v0', 'https://u:p@api.heigit.org/openpoiservice/v0', 'https://api.heigit.org/openpoiservice/v0?key=x']) {
    assert.throws(() => createPoiAdapter({ apiKey: 'test-only', baseUrl, fetch: async () => { calls++; return Response.json(collection([])); } }), { code: 'PROVIDER_UNAVAILABLE' });
  }
  assert.equal(calls, 0);
  const oversized = createPoiAdapter({ apiKey: 'test-only', fetch: async () => new Response(' '.repeat(1_048_577)) });
  await assert.rejects(oversized.fetchPlaces(bbox, true), { code: 'INVALID_PROVIDER_RESULT' });
  const redirected = createPoiAdapter({ apiKey: 'test-only', fetch: async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }) });
  await assert.rejects(redirected.fetchPlaces(bbox, true), { code: 'PROVIDER_UNAVAILABLE' });
});

test('POI preserves sanitized auth, quota, rate and timeout failures', async () => {
  for (const [status, body, code] of [
    [401, { error: 'secret-from-provider' }, 'PROVIDER_UNAVAILABLE'],
    [403, { error: 'No permission secret-from-provider' }, 'PROVIDER_UNAVAILABLE'],
    [403, { error: 'Quota exceeded' }, 'QUOTA_EXHAUSTED'],
    [429, { error: 'secret-from-provider' }, 'RATE_LIMITED'],
  ] as const) {
    const provider = createPoiAdapter({ apiKey: 'test-only', fetch: async () => Response.json(body, { status }) });
    await assert.rejects(provider.fetchPlaces(bbox, true), (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, code);
      assert.equal(JSON.stringify(error).includes('secret-from-provider'), false);
      assert.equal(error.message.includes('secret-from-provider'), false);
      return true;
    });
  }
  const timeout = createPoiAdapter({ apiKey: 'test-only', timeoutMs: 5, fetch: async () => new Promise<Response>(() => {}) });
  await assert.rejects(timeout.fetchPlaces(bbox, true), { code: 'PROVIDER_TIMEOUT' });
});

test('places caches the entire configured region across viewports for 24 hours with a separate POI budget', async () => {
  const f = fakeRepository();
  let clock = now(), calls = 0;
  const requests: unknown[] = [];
  f.repo.reserveBudget = async (input) => { requests.push(input); return { allowed: true, reservationId: 'poi-test' }; };
  const provider = { identity: 'poi-test', keyFingerprint: 'fingerprint', fetchPlaces: async (area: BBox, isDemo: boolean) => {
    calls++; assert.deepEqual(area, bbox); assert.equal(isDemo, true);
    return { items: [place(), place('osm-node-2', [151.235, -33.92])], truncated: false };
  } };
  const service = new PlacesService(f.repo, provider, { now: () => clock });
  const small: BBox = [151.229, -33.921, 151.231, -33.919];
  assert.equal((await service.getPlaces(small)).items.length, 1);
  assert.equal((await service.getPlaces(bbox)).items.length, 2);
  assert.equal(calls, 1);
  assert.equal(f.events.filter((event) => event.service === 'poi' && event.event === 'cacheHit').length, 1);
  assert.deepEqual(requests[0], { service: 'poi', keyFingerprint: 'fingerprint', minuteLimit: 10, dayLimit: 450, now: instant });
  clock += 86_400_000;
  await service.getPlaces(bbox);
  assert.equal(calls, 2);
  f.snapshot.region.configVersion++;
  await service.getPlaces(bbox);
  assert.equal(calls, 3);
});

test('places shares in-flight work until durable cache storage has completed', async () => {
  const f = fakeRepository();
  let calls = 0;
  let finishWrite!: () => void;
  const writing = new Promise<void>((resolve) => { finishWrite = resolve; });
  let writeStarted!: () => void;
  const started = new Promise<void>((resolve) => { writeStarted = resolve; });
  const put = f.repo.putCache;
  f.repo.putCache = async (...args) => { writeStarted(); await writing; await put(...args); };
  const service = new PlacesService(f.repo, { identity: 'poi-test', keyFingerprint: 'test', fetchPlaces: async () => { calls++; return { items: [place()], truncated: false }; } }, { now });
  const first = service.getPlaces(bbox);
  await started;
  const second = service.getPlaces(bbox);
  finishWrite();
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
});

test('places rejects late configuration changes, out-of-coverage requests and provider failures without caching success', async () => {
  const f = fakeRepository();
  const stale = new PlacesService(f.repo, { identity: 'stale', keyFingerprint: 'test', fetchPlaces: async () => { f.snapshot.region.configVersion++; return { items: [place()], truncated: false }; } }, { now });
  await assert.rejects(stale.getPlaces(bbox), { code: 'ROUTE_STALE' });
  assert.equal(f.caches.size, 0);
  let calls = 0;
  const unavailable = new PlacesService(f.repo, { identity: 'broken', keyFingerprint: 'test', fetchPlaces: async () => { calls++; throw new ProviderError(503, 'PROVIDER_UNAVAILABLE', 'Unavailable', { retryable: false }); } }, { now });
  await assert.rejects(unavailable.getPlaces([0, 0, 1, 1]), { code: 'OUT_OF_COVERAGE' });
  assert.equal(calls, 0);
  await assert.rejects(unavailable.getPlaces(bbox), { code: 'PROVIDER_UNAVAILABLE' });
  await assert.rejects(unavailable.getPlaces(bbox), { code: 'PROVIDER_UNAVAILABLE' });
  assert.equal(calls, 2);
  assert.equal(f.caches.size, 0);
});

test('places marks a capped source incomplete even when the current viewport contains fewer points', async () => {
  const f = fakeRepository();
  const service = new PlacesService(f.repo, { identity: 'cap', keyFingerprint: 'test', fetchPlaces: async () => ({ items: Array.from({ length: 101 }, (_, index) => place(`osm-node-${index}`)), truncated: true }) }, { now });
  const output = await service.getPlaces(bbox);
  assert.equal(output.items.length, 100);
  assert.equal(output.truncated, true);
  const emptyView = await service.getPlaces([151.234, -33.921, 151.236, -33.919]);
  assert.deepEqual(emptyView, { items: [], truncated: true });
});

test('places does not return stale cached data when configuration changes during usage recording', async () => {
  const f = fakeRepository();
  const service = new PlacesService(f.repo, { identity: 'late-cache', keyFingerprint: 'test', fetchPlaces: async () => ({ items: [place()], truncated: false }) }, { now });
  await service.getPlaces(bbox);
  f.repo.recordUsage = async () => { f.snapshot.region.configVersion++; };
  await assert.rejects(service.getPlaces(bbox), { code: 'ROUTE_STALE' });
});

test('places shares a cache persistence failure without retrying the provider', async () => {
  const f = fakeRepository();
  let calls = 0;
  const failure = new Error('Database unavailable');
  f.repo.putCache = async () => { throw failure; };
  const service = new PlacesService(f.repo, { identity: 'broken-cache', keyFingerprint: 'test', fetchPlaces: async () => { calls++; return { items: [place()], truncated: false }; } }, { now });
  const requests = await Promise.allSettled([service.getPlaces(bbox), service.getPlaces(bbox)]);
  assert.equal(calls, 1);
  for (const outcome of requests) {
    assert.equal(outcome.status, 'rejected');
    if (outcome.status === 'rejected') assert.equal(outcome.reason, failure);
  }
});

test('places preserves source truncation after lookahead points are filtered and after cache reload', async () => {
  const f = fakeRepository();
  const outside = { ...feature(999), geometry: { type: 'Point', coordinates: [0, 0] } };
  const provider = adapter(collection([
    ...Array.from({ length: 100 }, (_, index) => feature(index + 1)), outside, feature(1),
  ]));
  const output = await new PlacesService(f.repo, provider, { now }).getPlaces(bbox);
  assert.equal(output.items.length, 100);
  assert.equal(output.truncated, true);
  const reloaded = await new PlacesService(f.repo, provider, { now }).getPlaces(bbox);
  assert.deepEqual(reloaded, output);
  const empty = await new PlacesService(fakeRepository().repo, adapter(collection([])), { now }).getPlaces(bbox);
  assert.deepEqual(empty, { items: [], truncated: false });
});

test('places does not reserve or start an eight-second retry beyond its overall deadline', async () => {
  const f = fakeRepository();
  let clock = now(), calls = 0, reservations = 0;
  f.repo.reserveBudget = async () => { reservations++; return { allowed: true, reservationId: 'slow-test' }; };
  const slow = {
    identity: 'slow-eight-second-provider', keyFingerprint: 'test', timeoutMs: 8000,
    fetchPlaces: async () => {
      calls++;
      clock += 8000;
      throw new ProviderError(503, 'PROVIDER_UNAVAILABLE', 'Unavailable', { retryable: true });
    },
  };
  const service = new PlacesService(f.repo, slow, { now: () => clock });
  await assert.rejects(service.getPlaces(bbox), { code: 'PROVIDER_UNAVAILABLE' });
  assert.equal(calls, 1);
  assert.equal(reservations, 1);
});
