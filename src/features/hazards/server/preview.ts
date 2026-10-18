import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

import { resolvePassage } from '@/features/routing/server/service'
import type { RoutingRepository } from '@/features/routing/server/repository'
import { AppError } from '@/server/http/errors'
import { assertSessionSecret } from '@/server/auth/session-cookie'
import { fingerprint } from '@/server/storage/value'
import type { LineString } from '@/shared/contracts/geo'
import { PreviewDTOSchema, type PreviewInput } from '@/shared/contracts/hazards'
import type { RegionRecord } from '@/shared/contracts/storage'

import type { ReportRecord } from './records'
import type { VisionConfiguration } from './repository'

const GEOMETRY_ALGORITHM_VERSION = 'd-bufferPassage-turf-7.3.1-v1'
const TokenSchema = z.strictObject({
  version: z.literal(1), issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().positive(),
  binding: z.string().regex(/^[a-f0-9]{64}$/),
})

export function stalePreview(): never {
  throw new AppError(409, 'PREVIEW_STALE', 'This preview has expired or changed. Review the area again before confirming.')
}

function signature(payload: string, secret: string) {
  assertSessionSecret(secret)
  return createHmac('sha256', secret).update(`accessloop:personal-preview:v1:${payload}`).digest('base64url')
}

export function issuePreviewToken(input: { binding: unknown; now: number; expiresAt: number; secret: string }) {
  const payload = Buffer.from(JSON.stringify(TokenSchema.parse({
    version: 1, issuedAt: input.now, expiresAt: input.expiresAt, binding: fingerprint(input.binding),
  }))).toString('base64url')
  return `${payload}.${signature(payload, input.secret)}`
}

export function readPreviewToken(input: { token: string; now: number; secret: string }) {
  if (input.token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(input.token)) return stalePreview()
  const [payload, actual] = input.token.split('.')
  const expected = signature(payload, input.secret)
  if (!timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return stalePreview()
  let raw: unknown
  try { raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) }
  catch { return stalePreview() }
  const parsed = TokenSchema.safeParse(raw)
  if (!parsed.success) return stalePreview()
  const token = parsed.data
  if (token.issuedAt > input.now || token.expiresAt <= input.now || token.expiresAt > token.issuedAt + 300_000) return stalePreview()
  return token
}

export function verifyPreviewToken(input: { token: string; binding: unknown; now: number; secret: string }) {
  const token = readPreviewToken(input)
  if (token.binding !== fingerprint(input.binding)) return stalePreview()
  return token
}

export async function calculatePreview(input: {
  report: ReportRecord; region: RegionRecord; ownerSessionHash: string; request: PreviewInput
  repository: RoutingRepository; visionConfiguration: VisionConfiguration; now: () => number
}) {
  const observedAt = Date.parse(input.request.observedAt)
  const now = input.now()
  if (observedAt > now) throw new AppError(400, 'INVALID_INPUT', 'The observation time cannot be in the future.')
  const validUntil = observedAt + input.region.personalValiditySec * 1000
  if (!Number.isSafeInteger(validUntil) || validUntil <= now) {
    throw new AppError(400, 'INVALID_INPUT', 'Choose a recent observation time before confirming avoidance.')
  }
  const avoidGeometry = await resolvePassage(
    input.repository, input.ownerSessionHash, input.request.passage, input.report.facts.location, now,
  )
  let geometry: LineString
  let routeExpiry = Infinity
  let referencedGeometry: unknown
  if ('routeRef' in input.request.passage) {
    const route = await input.repository.getRouteReference(input.ownerSessionHash, input.request.passage.routeRef)
    if (!route) return stalePreview()
    geometry = {
      type: 'LineString', coordinates: route.geometry.coordinates.slice(input.request.passage.startIndex, input.request.passage.endIndex + 1),
    }
    routeExpiry = Date.parse(route.expiresAt)
    referencedGeometry = route
  } else {
    const reference = input.request.passage
    const preset = (await input.repository.getPassages()).find((candidate) =>
      candidate.id === reference.presetPassageId && candidate.passageVersion === reference.passageVersion)
    if (!preset) return stalePreview()
    geometry = preset.geometry
    referencedGeometry = preset
  }
  const expiresAt = Math.min(input.now() + 300_000, routeExpiry, validUntil)
  if (expiresAt <= input.now()) return stalePreview()
  const binding = {
    ownerSessionHash: input.ownerSessionHash,
    regionId: input.region.id,
    reportId: input.report.id,
    reportVersion: input.report.rowVersion,
    photoId: input.report.facts.photoId,
    analysisId: input.report.facts.analysisId,
    location: input.report.facts.location,
    request: input.request,
    referencedGeometry,
    configVersion: input.region.configVersion,
    bbox: input.region.bbox,
    avoidanceBufferM: input.region.avoidanceBufferM,
    personalValiditySec: input.region.personalValiditySec,
    visionConfiguration: input.visionConfiguration,
    algorithmVersion: GEOMETRY_ALGORITHM_VERSION,
    avoidGeometry,
    validUntil: new Date(validUntil).toISOString(),
  }
  return { binding, avoidGeometry, geometry, validUntil: new Date(validUntil).toISOString(), expiresAt }
}

export async function createPreview(input: Parameters<typeof calculatePreview>[0] & { secret: string }) {
  const calculated = await calculatePreview(input)
  const generatedAt = input.now()
  if (calculated.expiresAt <= generatedAt) return stalePreview()
  const previewDigest = issuePreviewToken({
    binding: calculated.binding, now: generatedAt, expiresAt: Math.min(calculated.expiresAt, generatedAt + 300_000), secret: input.secret,
  })
  return PreviewDTOSchema.parse({
    ...input.request,
    configVersion: input.region.configVersion,
    avoidGeometry: calculated.avoidGeometry,
    validUntil: calculated.validUntil,
    previewDigest,
    expiresAt: new Date(calculated.expiresAt).toISOString(),
  })
}
