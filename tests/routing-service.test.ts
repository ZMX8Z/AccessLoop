import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RoutingService,
  resolvePassage,
} from '../src/features/routing/server/service';
import { evaluateContext } from '../src/features/routing/server/context';
import { fakeRepository, instant, result, routeInput } from './routing-support';

const now = () => Date.parse(instant);
const adapter = (directions = async () => structuredClone(result)) => ({
  identity: 'test-ors-v1',
  keyFingerprint: 'sha256:test',
  directions,
});
test('public cache shares geometry, never another session reference or personal version', async () => {
  const f = fakeRepository();
  let calls = 0;
  const service = new RoutingService(
    f.repo,
    adapter(async () => {
      calls++;
      return structuredClone(result);
    }),
    { now },
  );
  f.snapshot.personalVersion = 5;
  const a = await service.route('session-a', routeInput);
  f.snapshot.personalVersion = 9;
  const b = await service.route('session-b', routeInput);
  assert.equal(calls, 1);
  assert.notEqual(a.routeRef, b.routeRef);
  assert.equal(b.personalVersion, 9);
  assert.equal(b.cacheHit, true);
  assert.equal(f.references[1].sessionKey, 'session-b');
  const cached = JSON.stringify([...f.caches.values()]);
  assert.ok(!cached.includes('routeRef'));
  assert.ok(!cached.includes('session-a'));
});
test('expiry changes activeDigest with unchanged version; stale response is recomputed', async () => {
  const f = fakeRepository();
  let time = now();
  const expiry = new Date(time + 10).toISOString();
  f.snapshot.publicAvoidances = [
    {
      id: 'public',
      publicRevision: 1,
      status: 'verified',
      validUntil: expiry,
      publicAvoidGeometry: {
        type: 'Polygon',
        coordinates: [
          [
            [151.229, -33.925],
            [151.23, -33.925],
            [151.23, -33.924],
            [151.229, -33.924],
            [151.229, -33.925],
          ],
        ],
      },
    },
  ];
  const before = evaluateContext(f.snapshot, time);
  let calls = 0;
  const service = new RoutingService(
    f.repo,
    adapter(async () => {
      calls++;
      time += 20;
      return structuredClone(result);
    }),
    { now: () => time },
  );
  const output = await service.route('session-a', routeInput);
  assert.equal(calls, 2);
  assert.notEqual(before.context.activeDigest, output.activeDigest);
  assert.deepEqual(output.avoidedReportIds, []);
});
test('a continuously changing context is never published after one recomputation', async () => {
  const f = fakeRepository();
  const service = new RoutingService(
    f.repo,
    adapter(async () => {
      f.snapshot.region.hazardVersion++;
      return structuredClone(result);
    }),
    { now },
  );
  await assert.rejects(service.route('a', routeInput), { code: 'ROUTE_STALE' });
  assert.equal(f.references.length, 0);
});
test('concurrent public requests share one provider attempt but create separate routeRefs', async () => {
  const f = fakeRepository();
  let calls = 0;
  const service = new RoutingService(
    f.repo,
    adapter(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return structuredClone(result);
    }),
    { now },
  );
  const [a, b] = await Promise.all([
    service.route('a', routeInput),
    service.route('b', routeInput),
  ]);
  assert.equal(calls, 1);
  assert.notEqual(a.routeRef, b.routeRef);
  assert.equal(f.events.filter((x) => x.event === 'call').length, 1);
});
test('snapshot failure and unsupported restrictions never call upstream', async () => {
  const f = fakeRepository();
  let calls = 0;
  const service = new RoutingService(
    f.repo,
    adapter(async () => {
      calls++;
      return result;
    }),
    { now },
  );
  await assert.rejects(
    service.route('a', {
      ...routeInput,
      restrictions: { ...routeInput.restrictions, minimum_width: 4 },
    }),
    { code: 'INVALID_INPUT' },
  );
  f.repo.readSnapshot = async () => {
    throw new Error('database unavailable');
  };
  await assert.rejects(service.route('a', routeInput));
  assert.equal(calls, 0);
});
test('atomic publication conflict refuses to return a stale reference', async () => {
  const f = fakeRepository();
  f.repo.publishRouteReference = async () => null;
  await assert.rejects(
    new RoutingService(f.repo, adapter(), { now }).route('a', routeInput),
    { code: 'ROUTE_STALE' },
  );
});
test('routeRef ownership and expiry are required for passage selection', async () => {
  const f = fakeRepository();
  const output = await new RoutingService(f.repo, adapter(), { now }).route(
    'a',
    routeInput,
  );
  const ref = { routeRef: output.routeRef, startIndex: 0, endIndex: 1 };
  await assert.rejects(
    resolvePassage(f.repo, 'b', ref, routeInput.start, now()),
    { code: 'INVALID_PASSAGE' },
  );
  await assert.rejects(
    resolvePassage(f.repo, 'a', ref, routeInput.start, now() + 901000),
    { code: 'INVALID_PASSAGE' },
  );
  const geometry = await resolvePassage(
    f.repo,
    'a',
    ref,
    routeInput.start,
    now(),
  );
  assert.equal(geometry.type, 'Polygon');
});

test('personal cache and in-flight work are isolated by server session namespace', async () => {
  const f = fakeRepository();
  f.snapshot.personalAvoidances = [
    {
      id: 'mine',
      rowVersion: 2,
      confirmationReportVersion: 2,
      active: true,
      reportStatus: 'pending',
      validUntil: '2026-10-17T01:00:00Z',
      avoidGeometry: {
        type: 'Polygon',
        coordinates: [
          [
            [151.229, -33.925],
            [151.23, -33.925],
            [151.23, -33.924],
            [151.229, -33.924],
            [151.229, -33.925],
          ],
        ],
      },
    },
  ];
  let calls = 0;
  const service = new RoutingService(
    f.repo,
    adapter(async () => {
      calls++;
      return structuredClone(result);
    }),
    { now },
  );
  await Promise.all([
    service.route('a', routeInput),
    service.route('b', routeInput),
  ]);
  assert.equal(calls, 2);
  assert.equal(f.caches.size, 2);
});
test('private row changes on a public report cannot change the public routing digest', () => {
  const f = fakeRepository();
  f.snapshot.publicAvoidances = [
    {
      id: 'public',
      publicRevision: 1,
      status: 'verified',
      validUntil: '2026-10-17T01:00:00Z',
      publicAvoidGeometry: {
        type: 'Polygon',
        coordinates: [
          [
            [151.229, -33.925],
            [151.23, -33.925],
            [151.23, -33.924],
            [151.229, -33.924],
            [151.229, -33.925],
          ],
        ],
      },
    },
  ];
  const a = evaluateContext(f.snapshot, now());
  f.snapshot.personalVersion = 10;
  const b = evaluateContext(f.snapshot, now());
  assert.equal(a.publicDigest, b.publicDigest);
  assert.equal(a.context.activeDigest, b.context.activeDigest);
});
test('malformed stored expiry fails closed instead of silently removing an avoidance', () => {
  const f = fakeRepository();
  f.snapshot.personalAvoidances = [
    {
      id: 'mine',
      rowVersion: 2,
      confirmationReportVersion: 2,
      active: true,
      reportStatus: 'pending',
      validUntil: 'bad-date',
      avoidGeometry: {
        type: 'Polygon',
        coordinates: [
          [
            [151.229, -33.925],
            [151.23, -33.925],
            [151.23, -33.924],
            [151.229, -33.924],
            [151.229, -33.925],
          ],
        ],
      },
    },
  ];
  assert.throws(() => evaluateContext(f.snapshot, now()));
});

test('after discarding stale results, exhausted recompute budget reports ROUTE_STALE', async () => {
  const f = fakeRepository();
  let reservations = 0;
  f.repo.reserveBudget = async () =>
    ++reservations === 1
      ? { allowed: true, reservationId: 'first' }
      : { allowed: false, reason: 'quota', retryAfterSec: 3600 };
  const service = new RoutingService(
    f.repo,
    adapter(async () => {
      f.snapshot.region.hazardVersion++;
      return structuredClone(result);
    }),
    { now },
  );
  await assert.rejects(service.route('a', routeInput), { code: 'ROUTE_STALE' });
  assert.equal(f.references.length, 0);
});

test('dedup remains active during post-provider context checks and cache publication', async () => {
  const f = fakeRepository();
  const original = f.repo.readSnapshot;
  let aReads = 0;
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((r) => {
    release = r;
  });
  const atCheck = new Promise<void>((r) => {
    entered = r;
  });
  f.repo.readSnapshot = async (session) => {
    if (session === 'a' && ++aReads === 2) {
      entered();
      await blocked;
    }
    return original(session);
  };
  let calls = 0;
  const service = new RoutingService(
    f.repo,
    adapter(async () => {
      calls++;
      return structuredClone(result);
    }),
    { now },
  );
  const a = service.route('a', routeInput);
  await atCheck;
  const b = await service.route('b', routeInput);
  release();
  const first = await a;
  assert.equal(calls, 1);
  assert.notEqual(first.routeRef, b.routeRef);
});
test('recomputation consumes the same request deadline as provider retries', async () => {
  const f = fakeRepository();
  let time = now();
  let calls = 0;
  const { ProviderError } =
    await import('../src/server/providers/provider-error');
  const { ProviderGate } = await import('../src/server/providers/gate');
  const gate = new ProviderGate(f.repo, {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  });
  const service = new RoutingService(
    f.repo,
    adapter(async () => {
      time += 5900;
      calls++;
      if (calls % 2 === 1)
        throw new ProviderError(504, 'PROVIDER_TIMEOUT', 'Timed out', {
          retryable: true,
        });
      f.snapshot.region.hazardVersion++;
      return structuredClone(result);
    }),
    { now: () => time, gate },
  );
  await assert.rejects(service.route('a', routeInput), { code: 'ROUTE_STALE' });
  assert.ok(time - now() <= 15000);
  assert.equal(calls, 2);
});

test('a deduplicated waiter keeps its own deadline without cancelling the owner', async () => {
  const f = fakeRepository();
  let time = now(),
    reads = 0;
  let releaseCache!: () => void,
    releaseProvider!: () => void,
    cacheEntered!: () => void,
    providerEntered!: () => void;
  const cacheBlock = new Promise<void>((r) => {
      releaseCache = r;
    }),
    providerBlock = new Promise<void>((r) => {
      releaseProvider = r;
    });
  const cacheAt = new Promise<void>((r) => {
      cacheEntered = r;
    }),
    providerAt = new Promise<void>((r) => {
      providerEntered = r;
    });
  f.repo.getCache = async () => {
    if (++reads === 1) {
      cacheEntered();
      await cacheBlock;
    }
    return null;
  };
  const service = new RoutingService(
    f.repo,
    adapter(async () => {
      providerEntered();
      await providerBlock;
      return structuredClone(result);
    }),
    { now: () => time },
  );
  const early = service.route('early', routeInput).then(
    (value) => ({ value, error: null }),
    (error) => ({ value: null, error }),
  );
  await cacheAt;
  time += 5000;
  const owner = service.route('owner', routeInput);
  await providerAt;
  releaseCache();
  await new Promise((r) => setImmediate(r));
  time = now() + 17000;
  releaseProvider();
  const late = await early;
  assert.equal(late.error?.code, 'PROVIDER_TIMEOUT');
  assert.equal(late.value, null);
  assert.ok((await owner).routeRef);
  assert.equal(f.references.length, 1);
});
