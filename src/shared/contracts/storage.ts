import { z } from 'zod'

import { BBoxSchema, IdSchema, PositionSchema, VersionSchema } from './common'
import { PassageRefSchema, RestrictionsSchema } from './routing'

export const InstantSchema = z.iso.datetime()
export const SessionHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const LineStringSchema = z.strictObject({
  type: z.literal('LineString'),
  coordinates: z.array(PositionSchema).min(2),
})
const RingSchema = z.array(PositionSchema).min(4).refine((ring) => {
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1]
}, 'Polygon rings must be closed.')
export const AvoidGeometrySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('Polygon'), coordinates: z.array(RingSchema).min(1) }),
  z.strictObject({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(RingSchema).min(1)).min(1) }),
])
const RestrictionOptionsSchema = z.strictObject({
  maximum_incline: z.array(z.number().finite().nonnegative()).min(1),
  maximum_sloped_kerb: z.array(z.number().finite().nonnegative()).min(1),
  minimum_width: z.array(z.number().finite().positive()).min(1),
})
export const RegionSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  bbox: BBoxSchema,
  timezone: z.string().refine((value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
  }, 'A valid IANA timezone is required.'),
  isDemo: z.boolean(),
  hazardVersion: z.number().int().nonnegative(),
  configVersion: VersionSchema,
  personalValiditySec: z.number().int().positive(),
  publicValiditySec: z.number().int().positive(),
  avoidanceBufferM: z.number().finite().min(0.5).max(5),
  routing: z.strictObject({
    profile: z.literal('wheelchair'),
    defaultRestrictions: RestrictionsSchema,
    supportedRestrictions: RestrictionOptionsSchema,
  }),
}).refine(({ routing }) =>
  routing.supportedRestrictions.maximum_incline.includes(routing.defaultRestrictions.maximum_incline)
  && routing.supportedRestrictions.maximum_sloped_kerb.includes(routing.defaultRestrictions.maximum_sloped_kerb)
  && routing.supportedRestrictions.minimum_width.includes(routing.defaultRestrictions.minimum_width),
{ message: 'Default restrictions must be in the supported options.', path: ['routing'] })

export const PresetPassageSchema = z.strictObject({
  id: IdSchema,
  passageVersion: VersionSchema,
  name: z.string().trim().min(1).max(120),
  geometry: LineStringSchema,
  isDemo: z.boolean(),
})
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
