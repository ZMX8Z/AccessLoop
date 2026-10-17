import assert from 'node:assert/strict';
import test from 'node:test';
import {
  summarizeUsage,
  readUsageSummary,
} from '../src/server/providers/usage';
import { fakeRepository, instant } from './routing-support';
test('usage counts actual sanitized events in rolling 24h, separate from budget balance', () => {
  const at = instant;
  const result = summarizeUsage(
    [
      { service: 'ors', event: 'call', at },
      { service: 'ors', event: 'call', at },
      { service: 'ors', event: 'error', at },
      { service: 'ors', event: 'wait', at },
      { service: 'ors', event: 'cacheHit', at },
      { service: 'vision', event: 'call', at },
      { service: 'geocoding', event: 'call', at },
      { service: 'ors', event: 'call', at: '2026-10-15T00:00:00Z' },
      { service: 'ors', event: 'call', at: '2026-10-18T00:00:00Z' },
    ],
    Date.parse(instant),
  );
  assert.deepEqual(result.services.ors, {
    calls: 2,
    waits: 1,
    errors: 1,
    cacheHits: 1,
  });
  assert.deepEqual(result.services.vision, {
    calls: 1,
    waits: 0,
    errors: 0,
    cacheHits: 0,
  });
});
test('summary asks the repository for exactly the current 24h and validates it', async () => {
  const f = fakeRepository();
  const result = await readUsageSummary(f.repo, Date.parse(instant));
  assert.equal(result.windowEnd, instant);
  assert.equal(result.windowStart, '2026-10-16T00:00:00.000Z');
  f.repo.getUsageSummary = async () => ({
    windowStart: instant,
    windowEnd: instant,
    services: {
      ors: { calls: 0, waits: 0, errors: 0, cacheHits: 0 },
      vision: { calls: 0, waits: 0, errors: 0, cacheHits: 0 },
    },
  });
  await assert.rejects(readUsageSummary(f.repo, Date.parse(instant)));
});
