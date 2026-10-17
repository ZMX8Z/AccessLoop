import assert from 'node:assert/strict'
import test from 'node:test'

import { RegionPatchInputSchema, RegionAdminDTOSchema } from '../src/shared/contracts/admin-region'
import { dRoutingFixture } from '../src/shared/fixtures/d-routing'

const patch = { expectedVersion: 1, reason: 'Adjust the demonstrator configuration.', changes: { name: 'A renamed area' } }

test('region patches accept only the documented configuration whitelist and require a reason and changes', () => {
  assert.equal(RegionPatchInputSchema.safeParse(patch).success, true)
  assert.equal(RegionPatchInputSchema.safeParse({ ...patch, changes: {} }).success, false)
  assert.equal(RegionPatchInputSchema.safeParse({ ...patch, reason: '   ' }).success, false)
  assert.equal(RegionPatchInputSchema.safeParse({ ...patch, reason: '😀'.repeat(1000) }).success, true)
  assert.equal(RegionPatchInputSchema.safeParse({ ...patch, reason: '😀'.repeat(1001) }).success, false)
  for (const change of [
    { regionId: 'other' }, { hazardVersion: 5 }, { configVersion: 5 }, { personalValiditySec: 5 },
    { publicValiditySec: 5 }, { routing: {} }, { OSS_ACCESS_KEY_SECRET: 'not-accepted' },
  ]) assert.equal(RegionPatchInputSchema.safeParse({ ...patch, changes: change }).success, false)
  assert.equal(RegionPatchInputSchema.safeParse({ ...patch, actor: { role: 'operator' } }).success, false)
})

test('preset replacement distinguishes existing ids from server-generated new ids and rejects client versions', () => {
  const passage = dRoutingFixture.passages[0]
  const entry = { id: passage.id, name: passage.name, geometry: passage.geometry }
  assert.equal(RegionPatchInputSchema.safeParse({ ...patch, changes: { presetPassages: [entry] } }).success, true)
  assert.equal(RegionPatchInputSchema.safeParse({ ...patch, changes: { presetPassages: [{ name: entry.name, geometry: entry.geometry }] } }).success, true)
  assert.equal(RegionPatchInputSchema.safeParse({ ...patch, changes: { presetPassages: [{ ...entry, passageVersion: 10 }] } }).success, false)
  assert.equal(RegionPatchInputSchema.safeParse({ ...patch, changes: { presetPassages: [] } }).success, true)
})

test('region configuration response is a strict DTO and never includes seed metadata or credentials', () => {
  const response = { region: dRoutingFixture.region, presetPassages: dRoutingFixture.passages }
  assert.equal(RegionAdminDTOSchema.safeParse(response).success, true)
  assert.equal(RegionAdminDTOSchema.safeParse({ ...response, secret: 'not-accepted' }).success, false)
  assert.equal(RegionAdminDTOSchema.safeParse({ ...response, region: { ...response.region, seedFingerprint: 'internal' } }).success, false)
})
