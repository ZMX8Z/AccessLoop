import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../src/app/(frontend)/api/health/route';
import {
  BBoxSchema,
  HealthResponseSchema,
  IdSchema,
  PassageRefSchema,
  PositionSchema,
  RestrictionsSchema,
  RouteInputSchema,
  VersionSchema,
} from '../src/shared/contracts';
import {
  fixtureBBox,
  fixtureMetadata,
  fixturePresetPassageRef,
  fixtureRouteInput,
  fixtureRoutePassageRef,
} from '../src/shared/fixtures/contract-examples';

test('positions accept WGS84 boundaries in longitude, latitude order', () => {
  assert.deepEqual(PositionSchema.parse([-180, -90]), [-180, -90]);
  assert.deepEqual(PositionSchema.parse([180, 90]), [180, 90]);
  assert.deepEqual(PositionSchema.parse([151, -33]), [151, -33]);
});

test('positions reject non-finite values, out-of-range coordinates and extra dimensions', () => {
  for (const input of [
    [181, 0], [-181, 0], [0, 91], [0, -91],
    [Infinity, 0], [0, -Infinity], [NaN, 0], ['151', -33],
    [0], [0, 0, 0],
  ]) {
    assert.equal(PositionSchema.safeParse(input).success, false);
  }
});

test('bounding boxes require finite coordinates and increasing west/east and south/north', () => {
  assert.deepEqual(BBoxSchema.parse([-180, -90, 180, 90]), [-180, -90, 180, 90]);
  for (const input of [
    [1, 0, 1, 1], [2, 0, 1, 1], [0, 1, 1, 1], [0, 2, 1, 1],
    [-181, 0, 1, 1], [0, -91, 1, 1], [0, 0, 181, 1], [0, 0, 1, 91],
    [0, 0, Infinity, 1], [0, 0, 1, NaN], [0, 0, 1, 1, 2],
  ]) {
    assert.equal(BBoxSchema.safeParse(input).success, false);
  }
});

test('opaque identifiers are nonempty and persisted versions start at one', () => {
  assert.equal(IdSchema.parse('fixture-id'), 'fixture-id');
  assert.equal(IdSchema.safeParse('').success, false);
  assert.equal(VersionSchema.parse(1), 1);
  for (const input of [0, -1, 1.5, Infinity, '1']) {
    assert.equal(VersionSchema.safeParse(input).success, false);
  }
});

test('passage references accept either route indices or a versioned preset', () => {
  assert.deepEqual(PassageRefSchema.parse({ routeRef: 'fixture-route', startIndex: 0, endIndex: 1 }), {
    routeRef: 'fixture-route', startIndex: 0, endIndex: 1,
  });
  assert.deepEqual(PassageRefSchema.parse({ presetPassageId: 'fixture-preset', passageVersion: 1 }), {
    presetPassageId: 'fixture-preset', passageVersion: 1,
  });
});

test('passage references reject mixed variants, arbitrary geometry and invalid index/version bounds', () => {
  for (const input of [
    {},
    { routeRef: 'fixture-route', startIndex: 0, endIndex: 1, presetPassageId: 'fixture-preset', passageVersion: 1 },
    { routeRef: 'fixture-route', startIndex: 0, endIndex: 1, coordinates: [[0, 0], [1, 1]] },
    { routeRef: 'fixture-route', startIndex: -1, endIndex: 1 },
    { routeRef: 'fixture-route', startIndex: 0.5, endIndex: 1 },
    { routeRef: 'fixture-route', startIndex: 0, endIndex: 1.5 },
    { routeRef: 'fixture-route', startIndex: 1, endIndex: 1 },
    { routeRef: 'fixture-route', startIndex: 2, endIndex: 1 },
    { presetPassageId: 'fixture-preset', passageVersion: 0 },
    { presetPassageId: 'fixture-preset', passageVersion: 1.5 },
    { presetPassageId: 'fixture-preset', passageVersion: 1, extra: true },
  ]) {
    assert.equal(PassageRefSchema.safeParse(input).success, false);
  }
});

test('restrictions require every finite numeric field and reject unknown keys', () => {
  for (const input of [
    {},
    { maximum_incline: 6, maximum_sloped_kerb: 0.06 },
    { maximum_incline: Infinity, maximum_sloped_kerb: 0.06, minimum_width: 0.9 },
    { maximum_incline: 6, maximum_sloped_kerb: NaN, minimum_width: 0.9 },
    { maximum_incline: 6, maximum_sloped_kerb: 0.06, minimum_width: '0.9' },
    { maximum_incline: 6, maximum_sloped_kerb: 0.06, minimum_width: 0.9, avoid_steps: true },
  ]) {
    assert.equal(RestrictionsSchema.safeParse(input).success, false);
  }
});

test('structural route validation does not pretend to validate the configured region whitelist', () => {
  const input = {
    start: [0, 0], end: [0.001, 0.001], profile: 'wheelchair',
    restrictions: { maximum_incline: 8, maximum_sloped_kerb: 0.1, minimum_width: 1.2 },
  };
  assert.deepEqual(RouteInputSchema.parse(input), input);
});

test('route inputs require all fields without injecting defaults', () => {
  for (const field of ['start', 'end', 'profile', 'restrictions'] as const) {
    const input: Record<string, unknown> = { ...fixtureRouteInput };
    delete input[field];
    assert.equal(RouteInputSchema.safeParse(input).success, false);
  }
  assert.equal(RouteInputSchema.safeParse({ ...fixtureRouteInput, profile: 'walking' }).success, false);
  assert.equal(RouteInputSchema.safeParse({ ...fixtureRouteInput, start: [0, 91] }).success, false);
});

test('route inputs reject client-supplied region, avoidance geometry and version fields', () => {
  for (const extra of [
    { regionId: 'fixture-region' },
    { avoid_polygons: [] },
    { personalReportIds: [] },
    { hazardVersion: 1 },
    { cacheScope: 'public' },
  ]) {
    assert.equal(RouteInputSchema.safeParse({ ...fixtureRouteInput, ...extra }).success, false);
  }
});

test('synthetic examples stay explicitly marked and satisfy only their input contracts', () => {
  assert.equal(fixtureMetadata.isFixture, true);
  assert.equal(fixtureMetadata.measured, false);
  assert.match(fixtureMetadata.description, /synthetic/i);
  assert.equal(RouteInputSchema.safeParse(fixtureRouteInput).success, true);
  assert.equal(BBoxSchema.safeParse(fixtureBBox).success, true);
  assert.equal(PassageRefSchema.safeParse(fixtureRoutePassageRef).success, true);
  assert.equal(PassageRefSchema.safeParse(fixturePresetPassageRef).success, true);
});

test('health returns only the liveness status with an uncached matching request identifier', async () => {
  const response = GET();
  const body: unknown = await response.json();
  const parsed = HealthResponseSchema.parse(body);

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(parsed).sort(), ['data', 'requestId']);
  assert.deepEqual(parsed.data, { status: 'ok' });
  assert.equal(response.headers.get('X-Request-Id'), parsed.requestId);
  assert.match(response.headers.get('Cache-Control') ?? '', /(?:^|,\s*)no-store(?:,|$)/);
  assert.match(response.headers.get('Content-Type') ?? '', /^application\/json\b/);
  assert.match(parsed.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('health generates a fresh request identifier for each response', async () => {
  const first = HealthResponseSchema.parse(await GET().json());
  const second = HealthResponseSchema.parse(await GET().json());
  assert.notEqual(first.requestId, second.requestId);
});
