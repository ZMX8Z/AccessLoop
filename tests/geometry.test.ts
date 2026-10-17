import assert from 'node:assert/strict';
import test from 'node:test';
import type { BBox, Position } from '../src/shared/contracts/common';
import type { AvoidGeometry, LineString } from '../src/shared/contracts/geo';
import { AppError } from '../src/server/http/errors';
import {
  bufferPassage, containsPosition, distanceM, lineIntersectsAvoidance, mergeAvoidances,
  pointInBbox, validateAvoidGeometry, validateReportPassage, validateRouteGeometry,
  validateRegionConfigChange,
} from '../src/features/routing/server/geometry';

// Synthetic geometry only: no field measurement or real route is implied.
const bbox: BBox = [151.22, -33.93, 151.25, -33.90];
const square: AvoidGeometry = { type: 'Polygon', coordinates: [[
  [151.2300, -33.9200], [151.2310, -33.9200], [151.2310, -33.9190],
  [151.2300, -33.9190], [151.2300, -33.9200],
]] };
const hole: Position[] = [[151.2302, -33.9198], [151.2308, -33.9198],
  [151.2308, -33.9192], [151.2302, -33.9192], [151.2302, -33.9198]];
const withHole: AvoidGeometry = { type: 'Polygon', coordinates: [square.coordinates[0] as Position[], hole] };
const line = (...coordinates: Position[]): LineString => ({ type: 'LineString', coordinates });
const passage = line([151.2300, -33.9170], [151.2310, -33.9170]);
function rejectsCode(operation: () => unknown, code: string) {
  assert.throws(operation, (error: unknown) => error instanceof AppError && error.code === code);
}

// Missing closure or topology checks would let malformed public geometry publish.
test('geometry accepts closed boundary-inclusive rings and either winding', () => {
  assert.deepEqual(validateAvoidGeometry(square, bbox), square);
  const reversed = { type: 'Polygon', coordinates: [[...(square.coordinates[0] as Position[])].reverse()] };
  assert.deepEqual(validateAvoidGeometry(reversed, bbox), reversed);
  const boundary: AvoidGeometry = { type: 'Polygon', coordinates: [[
    [151.22, -33.92], [151.2201, -33.92], [151.2201, -33.9199], [151.22, -33.92],
  ]] };
  assert.deepEqual(validateAvoidGeometry(boundary, bbox), boundary);
});

test('geometry rejects open, zero-area, crossing, non-finite and out-of-region rings', () => {
  const invalid: unknown[] = [
    { type: 'Polygon', coordinates: [[...square.coordinates[0]!.slice(0, -1)]] },
    { type: 'Polygon', coordinates: [[[151.23, -33.92], [151.231, -33.92], [151.232, -33.92], [151.23, -33.92]]] },
    { type: 'Polygon', coordinates: [[[151.23, -33.92], [151.231, -33.919], [151.23, -33.919], [151.231, -33.92], [151.23, -33.92]]] },
    { type: 'Polygon', coordinates: [[[NaN, -33.92], [151.231, -33.92], [151.23, -33.919], [NaN, -33.92]]] },
    { type: 'Polygon', coordinates: [[[151.219, -33.92], [151.231, -33.92], [151.23, -33.919], [151.219, -33.92]]] },
    { ...square, privateOwner: 'not-allowed' },
  ];
  for (const geometry of invalid) rejectsCode(() => validateAvoidGeometry(geometry, bbox), 'INVALID_GEOMETRY');
});

test('holes must lie strictly inside their shell without overlapping or nesting', () => {
  assert.deepEqual(validateAvoidGeometry(withHole, bbox), withHole);
  const outside: Position[] = [[151.232, -33.9198], [151.233, -33.9198], [151.233, -33.9192], [151.232, -33.9198]];
  const touching: Position[] = [[151.23, -33.9198], [151.2305, -33.9198], [151.2305, -33.9192], [151.23, -33.9198]];
  const nested: Position[] = [[151.2303, -33.9197], [151.2304, -33.9197], [151.2304, -33.9196], [151.2303, -33.9197]];
  for (const rings of [[square.coordinates[0], outside], [square.coordinates[0], touching], [...withHole.coordinates, nested]]) {
    rejectsCode(() => validateAvoidGeometry({ type: 'Polygon', coordinates: rings }, bbox), 'INVALID_GEOMETRY');
  }
});

test('overlapping components are rejected as an invalid MultiPolygon', () => {
  rejectsCode(() => validateAvoidGeometry({ type: 'MultiPolygon', coordinates: [square.coordinates, square.coordinates] }, bbox), 'INVALID_GEOMETRY');
});

test('area and total vertex protections reject rather than truncate geometry', () => {
  const large = { type: 'Polygon', coordinates: [[[151.22, -33.93], [151.25, -33.93], [151.25, -33.90], [151.22, -33.90], [151.22, -33.93]]] };
  rejectsCode(() => validateAvoidGeometry(large, bbox), 'INVALID_GEOMETRY');
  const ring: Position[] = Array.from({ length: 200 }, (_, i) => [151.235 + 0.0001 * Math.cos(i * Math.PI / 100), -33.915 + 0.0001 * Math.sin(i * Math.PI / 100)]);
  ring.push(ring[0]!);
  rejectsCode(() => validateAvoidGeometry({ type: 'Polygon', coordinates: [ring] }, bbox), 'INVALID_GEOMETRY');
});

test('containment excludes hole interiors but blocks shell and hole boundaries', () => {
  assert.equal(containsPosition([151.2301, -33.9195], withHole), true);
  assert.equal(containsPosition([151.2305, -33.9195], withHole), false);
  assert.equal(containsPosition([151.2302, -33.9195], withHole), true);
  assert.equal(containsPosition([151.2300, -33.9195], withHole), true);
  assert.equal(containsPosition([151.2320, -33.9195], withHole), false);
});

test('line intersections include crossings, contained segments and boundary touches', () => {
  assert.equal(lineIntersectsAvoidance(line([151.229, -33.9195], [151.232, -33.9195]), square), true);
  assert.equal(lineIntersectsAvoidance(line([151.2301, -33.9195], [151.2309, -33.9195]), square), true);
  assert.equal(lineIntersectsAvoidance(line([151.229, -33.9200], [151.230, -33.9200]), square), true);
  assert.equal(lineIntersectsAvoidance(line([151.229, -33.9180], [151.232, -33.9180]), square), false);
  assert.equal(lineIntersectsAvoidance(line([151.2303, -33.9195], [151.2307, -33.9195]), withHole), false);
});

test('metre distances and bbox inclusion preserve coordinate order and exact edges', () => {
  assert.ok(Math.abs(distanceM([0, 0], [0, 1]) - 111195.08) < 0.1);
  assert.equal(distanceM([151.23, -33.92], [151.23, -33.92]), 0);
  assert.equal(pointInBbox([151.22, -33.93], bbox), true);
  assert.equal(pointInBbox([151.25, -33.90], bbox), true);
  assert.equal(pointInBbox([151.21999, -33.92], bbox), false);
  assert.equal(pointInBbox([NaN, -33.92], bbox), false);
});

test('buffers use metres at Sydney latitude and preserve a deterministic narrow footprint', () => {
  const buffered = bufferPassage(passage, 2, bbox);
  assert.deepEqual(bufferPassage(passage, 2, bbox), buffered);
  assert.equal(containsPosition([151.2305, -33.91701], buffered), true);
  assert.equal(containsPosition([151.2305, -33.91703], buffered), false);
  assert.equal(containsPosition([151.22999, -33.917], buffered), true);
  assert.equal(containsPosition([151.22996, -33.917], buffered), false);
});

test('buffers reject unsupported widths, zero-length passages and bounds overflow', () => {
  for (const width of [0.49, 5.01, Infinity, NaN]) rejectsCode(() => bufferPassage(passage, width, bbox), 'INVALID_GEOMETRY');
  rejectsCode(() => bufferPassage(line([151.23, -33.917], [151.23, -33.917]), 2, bbox), 'INVALID_GEOMETRY');
  rejectsCode(() => bufferPassage(line([151.22, -33.917], [151.221, -33.917]), 2, bbox), 'INVALID_GEOMETRY');
});

test('report passage validation measures distance to the full line and rejects beyond 20 metres', () => {
  assert.doesNotThrow(() => validateReportPassage([151.2305, -33.9171], passage, bbox));
  rejectsCode(() => validateReportPassage([151.2305, -33.9172], passage, bbox), 'INVALID_GEOMETRY');
});

test('route geometry checks coverage, snaps, blocked inputs and obstacle crossing', () => {
  assert.doesNotThrow(() => validateRouteGeometry(passage, [151.23, -33.917], [151.231, -33.917], bbox, [square]));
  rejectsCode(() => validateRouteGeometry(passage, [151.23, -33.918], [151.231, -33.917], bbox, []), 'SNAP_TOO_FAR');
  rejectsCode(() => validateRouteGeometry(line([151.219, -33.917], [151.231, -33.917]), [151.23, -33.917], [151.231, -33.917], bbox, []), 'OUT_OF_COVERAGE');
  rejectsCode(() => validateRouteGeometry(line([151.2305, -33.9195], [151.232, -33.9195]), [151.2305, -33.9195], [151.232, -33.9195], bbox, [square]), 'ENDPOINT_BLOCKED');
  rejectsCode(() => validateRouteGeometry(line([151.229, -33.9195], [151.232, -33.9195]), [151.229, -33.9195], [151.232, -33.9195], bbox, [square]), 'NO_ROUTE');
});

test('malformed and degenerate upstream lines never publish as valid routes', () => {
  for (const geometry of [line([151.23, -33.917], [151.23, -33.917]), { type: 'LineString', coordinates: [] }, { type: 'LineString', coordinates: [[151.23, -33.917], [Infinity, -33.917]] }]) {
    rejectsCode(() => validateRouteGeometry(geometry as LineString, [151.23, -33.917], [151.231, -33.917], bbox, []), 'INVALID_GEOMETRY');
  }
});

test('avoidance merging unions overlaps, preserves disjoint components and omits empty avoidance', () => {
  assert.equal(mergeAvoidances([], bbox), undefined);
  const shifted: AvoidGeometry = { type: 'Polygon', coordinates: [(square.coordinates[0] as Position[]).map(([x, y]) => [x + 0.0005, y])] };
  const merged = mergeAvoidances([square, shifted], bbox)!;
  assert.equal(merged.type, 'Polygon');
  assert.equal(containsPosition([151.23125, -33.9195], merged), true);
  const separate: AvoidGeometry = { type: 'Polygon', coordinates: [(square.coordinates[0] as Position[]).map(([x, y]) => [x + 0.005, y])] };
  assert.equal(mergeAvoidances([square, separate], bbox)!.type, 'MultiPolygon');
  rejectsCode(() => mergeAvoidances(Array.from({ length: 21 }, () => square), bbox), 'INVALID_GEOMETRY');
});

test('region impact distinguishes display-independent inputs and invalidates buffer previews', () => {
  const config = { bbox, avoidanceBufferM: 2, presetPassages: [{ id: 'preset-a', geometry: passage }] };
  assert.deepEqual(validateRegionConfigChange(config, config, []), { routingChanged: false, previewsInvalidated: false, changedPassageIds: [] });
  const changed = validateRegionConfigChange(config, { ...config, avoidanceBufferM: 2.5 }, []);
  assert.equal(changed.routingChanged, true);
  assert.equal(changed.previewsInvalidated, true);
});

test('region changes reject lost effective geometry and bound preset confirmations', () => {
  const config = { bbox, avoidanceBufferM: 2, presetPassages: [{ id: 'preset-a', geometry: passage }] };
  const active = [{ reportId: 'report-a', location: [151.2305, -33.917] as Position, geometry: bufferPassage(passage, 2, bbox), presetPassageId: 'preset-a' }];
  for (const next of [{ ...config, bbox: [151.2305, -33.93, 151.25, -33.90] as BBox }, { ...config, presetPassages: [] }, { ...config, presetPassages: [{ id: 'preset-a', geometry: line([151.232, -33.917], [151.233, -33.917]) }] }]) {
    assert.throws(() => validateRegionConfigChange(config, next, active), (error: unknown) => error instanceof AppError && error.code === 'CONFIG_CONFLICT' && (error.details?.reportIds as string[]).includes('report-a'));
  }
  assert.doesNotThrow(() => validateRegionConfigChange(config, { ...config, avoidanceBufferM: 5 }, active));
});

test('merged output enforces total area and vertex limits across individually valid obstacles', () => {
  const rings = [151.229, 151.236].map(center => {
    const ring: Position[] = Array.from({ length: 120 }, (_, i) => [center + 0.0001 * Math.cos(i * Math.PI / 60), -33.915 + 0.0001 * Math.sin(i * Math.PI / 60)]);
    ring.push(ring[0]);
    return { type: 'Polygon' as const, coordinates: [ring] };
  });
  assert.doesNotThrow(() => validateAvoidGeometry(rings[0], bbox));
  assert.doesNotThrow(() => validateAvoidGeometry(rings[1], bbox));
  rejectsCode(() => mergeAvoidances(rings, bbox), 'INVALID_GEOMETRY');
  const areas: AvoidGeometry[] = [
    { type: 'Polygon', coordinates: [[[151.221, -33.929], [151.225, -33.929], [151.225, -33.926], [151.221, -33.926], [151.221, -33.929]]] },
    { type: 'Polygon', coordinates: [[[151.235, -33.919], [151.239, -33.919], [151.239, -33.916], [151.235, -33.916], [151.235, -33.919]]] },
  ];
  for (const geometry of areas) assert.doesNotThrow(() => validateAvoidGeometry(geometry, bbox));
  rejectsCode(() => mergeAvoidances(areas, bbox), 'INVALID_GEOMETRY');
  assert.doesNotThrow(() => mergeAvoidances(Array.from({ length: 20 }, () => square), bbox));
});

test('merging preserves holes and accepts components meeting only at a point', () => {
  const touching: AvoidGeometry = { type: 'Polygon', coordinates: [[[151.231, -33.919], [151.232, -33.919], [151.232, -33.918], [151.231, -33.918], [151.231, -33.919]]] };
  const merged = mergeAvoidances([withHole, touching], bbox)!;
  assert.equal(merged.type, 'MultiPolygon');
  assert.equal(containsPosition([151.2305, -33.9195], merged), false);
  assert.equal(containsPosition([151.2315, -33.9185], merged), true);
  assert.equal(containsPosition([151.231, -33.919], merged), true);
});

test('buffer limits are inclusive and report distance uses endcaps beyond a passage endpoint', () => {
  assert.doesNotThrow(() => bufferPassage(passage, 0.5, bbox));
  assert.doesNotThrow(() => bufferPassage(passage, 5, bbox));
  assert.doesNotThrow(() => validateReportPassage([151.2299, -33.917], passage, bbox));
  rejectsCode(() => validateReportPassage([151.2297, -33.917], passage, bbox), 'INVALID_GEOMETRY');
});
