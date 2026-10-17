import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  AvoidGeometrySchema,
  InstantSchema,
  RegionSchema,
} from '../../../shared/contracts';
import type { RoutingContextDTO } from '../../../shared/contracts';
import type {
  PersonalAvoidance,
  PublicAvoidance,
  RoutingSnapshot,
} from './repository';
import { validateAvoidGeometry } from './geometry';

export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value))
    return '[' + value.map(canonicalJSON).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonicalJSON(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function digest(value: unknown): string {
  return (
    'sha256:' + createHash('sha256').update(canonicalJSON(value)).digest('hex')
  );
}
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
export type EffectiveContext = {
  context: RoutingContextDTO;
  publicDigest: string;
  publicAvoidances: PublicAvoidance[];
  personalAvoidances: PersonalAvoidance[];
};
export function evaluateContext(
  snapshot: RoutingSnapshot,
  now: number,
): EffectiveContext {
  const region = RegionSchema.parse(snapshot.region);
  const publicCandidates = z
    .array(
      z.strictObject({
        id: z.string().min(1),
        publicRevision: z.number().int().positive(),
        publicAvoidGeometry: AvoidGeometrySchema,
        validUntil: InstantSchema,
        status: z.enum(['verified', 'pending', 'resolved', 'rejected']),
      }),
    )
    .parse(snapshot.publicAvoidances);
  const personalCandidates = z
    .array(
      z.strictObject({
        id: z.string().min(1),
        rowVersion: z.number().int().positive(),
        confirmationReportVersion: z.number().int().positive(),
        avoidGeometry: AvoidGeometrySchema,
        validUntil: InstantSchema,
        active: z.boolean(),
        reportStatus: z.enum([
          'pending',
          'ai_assessed',
          'verified',
          'resolved',
          'rejected',
        ]),
      }),
    )
    .parse(snapshot.personalAvoidances);
  if (
    !Number.isSafeInteger(snapshot.personalVersion) ||
    snapshot.personalVersion < 0
  )
    throw new Error('Invalid snapshot version');
  const publicAvoidances = publicCandidates
    .filter((x) => x.status === 'verified' && Date.parse(x.validUntil) > now)
    .sort(byId);
  const personalAvoidances = personalCandidates
    .filter(
      (x) =>
        x.active &&
        Date.parse(x.validUntil) > now &&
        x.rowVersion === x.confirmationReportVersion &&
        !['resolved', 'rejected'].includes(x.reportStatus),
    )
    .sort(byId);
  for (const x of publicAvoidances) {
    if (!Number.isSafeInteger(x.publicRevision) || x.publicRevision < 1)
      throw new Error('Invalid public revision');
    validateAvoidGeometry(x.publicAvoidGeometry, region.bbox);
  }
  for (const x of personalAvoidances)
    validateAvoidGeometry(x.avoidGeometry, region.bbox);
  const configuration = {
    id: region.id,
    bbox: region.bbox,
    configVersion: region.configVersion,
    avoidanceBufferM: region.avoidanceBufferM,
    routing: region.routing,
  };
  const publicItems = publicAvoidances.map(
    ({ id, publicRevision, publicAvoidGeometry, validUntil }) => ({
      id,
      publicRevision,
      publicAvoidGeometry,
      validUntil,
    }),
  );
  const personalItems = personalAvoidances.map(
    ({
      id,
      rowVersion,
      confirmationReportVersion,
      avoidGeometry,
      validUntil,
    }) => ({
      id,
      rowVersion,
      confirmationReportVersion,
      avoidGeometry,
      validUntil,
    }),
  );
  const expiry = [...publicAvoidances, ...personalAvoidances].map((x) =>
    Date.parse(x.validUntil),
  );
  return {
    publicAvoidances,
    personalAvoidances,
    publicDigest: digest({ configuration, publicItems }),
    context: {
      regionId: region.id,
      hazardVersion: region.hazardVersion,
      personalVersion: snapshot.personalVersion,
      configVersion: region.configVersion,
      activeDigest: digest({ configuration, publicItems, personalItems }),
      nextExpiryAt: expiry.length
        ? new Date(Math.min(...expiry)).toISOString()
        : null,
      evaluatedAt: new Date(now).toISOString(),
    },
  };
}
export function contextsMatch(
  a: RoutingContextDTO,
  b: RoutingContextDTO,
): boolean {
  return (
    a.regionId === b.regionId &&
    a.hazardVersion === b.hazardVersion &&
    a.personalVersion === b.personalVersion &&
    a.configVersion === b.configVersion &&
    a.activeDigest === b.activeDigest
  );
}
