import { normalizeAccessibility } from '../src/features/places/server/accessibility';
import assert from 'node:assert/strict';
import test from 'node:test';
import { SearchService } from '../src/features/places/server/search';
import { createRoutingHandlers } from '../src/features/routing/server/handlers';
import { RoutingService } from '../src/features/routing/server/service';
import { fakeRepository, instant, result, region } from './routing-support';
const now = () => Date.parse(instant);
test('search reuses normalized query, preserves no results and distinct failure', async () => {
  const f = fakeRepository();
  let calls = 0;
  const service = new SearchService(
    f.repo,
    {
      identity: 'test-search',
      keyFingerprint: 'test',
      search: async () => {
        calls++;
        return [];
      },
    },
    { now },
  );
  assert.deepEqual(await service.search(' Library '), {
    query: 'Library',
    items: [],
  });
  assert.deepEqual(await service.search('Library'), {
    query: 'Library',
    items: [],
  });
  assert.equal(calls, 1);
  assert.equal(f.events.filter((x) => x.event === 'cacheHit').length, 1);
  const broken = new SearchService(
    f.repo,
    {
      identity: 'broken',
      keyFingerprint: 'test',
      search: async () => {
        throw new Error('upstream');
      },
    },
    { now },
  );
  await assert.rejects(broken.search('Library'));
});
test('search strips out-of-region and excess results; config change drops in-flight result', async () => {
  const f = fakeRepository();
  const adapter = {
    identity: 'test-search',
    keyFingerprint: 'test',
    search: async () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: String(i),
        name: 'Test',
        location:
          i === 0
            ? ([0, 0] as [number, number])
            : ([151.23, -33.92] as [number, number]),
        source: 'openstreetmap',
      })),
  };
  const output = await new SearchService(f.repo, adapter, { now }).search(
    'Test',
  );
  assert.equal(output.items.length, 5);
  assert.equal(output.items[0].id, '1');
  const stale = new SearchService(
    f.repo,
    {
      ...adapter,
      identity: 'stale',
      search: async () => {
        f.snapshot.region.configVersion++;
        return [];
      },
    },
    { now },
  );
  await assert.rejects(stale.search('Other'), { code: 'ROUTE_STALE' });
});
test('HTTP origin/session/input checks and private error envelopes', async () => {
  const f = fakeRepository();
  const routes = new RoutingService(
    f.repo,
    {
      identity: 'test',
      keyFingerprint: 'test',
      directions: async () => result,
    },
    { now },
  );
  const search = new SearchService(
    f.repo,
    { identity: 'search', keyFingerprint: 'test', search: async () => [] },
    { now },
  );
  const handlers = createRoutingHandlers({
    repository: f.repo,
    routes,
    search,
    applicationOrigin: 'https://example.test',
    now,
  });
  const forbidden = await handlers.routes(
    new Request('https://example.test/api/routes', {
      method: 'POST',
      body: '{}',
    }),
  );
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('Cache-Control'), 'private, no-store');
  f.repo.resolveSession = async () => null;
  const unauthorized = await handlers.context(
    new Request('https://example.test/api/routing-context'),
  );
  assert.equal(unauthorized.status, 401);
  const invalid = await handlers.places(
    new Request('https://example.test/api/places?bbox=1,2,3,4'),
  );
  assert.equal(invalid.status, 422);
  const unknown = await handlers.search(
    new Request('https://example.test/api/search?q=test&url=https://evil'),
  );
  assert.equal(unknown.status, 400);
  const valid = await handlers.region(
    new Request('https://example.test/api/region'),
  );
  assert.equal(valid.status, 200);
  assert.deepEqual((await valid.json()).data, region);
});
test('places cap complete repository results and preserve unknown accessibility', async () => {
  const f = fakeRepository();
  f.repo.getPlaces = async () =>
    Array.from({ length: 101 }, (_, i) => ({
      id: String(i),
      name: 'Synthetic place',
      category: 'toilet' as const,
      location: [151.23, -33.92] as [number, number],
      accessibility: 'unknown' as const,
      accessibilityNote: null,
      source: 'synthetic-test',
      sourceId: String(i),
      fetchedAt: instant,
      isDemo: true,
      rawAccessibility: { wheelchair: 'yes', toiletWheelchair: null },
    }));
  const routes = new RoutingService(
    f.repo,
    {
      identity: 'test',
      keyFingerprint: 'test',
      directions: async () => result,
    },
    { now },
  );
  const search = new SearchService(
    f.repo,
    { identity: 'search', keyFingerprint: 'test', search: async () => [] },
    { now },
  );
  const handlers = createRoutingHandlers({
    repository: f.repo,
    routes,
    search,
    applicationOrigin: 'https://example.test',
    now,
  });
  const response = await handlers.places(
    new Request(
      'https://example.test/api/places?bbox=' + region.bbox.join(','),
    ),
  );
  const { data } = await response.json();
  assert.equal(data.items.length, 100);
  assert.equal(data.truncated, true);
  assert.equal(data.items[0].accessibility, 'unknown');
});

test('OSM accessibility treats absent, unrecognized and conflicting tags as unknown', () => {
  assert.equal(
    normalizeAccessibility('toilet', {
      wheelchair: 'yes',
      toiletWheelchair: null,
    }),
    'unknown',
  );
  assert.equal(
    normalizeAccessibility('toilet', {
      wheelchair: 'yes',
      toiletWheelchair: 'no',
    }),
    'unknown',
  );
  assert.equal(
    normalizeAccessibility('entrance', {
      wheelchair: 'designated',
      toiletWheelchair: null,
    }),
    'unknown',
  );
  assert.equal(
    normalizeAccessibility('entrance', {
      wheelchair: 'limited',
      toiletWheelchair: null,
    }),
    'limited',
  );
});
