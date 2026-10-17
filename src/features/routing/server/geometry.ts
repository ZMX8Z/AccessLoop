import { area } from '@turf/area';
import { buffer } from '@turf/buffer';
import { feature, featureCollection } from '@turf/helpers';
import { union } from '@turf/union';
import { BBoxSchema, PositionSchema, type BBox, type Position } from '../../../shared/contracts/common';
import { AvoidGeometrySchema, LineStringSchema, type AvoidGeometry, type LineString } from '../../../shared/contracts/geo';
import { AppError } from '../../../server/http/errors';

const EARTH_RADIUS_M = 6371008.8;
const COORDINATE_EPSILON = 1e-12;
const MAX_VERTICES = 200;
const MAX_AREA_M2 = 200000;
const MAX_AVOIDANCES = 20;
const radians = (value: number) => value * Math.PI / 180;
const samePosition = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];
const polygons = (geometry: AvoidGeometry): Position[][][] => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
const invalid = (message: string): never => { throw new AppError(400, 'INVALID_GEOMETRY', message); };

export function distanceM(a: Position, b: Position): number {
  if (!PositionSchema.safeParse(a).success || !PositionSchema.safeParse(b).success) return invalid('Coordinates must be finite WGS84 positions.');
  const latitude = radians(b[1] - a[1]);
  const longitude = radians(b[0] - a[0]);
  const value = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(longitude / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.max(0, Math.min(1, value))));
}

export function pointInBbox(point: Position, bbox: BBox): boolean {
  return PositionSchema.safeParse(point).success && BBoxSchema.safeParse(bbox).success &&
    point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3];
}

function cross(a: Position, b: Position, c: Position): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point: Position, a: Position, b: Position): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return Math.abs(cross(a, b, point)) <= COORDINATE_EPSILON * length &&
    point[0] >= Math.min(a[0], b[0]) - COORDINATE_EPSILON && point[0] <= Math.max(a[0], b[0]) + COORDINATE_EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - COORDINATE_EPSILON && point[1] <= Math.max(a[1], b[1]) + COORDINATE_EPSILON;
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return pointOnSegment(c, a, b) || pointOnSegment(d, a, b) || pointOnSegment(a, c, d) || pointOnSegment(b, c, d);
}

// -1 outside, 0 on the boundary, 1 strictly inside. Every boundary is blocked.
function ringLocation(point: Position, ring: Position[]): -1 | 0 | 1 {
  let inside = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (pointOnSegment(point, a, b)) return 0;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? 1 : -1;
}

function polygonLocation(point: Position, polygon: Position[][]): -1 | 0 | 1 {
  const shell = ringLocation(point, polygon[0]);
  if (shell !== 1) return shell;
  for (const hole of polygon.slice(1)) {
    const location = ringLocation(point, hole);
    if (location === 0) return 0;
    if (location === 1) return -1;
  }
  return 1;
}

export function containsPosition(point: Position, geometry: AvoidGeometry): boolean {
  return polygons(geometry).some(polygon => polygonLocation(point, polygon) >= 0);
}

function ringsIntersect(a: Position[], b: Position[]): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
  }
  return false;
}

function validateRing(ring: Position[], bbox: BBox): void {
  if (!samePosition(ring[0], ring[ring.length - 1])) invalid('Polygon rings must be closed.');
  for (let i = 0; i < ring.length - 1; i++) {
    if (!pointInBbox(ring[i], bbox)) invalid('Avoidance geometry must remain inside the configured region.');
    if (samePosition(ring[i], ring[i + 1])) invalid('Polygon rings must not contain zero-length edges.');
    for (let j = i + 1; j < ring.length - 1; j++) {
      if (j === i + 1 || (i === 0 && j === ring.length - 2)) continue;
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) invalid('Polygon rings must not self-intersect or touch themselves.');
    }
  }
  const origin = ring[0];
  let twiceArea = 0;
  for (let i = 1; i < ring.length - 2; i++) twiceArea += cross(origin, ring[i], ring[i + 1]);
  if (Math.abs(twiceArea) < 1e-20) invalid('Polygon rings must have non-zero area.');
}

function polygonInteriorsOverlap(a: Position[][], b: Position[][]): boolean {
  // Components can meet at a point, but cannot share an edge or cross each other.
  for (const aRing of a) for (const bRing of b) {
    for (let i = 0; i < aRing.length - 1; i++) for (let j = 0; j < bRing.length - 1; j++) {
      const p = aRing[i], q = aRing[i + 1], r = bRing[j], s = bRing[j + 1];
      if (!segmentsIntersect(p, q, r, s)) continue;
      const pqR = cross(p, q, r), pqS = cross(p, q, s), rsP = cross(r, s, p), rsQ = cross(r, s, q);
      if (pqR * pqS < 0 && rsP * rsQ < 0) return true;
      if (pointOnSegment(r, p, q) && pointOnSegment(s, p, q)) return true;
      if (pointOnSegment(p, r, s) && pointOnSegment(q, r, s)) return true;
      const candidates = [p, q, r, s].filter(point => pointOnSegment(point, p, q) && pointOnSegment(point, r, s));
      if (candidates.some(point => candidates.some(other => !samePosition(point, other)))) return true;
    }
  }
  return a[0].some(point => polygonLocation(point, b) === 1) || b[0].some(point => polygonLocation(point, a) === 1);
}

export function validateAvoidGeometry(geometry: unknown, bbox: BBox): AvoidGeometry {
  if (!BBoxSchema.safeParse(bbox).success) invalid('The configured region bounds are invalid.');
  const parsed = AvoidGeometrySchema.safeParse(geometry);
  if (!parsed.success) return invalid('Avoidance geometry must be a valid Polygon or MultiPolygon.');
  const result = parsed.data;
  const components = polygons(result);
  if (components.reduce((sum, polygon) => sum + polygon.reduce((count, ring) => count + ring.length, 0), 0) > MAX_VERTICES) invalid('Avoidance geometry exceeds the 200 vertex limit.');
  for (const polygon of components) {
    polygon.forEach(ring => validateRing(ring, bbox));
    for (let i = 1; i < polygon.length; i++) {
      if (ringLocation(polygon[i][0], polygon[0]) !== 1 || ringsIntersect(polygon[0], polygon[i])) invalid('Polygon holes must be strictly inside their shell.');
      for (let j = 1; j < i; j++) {
        if (ringsIntersect(polygon[i], polygon[j]) || ringLocation(polygon[i][0], polygon[j]) >= 0 || ringLocation(polygon[j][0], polygon[i]) >= 0) invalid('Polygon holes must not overlap, nest or touch.');
      }
    }
  }
  for (let i = 0; i < components.length; i++) for (let j = 0; j < i; j++) {
    if (polygonInteriorsOverlap(components[i], components[j])) invalid('MultiPolygon components must not overlap.');
  }
  const totalArea = area(result);
  if (!Number.isFinite(totalArea) || totalArea <= 0 || totalArea > MAX_AREA_M2) invalid('Avoidance geometry must have positive area within the 200000 square metre limit.');
  return result;
}

function validateLine(line: LineString, bbox: BBox, coverageCode = 'INVALID_GEOMETRY'): LineString {
  const parsed = LineStringSchema.safeParse(line);
  if (!parsed.success || !BBoxSchema.safeParse(bbox).success) return invalid('A valid finite LineString is required.');
  if (!parsed.data.coordinates.some(point => !samePosition(point, parsed.data.coordinates[0]))) invalid('A passage or route must have positive length.');
  if (parsed.data.coordinates.some(point => !pointInBbox(point, bbox))) throw new AppError(coverageCode === 'OUT_OF_COVERAGE' ? 422 : 400, coverageCode, 'The passage or route leaves the configured region.');
  return parsed.data;
}

export function bufferPassage(line: LineString, bufferM: number, bbox: BBox): AvoidGeometry {
  validateLine(line, bbox);
  if (!Number.isFinite(bufferM) || bufferM < 0.5 || bufferM > 5) invalid('The avoidance buffer must be between 0.5 and 5 metres.');
  try {
    // Fixed curve resolution keeps preview and confirmation deterministic.
    const buffered = buffer(line, bufferM, { units: 'meters', steps: 4 });
    if (!buffered) return invalid('The selected passage could not be buffered.');
    return validateAvoidGeometry(buffered.geometry, bbox);
  } catch (error) {
    if (error instanceof AppError) throw error;
    return invalid('The selected passage could not be buffered.');
  }
}

function bearing(a: Position, b: Position): number {
  const delta = radians(b[0] - a[0]), aLatitude = radians(a[1]), bLatitude = radians(b[1]);
  return Math.atan2(Math.sin(delta) * Math.cos(bLatitude), Math.cos(aLatitude) * Math.sin(bLatitude) - Math.sin(aLatitude) * Math.cos(bLatitude) * Math.cos(delta));
}

function pointToSegmentDistanceM(point: Position, a: Position, b: Position): number {
  const segmentM = distanceM(a, b);
  if (segmentM === 0) return distanceM(point, a);
  const angular = distanceM(a, point) / EARTH_RADIUS_M;
  const deltaBearing = bearing(a, point) - bearing(a, b);
  const along = Math.atan2(Math.sin(angular) * Math.cos(deltaBearing), Math.cos(angular)) * EARTH_RADIUS_M;
  if (along <= 0) return distanceM(point, a);
  if (along >= segmentM) return distanceM(point, b);
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, Math.sin(angular) * Math.sin(deltaBearing))))) * EARTH_RADIUS_M;
}

export function validateReportPassage(location: Position, line: LineString, bbox: BBox, maxDistanceM = 20): void {
  validateLine(line, bbox);
  if (!pointInBbox(location, bbox) || !Number.isFinite(maxDistanceM) || maxDistanceM <= 0) invalid('A report location and passage distance inside the configured region are required.');
  let nearest = Infinity;
  for (let i = 0; i < line.coordinates.length - 1; i++) nearest = Math.min(nearest, pointToSegmentDistanceM(location, line.coordinates[i], line.coordinates[i + 1]));
  if (nearest > maxDistanceM) invalid('The report location must be within 20 metres of the selected passage.');
}

export function lineIntersectsAvoidance(line: LineString, geometry: AvoidGeometry): boolean {
  if (line.coordinates.some(point => containsPosition(point, geometry))) return true;
  for (const polygon of polygons(geometry)) for (const ring of polygon) {
    for (let i = 0; i < line.coordinates.length - 1; i++) for (let j = 0; j < ring.length - 1; j++) {
      if (segmentsIntersect(line.coordinates[i], line.coordinates[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

export function validateRouteGeometry(line: LineString, start: Position, end: Position, bbox: BBox, avoidances: AvoidGeometry[], maxSnapM = 50): void {
  validateLine(line, bbox, 'OUT_OF_COVERAGE');
  if (!pointInBbox(start, bbox) || !pointInBbox(end, bbox)) throw new AppError(422, 'OUT_OF_COVERAGE', 'Choose route endpoints inside the configured region.');
  if (!Number.isFinite(maxSnapM) || maxSnapM < 0) invalid('The configured route snapping distance is invalid.');
  // This also enforces the combined obstacle, area and vertex limits.
  const merged = mergeAvoidances(avoidances, bbox);
  if (merged && (containsPosition(start, merged) || containsPosition(end, merged))) throw new AppError(422, 'ENDPOINT_BLOCKED', 'A route endpoint is inside an active avoidance. Choose another entrance.');
  if (distanceM(start, line.coordinates[0]) > maxSnapM || distanceM(end, line.coordinates[line.coordinates.length - 1]) > maxSnapM) throw new AppError(422, 'SNAP_TOO_FAR', 'The route snapped too far from the selected endpoints.');
  if (merged && lineIntersectsAvoidance(line, merged)) throw new AppError(422, 'NO_ROUTE', 'The returned route intersects an active avoidance.');
}

export function mergeAvoidances(geometries: AvoidGeometry[], bbox: BBox): AvoidGeometry | undefined {
  if (geometries.length === 0) return undefined;
  if (geometries.length > MAX_AVOIDANCES) invalid('The active avoidance set exceeds the 20 obstacle limit.');
  const validated = geometries.map(geometry => validateAvoidGeometry(geometry, bbox));
  if (validated.length === 1) return validated[0];
  try {
    const merged = union(featureCollection(validated.map(geometry => feature(geometry))));
    if (!merged) return invalid('The active avoidance set could not be merged.');
    return validateAvoidGeometry(merged.geometry, bbox);
  } catch (error) {
    if (error instanceof AppError) throw error;
    return invalid('The active avoidance set could not be merged.');
  }
}

export type RegionGeometryConfig = {
  bbox: BBox;
  avoidanceBufferM: number;
  presetPassages: { id: string; geometry: LineString }[];
};
export type ActiveGeometryBinding = {
  reportId: string;
  location: Position;
  geometry: AvoidGeometry;
  presetPassageId?: string;
};
export type RegionGeometryImpact = {
  routingChanged: boolean;
  previewsInvalidated: boolean;
  changedPassageIds: string[];
};

export function validateRegionConfigChange(current: RegionGeometryConfig, next: RegionGeometryConfig, activeData: ActiveGeometryBinding[]): RegionGeometryImpact {
  if (!BBoxSchema.safeParse(next.bbox).success || !Number.isFinite(next.avoidanceBufferM) || next.avoidanceBufferM < 0.5 || next.avoidanceBufferM > 5) invalid('The region bounds and avoidance buffer must be valid.');
  const currentPassages = new Map(current.presetPassages.map(passage => [passage.id, passage]));
  const nextPassages = new Map(next.presetPassages.map(passage => [passage.id, passage]));
  if (nextPassages.size !== next.presetPassages.length || next.presetPassages.some(passage => !passage.id)) invalid('Preset passage identifiers must be unique and nonempty.');
  const changedPassageIds = [...new Set([...currentPassages.keys(), ...nextPassages.keys()])].filter(id => JSON.stringify(currentPassages.get(id)?.geometry) !== JSON.stringify(nextPassages.get(id)?.geometry)).sort();
  const conflicts = activeData.filter(binding => {
    if (!pointInBbox(binding.location, next.bbox)) return true;
    try { validateAvoidGeometry(binding.geometry, next.bbox); } catch { return true; }
    return !!binding.presetPassageId && changedPassageIds.includes(binding.presetPassageId);
  }).map(binding => binding.reportId);
  if (conflicts.length) throw new AppError(409, 'CONFIG_CONFLICT', 'Resolve the affected active reports before changing this configuration.', { reportIds: [...new Set(conflicts)].sort() });
  for (const passage of next.presetPassages) {
    validateLine(passage.geometry, next.bbox);
    bufferPassage(passage.geometry, next.avoidanceBufferM, next.bbox);
  }
  const routingChanged = JSON.stringify(current.bbox) !== JSON.stringify(next.bbox) || current.avoidanceBufferM !== next.avoidanceBufferM || changedPassageIds.length > 0;
  return { routingChanged, previewsInvalidated: routingChanged, changedPassageIds };
}
