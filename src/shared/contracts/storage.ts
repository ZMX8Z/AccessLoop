import { z } from 'zod'

import { IdSchema, VersionSchema } from './common'
import { AvoidGeometrySchema as PublicAvoidGeometrySchema, LineStringSchema } from './geo'
import { InstantSchema, PresetPassageSchema, RegionSchema as PublicRegionSchema } from './region'
import { PassageRefSchema } from './routing'

export { InstantSchema, LineStringSchema, PresetPassageSchema }
export const SessionHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const AvoidGeometrySchema = PublicAvoidGeometrySchema.refine((geometry) => {
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
  return rings.every((ring) => ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1])
}, 'Polygon rings must be closed.')
export const RegionSchema = PublicRegionSchema.refine(({ routing }) =>
  routing.supportedRestrictions.maximum_incline.includes(routing.defaultRestrictions.maximum_incline)
  && routing.supportedRestrictions.maximum_sloped_kerb.includes(routing.defaultRestrictions.maximum_sloped_kerb)
  && routing.supportedRestrictions.minimum_width.includes(routing.defaultRestrictions.minimum_width)
  && routing.supportedRestrictions.maximum_incline.every((value) => value >= 0)
  && routing.supportedRestrictions.maximum_sloped_kerb.every((value) => value >= 0)
  && routing.supportedRestrictions.minimum_width.every((value) => value > 0),
{ message: 'Default restrictions must be in the valid supported options.', path: ['routing'] })
export const RegionSeedSchema = z.strictObject({
  region: RegionSchema,
  presetPassages: z.array(PresetPassageSchema).min(1),
  source: z.strictObject({ kind: z.enum(['synthetic', 'field_verified']), note: z.string().trim().min(1).max(1000) }),
}).superRefine(({ region, presetPassages, source }, ctx) => {
  if (new Set(presetPassages.map(({ id }) => id)).size !== presetPassages.length) {
    ctx.addIssue({ code: 'custom', path: ['presetPassages'], message: 'Passage IDs must be unique.' })
  }
  if (source.kind === 'synthetic' && !region.isDemo) {
    ctx.addIssue({ code: 'custom', path: ['region', 'isDemo'], message: 'Synthetic data must be marked as demo.' })
  }
  for (const [index, passage] of presetPassages.entries()) {
    if (passage.isDemo !== region.isDemo) {
      ctx.addIssue({ code: 'custom', path: ['presetPassages', index, 'isDemo'], message: 'Passages inherit the region demo flag.' })
    }
    const [west, south, east, north] = region.bbox
    if (passage.geometry.coordinates.some(([lon, lat]) => lon < west || lon > east || lat < south || lat > north)) {
      ctx.addIssue({ code: 'custom', path: ['presetPassages', index, 'geometry'], message: 'Passages must stay within the configured region.' })
    }
  }
})

export const PublicAvoidanceSchema = z.strictObject({
  id: IdSchema,
  publicRevision: VersionSchema,
  publicAvoidGeometry: AvoidGeometrySchema,
  validUntil: InstantSchema,
})
export const PersonalAvoidanceSchema = z.strictObject({
  id: IdSchema,
  rowVersion: VersionSchema,
  confirmationReportVersion: VersionSchema,
  avoidGeometry: AvoidGeometrySchema,
  validUntil: InstantSchema,
})
export const PublicSnapshotSchema = z.strictObject({
  status: z.enum(['verified', 'resolved', 'rejected']),
  publicRevision: VersionSchema,
  publicAvoidGeometry: AvoidGeometrySchema,
  validUntil: InstantSchema,
})
export const RouteSnapshotSchema = z.strictObject({
  routeRef: IdSchema,
  ownerSessionHash: SessionHashSchema,
  regionId: IdSchema,
  geometry: LineStringSchema,
  createdAt: InstantSchema,
  expiresAt: InstantSchema,
})
export const ProviderServiceSchema = z.enum(['ors_directions', 'vision', 'geocoding', 'poi'])
export const ProviderBudgetSchema = z.strictObject({
  service: ProviderServiceSchema,
  keyFingerprint: SessionHashSchema,
  windows: z.array(z.strictObject({ seconds: z.number().int().positive(), limit: z.number().int().positive() })).min(1),
})
export const ReportStatusSchema = z.enum(['pending', 'ai_assessed', 'verified', 'resolved', 'rejected'])
export const PersonalConfirmationSchema = z.strictObject({
  passage: PassageRefSchema,
  geometry: LineStringSchema,
})

export type RegionRecord = z.infer<typeof RegionSchema>
export type PresetPassageRecord = z.infer<typeof PresetPassageSchema>
export type RegionSeed = z.infer<typeof RegionSeedSchema>
export type PublicAvoidance = z.infer<typeof PublicAvoidanceSchema>
export type PersonalAvoidance = z.infer<typeof PersonalAvoidanceSchema>
export type RouteSnapshot = z.infer<typeof RouteSnapshotSchema>
export type ProviderService = z.infer<typeof ProviderServiceSchema>
export type ProviderBudget = z.infer<typeof ProviderBudgetSchema>
export type LineString = z.infer<typeof LineStringSchema>
export type JsonValue = z.infer<ReturnType<typeof z.json>>
