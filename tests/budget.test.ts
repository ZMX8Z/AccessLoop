import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderGate } from '../src/server/providers/gate';
import { ProviderError } from '../src/server/providers/provider-error';
import { fakeRepository, instant } from './routing-support';
const request = {
  service: 'ors' as const,
  keyFingerprint: 'sha256:test',
  policy: { minuteLimit: 30, dayLimit: 1800 },
};
test('budget denial prevents provider attempt and records a wait, not a call', async () => {
  const f = fakeRepository();
  let calls = 0;
  f.repo.reserveBudget = async () => ({
    allowed: false,
    reason: 'rate',
    retryAfterSec: 12,
  });
  await assert.rejects(
    new ProviderGate(f.repo, { now: () => Date.parse(instant) }).run({
      ...request,
      operation: async () => {
        calls++;
      },
    }),
    { code: 'RATE_LIMITED' },
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    f.events.map((x) => x.event),
    ['wait'],
  );
});
test('retry obtains another reservation and each attempt/error is counted', async () => {
  const f = fakeRepository();
  let attempts = 0,
    reservations = 0;
  f.repo.reserveBudget = async () => ({
    allowed: true,
    reservationId: String(++reservations),
  });
  const gate = new ProviderGate(f.repo, {
    now: () => Date.parse(instant),
    sleep: async () => {},
  });
  assert.equal(
    await gate.run({
      ...request,
      operation: async () => {
        if (++attempts === 1)
          throw new ProviderError(503, 'PROVIDER_UNAVAILABLE', 'Unavailable', {
            retryable: true,
          });
        return 'ok';
      },
    }),
    'ok',
  );
  assert.equal(reservations, 2);
  assert.deepEqual(
    f.events.map((x) => x.event),
    ['call', 'error', 'call'],
  );
});
test('auth failure is not relabeled as quota and is never retried', async () => {
  const f = fakeRepository();
  let calls = 0;
  const gate = new ProviderGate(f.repo);
  await assert.rejects(
    gate.run({
      ...request,
      operation: async () => {
        calls++;
        throw new ProviderError(503, 'PROVIDER_UNAVAILABLE', 'Unavailable', {
          retryable: false,
        });
      },
    }),
    { code: 'PROVIDER_UNAVAILABLE' },
  );
  assert.equal(calls, 1);
});
test('failure to persist reservation fails closed', async () => {
  const f = fakeRepository();
  let calls = 0;
  f.repo.reserveBudget = async () => {
    throw new Error('DB offline');
  };
  await assert.rejects(
    new ProviderGate(f.repo).run({
      ...request,
      operation: async () => {
        calls++;
      },
    }),
  );
  assert.equal(calls, 0);
});

test('slow telemetry cannot start a new provider attempt after the deadline', async () => {
  const f = fakeRepository();
  let time = Date.parse(instant),
    startedAt = -1;
  const original = f.repo.recordUsage;
  f.repo.recordUsage = async (event) => {
    await original(event);
    if (event.event === 'call') time = Date.parse(instant) + 16000;
  };
  await assert.rejects(
    new ProviderGate(f.repo, { now: () => time }).run({
      ...request,
      deadlineAt: Date.parse(instant) + 15000,
      operation: async () => {
        startedAt = time;
        return 'ok';
      },
    }),
    { code: 'PROVIDER_TIMEOUT' },
  );
  assert.ok(startedAt < Date.parse(instant) + 15000);
});

test('classified error results retain their value and count one failed attempt without retrying', async () => {
  const f = fakeRepository();
  let attempts = 0;
  f.repo.blockBudget = async () => assert.fail('An invalid result must not block the provider budget.');
  const value = { status: 'unavailable', privateDetail: 'Must never enter telemetry.' };
  const result = await new ProviderGate(f.repo, { now: () => Date.parse(instant) }).run({
    ...request,
    service: 'vision',
    operation: async () => {
      attempts++;
      return value;
    },
    isErrorResult: (outcome) => outcome.status === 'unavailable',
  });
  assert.equal(result, value);
  assert.equal(attempts, 1);
  assert.deepEqual(f.events, [
    { service: 'vision', event: 'call', at: instant },
    { service: 'vision', event: 'error', at: instant, category: 'INVALID_PROVIDER_RESULT' },
  ]);
});

test('failure to persist classified result errors fails closed', async () => {
  const f = fakeRepository();
  f.repo.recordUsage = async (event) => {
    if (event.event === 'error') throw new Error('Telemetry offline');
    f.events.push(event);
  };
  await assert.rejects(new ProviderGate(f.repo).run({
    ...request,
    operation: async () => 'unavailable',
    isErrorResult: (outcome) => outcome === 'unavailable',
  }), /Telemetry offline/);
  assert.deepEqual(f.events.map((event) => event.event), ['call']);
});
