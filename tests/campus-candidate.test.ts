import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  BBoxSchema, InstantSchema, PlaceSchema, PositionSchema, PresetPassageSchema,
  type BBox, type PlaceDTO, type Position, type PresetPassageDTO,
} from '../src/shared/contracts';
import { normalizeAccessibility } from '../src/features/places/server/accessibility';
import {
  bufferPassage, containsPosition, distanceM, pointInBbox,
} from '../src/features/routing/server/geometry';

interface SourceEvidence {
  source: string;
  sourceId: string;
  sourceVersion: number;
  sourceUpdatedAt: string;
  sourceUrl: string;
  fetchedAt: string;
  rawTags: Record<string, string>;
}
interface CandidateFile {
  fieldValidated: boolean;
  orsValidated: boolean;
  productionReady: boolean;
  isDemo: boolean;
  idStatus: string;
  deploymentPolicy: string;
  investigationBbox: BBox;
  provenance: {
    attribution: string;
    license: string;
    sourceExtract: { url: string; sha256: string; fetchedAt: string; fetchedAtBasis: string; bbox: BBox };
    limitations: string[];
  };
  sourceNodes: (SourceEvidence & { location: Position })[];
  endpointCandidates: Record<'start' | 'end', { candidateId: string; sourceId: string; location: Position }>;
  presetPassageCandidates: PresetPassageDTO[];
  passageSources: (SourceEvidence & {
    candidateId: string; sourceNodeIds: string[]; coordinateOrder: string;
    accessibility: PlaceDTO['accessibility']; rawAccessibility: PlaceDTO['rawAccessibility'];
  })[];
  places: { items: PlaceDTO[]; truncated: boolean };
}
function readCandidate(): CandidateFile {
  const file = new URL('../docs/deployment/campus-candidate.json', import.meta.url);
  assert.ok(existsSync(file), 'The offline campus candidate data must be delivered.');
  return JSON.parse(readFileSync(file, 'utf8')) as CandidateFile;
}

// These values were independently checked against the SHA-pinned OSM XML.
const sourcePassages = [
  {
    id: 'way/1100783040', version: 1, updated: '2022-10-04T07:29:41Z', order: 'forward',
    nodeIds: ['8597065685', '10074506254', '10074506253', '10074506258', '8597065684'],
    coordinates: [[151.2327362, -33.9169865], [151.2327865, -33.9170295],
      [151.2329883, -33.9173558], [151.2330047, -33.9173824], [151.2330348, -33.917431]],
    lengthRangeM: [56, 58],
  },
  {
    id: 'way/1100783041', version: 3, updated: '2025-06-12T06:58:52Z', order: 'reverse',
    nodeIds: ['8597065684', '10074506255', '12908888234', '2763366434', '12908952919', '12908888232', '8597065685'],
    coordinates: [[151.2327362, -33.9169865], [151.2327079, -33.9171655],
      [151.232678, -33.9173069], [151.2326654, -33.9173665], [151.2328181, -33.9173927],
      [151.2329964, -33.9174233], [151.2330348, -33.917431]],
    lengthRangeM: [76, 79],
  },
];
const sourcePlaces: Record<string, { category: PlaceDTO['category']; location: Position }> = {
  'node/977369817': { category: 'entrance', location: [151.2326284, -33.9172492] },
  'node/977369838': { category: 'entrance', location: [151.2327029, -33.9174221] },
  'node/2471034601': { category: 'rest_area', location: [151.23251, -33.9174056] },
  'node/2763398962': { category: 'toilet', location: [151.2326938, -33.9170841] },
  'node/2763398963': { category: 'toilet', location: [151.2326683, -33.9172145] },
  'node/4867512905': { category: 'rest_area', location: [151.2328882, -33.9168383] },
  'node/5565631599': { category: 'entrance', location: [151.2328543, -33.9175396] },
  'node/12908888233': { category: 'entrance', location: [151.2326793, -33.9171582] },
  'node/12908888235': { category: 'entrance', location: [151.2328074, -33.9174376] },
  'node/12908952918': { category: 'entrance', location: [151.2326528, -33.9169469] },
};

test('campus candidate cannot present source research as approved runtime configuration', () => {
  const data = readCandidate();
  assert.equal(data.fieldValidated, false);
  assert.equal(data.orsValidated, false);
  assert.equal(data.productionReady, false);
  assert.equal(data.isDemo, true);
  assert.equal(data.idStatus, 'candidate-only-not-persisted');
  assert.equal(data.deploymentPolicy, 'documentation-only-no-runtime-import');
  assert.equal(data.provenance.attribution, '© OpenStreetMap contributors');
  assert.equal(data.provenance.license, 'ODbL-1.0');
  assert.equal(data.provenance.sourceExtract.sha256, '3a10ba4627a42096a21d716b25d0990d79ece0ae7ecd275aba8a0b48473fd240');
  assert.equal(data.provenance.sourceExtract.url, 'https://api.openstreetmap.org/api/0.6/map?bbox=151.2315,-33.9188,151.2365,-33.9155');
  InstantSchema.parse(data.provenance.sourceExtract.fetchedAt);
  assert.match(data.provenance.sourceExtract.fetchedAtBasis, /filesystem modification time/i);
  assert.ok(data.provenance.limitations.length > 0);
  const view = BBoxSchema.parse(data.investigationBbox);
  const extract = BBoxSchema.parse(data.provenance.sourceExtract.bbox);
  assert.ok(pointInBbox([view[0], view[1]], extract));
  assert.ok(pointInBbox([view[2], view[3]], extract));
});

test('both candidate passages preserve every source way vertex and share the audited endpoints', () => {
  const data = readCandidate();
  const bbox = BBoxSchema.parse(data.investigationBbox);
  assert.equal(data.presetPassageCandidates.length, 2);
  assert.equal(data.passageSources.length, 2);
  assert.deepEqual(data.endpointCandidates.start.location, [151.2327362, -33.9169865]);
  assert.deepEqual(data.endpointCandidates.end.location, [151.2330348, -33.917431]);
  assert.equal(data.endpointCandidates.start.sourceId, 'node/8597065685');
  assert.equal(data.endpointCandidates.end.sourceId, 'node/8597065684');
  for (const expected of sourcePassages) {
    const evidence = data.passageSources.find(item => item.sourceId === expected.id)!;
    assert.ok(evidence, expected.id);
    assert.equal(evidence.sourceVersion, expected.version);
    assert.equal(evidence.sourceUpdatedAt, expected.updated);
    assert.equal(evidence.sourceUrl, `https://api.openstreetmap.org/api/0.6/${expected.id}/${expected.version}`);
    assert.deepEqual(evidence.sourceNodeIds, expected.nodeIds);
    assert.equal(evidence.coordinateOrder, expected.order);
    assert.deepEqual(evidence.rawTags, { highway: 'footway' });
    assert.equal(evidence.accessibility, 'unknown');
    assert.deepEqual(evidence.rawAccessibility, { wheelchair: null, toiletWheelchair: null });
    const passage = PresetPassageSchema.parse(data.presetPassageCandidates.find(item => item.id === evidence.candidateId));
    assert.match(passage.id, /^candidate-/);
    assert.equal(passage.isDemo, true);
    assert.deepEqual(passage.geometry.coordinates, expected.coordinates);
    const orderedIds = expected.order === 'reverse' ? [...expected.nodeIds].reverse() : expected.nodeIds;
    assert.deepEqual(orderedIds.map(id => data.sourceNodes.find(node => node.sourceId === `node/${id}`)?.location), expected.coordinates);
    assert.deepEqual(passage.geometry.coordinates[0], data.endpointCandidates.start.location);
    assert.deepEqual(passage.geometry.coordinates.at(-1), data.endpointCandidates.end.location);
    const length = passage.geometry.coordinates.slice(1).reduce((sum, point, index) => sum + distanceM(passage.geometry.coordinates[index], point), 0);
    assert.ok(length > expected.lengthRangeM[0] && length < expected.lengthRangeM[1]);
    for (const metres of [0.5, 5]) {
      const buffered = bufferPassage(passage.geometry, metres, bbox);
      for (const point of passage.geometry.coordinates) assert.ok(containsPosition(point, buffered));
    }
  }
});

test('candidate POIs use only bounded OSM node coordinates and retain unknown facility accessibility', () => {
  const data = readCandidate();
  assert.equal(data.places.truncated, false);
  assert.equal(data.places.items.length, Object.keys(sourcePlaces).length);
  assert.ok(data.places.items.length <= 100);
  assert.equal(new Set(data.places.items.map(item => item.sourceId)).size, data.places.items.length);
  for (const value of data.places.items) {
    const place = PlaceSchema.parse(value);
    const expected = sourcePlaces[place.sourceId];
    assert.ok(expected, place.sourceId);
    assert.equal(place.source, 'openstreetmap');
    assert.match(place.id, /^candidate-/);
    assert.equal(place.isDemo, true);
    assert.equal(place.category, expected.category);
    assert.deepEqual(place.location, expected.location);
    assert.ok(pointInBbox(place.location, data.investigationBbox));
    const node = data.sourceNodes.find(item => item.sourceId === place.sourceId)!;
    assert.ok(node, place.sourceId);
    assert.deepEqual(place.location, node.location);
    assert.equal(place.fetchedAt, node.fetchedAt);
    assert.deepEqual(place.rawAccessibility, {
      wheelchair: node.rawTags.wheelchair ?? null,
      toiletWheelchair: node.rawTags['toilets:wheelchair'] ?? null,
    });
    assert.equal(place.accessibility, 'unknown');
    assert.equal(normalizeAccessibility(place.category, place.rawAccessibility), 'unknown');
    assert.match(place.name, /^(Entrance|Main entrance|Toilets|Bench)/);
  }
  const privateEntrance = data.places.items.find(item => item.sourceId === 'node/5565631599')!;
  assert.equal(data.sourceNodes.find(item => item.sourceId === privateEntrance.sourceId)?.rawTags.access, 'private');
  assert.match(privateEntrance.accessibilityNote ?? '', /private/);
});

test('selected source node evidence retains version, source time and acquisition time independently', () => {
  const data = readCandidate();
  assert.equal(data.sourceNodes.length, 20);
  assert.equal(new Set(data.sourceNodes.map(item => item.sourceId)).size, data.sourceNodes.length);
  for (const evidence of [...data.sourceNodes, ...data.passageSources]) {
    assert.equal(evidence.source, 'openstreetmap');
    assert.ok(Number.isInteger(evidence.sourceVersion) && evidence.sourceVersion > 0);
    InstantSchema.parse(evidence.sourceUpdatedAt);
    assert.equal(evidence.fetchedAt, data.provenance.sourceExtract.fetchedAt);
    assert.ok(Date.parse(evidence.sourceUpdatedAt) <= Date.parse(evidence.fetchedAt));
    assert.equal(evidence.sourceUrl, `https://api.openstreetmap.org/api/0.6/${evidence.sourceId}/${evidence.sourceVersion}`);
  }
  for (const node of data.sourceNodes) {
    PositionSchema.parse(node.location);
    assert.ok(pointInBbox(node.location, data.investigationBbox));
  }
});

test('normalization cannot promote missing, conflicting or unrecognized tags into access claims', () => {
  for (const [category, raw] of [
    ['entrance', { wheelchair: null, toiletWheelchair: null }],
    ['rest_area', { wheelchair: 'designated', toiletWheelchair: null }],
    ['toilet', { wheelchair: 'yes', toiletWheelchair: null }],
    ['toilet', { wheelchair: 'no', toiletWheelchair: 'yes' }],
  ] as const) assert.equal(normalizeAccessibility(category, raw), 'unknown');
});
