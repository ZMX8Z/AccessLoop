import assert from 'node:assert/strict'
import test from 'node:test'

import { RegionSeedSchema, SessionHashSchema, AvoidGeometrySchema, type RegionSeed } from '../src/shared/contracts/storage'
import { fingerprint } from '../src/server/storage/value'

const seed: RegionSeed = {
  region: {
    id: 'fixture-region', name: 'Synthetic test region', bbox: [0, 0, 1, 1],
    timezone: 'Australia/Sydney', isDemo: true, configVersion: 1, hazardVersion: 0,
    personalValiditySec: 3600, publicValiditySec: 86400, avoidanceBufferM: 2,
    routing: {
      profile: 'wheelchair',
      defaultRestrictions: { maximum_incline: 6, maximum_sloped_kerb: 0.06, minimum_width: 0.9 },
      supportedRestrictions: { maximum_incline: [6], maximum_sloped_kerb: [0.06], minimum_width: [0.9] },
    },
  },
  presetPassages: [{
    id: 'fixture-passage', name: 'Synthetic test passage', passageVersion: 1, isDemo: true,
    geometry: { type: 'LineString', coordinates: [[0.1, 0.1], [0.2, 0.2]] },
  }],
  source: { kind: 'synthetic', note: 'Contract test only; no field survey.' },
}

test('seed data cannot masquerade as live coverage or use outside passages', () => {
  assert.equal(RegionSeedSchema.safeParse(seed).success, true)
  assert.equal(RegionSeedSchema.safeParse({ ...seed, region: { ...seed.region, isDemo: false } }).success, false)
  assert.equal(RegionSeedSchema.safeParse({ ...seed, presetPassages: [{ ...seed.presetPassages[0], geometry: { type: 'LineString', coordinates: [[0.1, 0.1], [2, 2]] } }] }).success, false)
})

test('seed data rejects duplicate passage ids, invalid timezone and unsupported defaults', () => {
  assert.equal(RegionSeedSchema.safeParse({ ...seed, presetPassages: [...seed.presetPassages, ...seed.presetPassages] }).success, false)
  assert.equal(RegionSeedSchema.safeParse({ ...seed, region: { ...seed.region, timezone: 'Not/AZone' } }).success, false)
  assert.equal(RegionSeedSchema.safeParse({ ...seed, region: { ...seed.region, routing: { ...seed.region.routing, defaultRestrictions: { maximum_incline: 99, maximum_sloped_kerb: 0.06, minimum_width: 0.9 } } } }).success, false)
})

test('session storage accepts only derived SHA-256 identifiers, never cookie material', () => {
  assert.equal(SessionHashSchema.safeParse('a'.repeat(64)).success, true)
  assert.equal(SessionHashSchema.safeParse('opaque-token.signature').success, false)
})

test('basic persisted polygons reject unclosed rings and nonfinite coordinates', () => {
  assert.equal(AvoidGeometrySchema.safeParse({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }).success, false)
  assert.equal(AvoidGeometrySchema.safeParse({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [Infinity, 1], [0, 0]]] }).success, false)
})

test('idempotency fingerprints ignore JSON key order but distinguish submitted values', () => {
  assert.equal(fingerprint({ observedAt: 'now', position: { lon: 1, lat: 2 } }), fingerprint({ position: { lat: 2, lon: 1 }, observedAt: 'now' }))
  assert.notEqual(fingerprint({ amount: 1 }), fingerprint({ amount: 2 }))
})
