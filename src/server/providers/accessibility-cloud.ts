import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { PoiAdapter } from '../../features/places/server/places';
import { pointInBbox } from '../../features/routing/server/geometry';
import { BBoxSchema, PositionSchema, type BBox } from '../../shared/contracts/common';
import { PlaceSchema, type PlaceDTO } from '../../shared/contracts/region';
import { AppError } from '../http/errors';
import { ProviderError, invalidProviderResult } from './provider-error';

const ENDPOINT = 'https://accessibility-cloud-v2.freetls.fastly.net/place-infos.json';
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_MERCATOR_LATITUDE = 85.0511287798066;
const IdentifierSchema = z.string().trim().min(1).max(200);
const LocalizedNameSchema = z.union([
  z.string().max(2000),
  z.record(z.string().max(35).regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/), z.string().max(2000))
    .refine((names) => Object.keys(names).length <= 50),
]);
const FeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({ type: z.literal('Point'), coordinates: PositionSchema }),
  properties: z.object({
    _id: IdentifierSchema, sourceId: IdentifierSchema,
    originalId: z.string().max(500).nullable().optional(),
    name: LocalizedNameSchema.nullable().optional(),
    category: z.string().max(200).nullable().optional(),
    accessibility: z.unknown().optional(),
  }),
});
const ResponseSchema = z.object({
  type: z.literal('FeatureCollection'), features: z.array(FeatureSchema).max(101),
  featureCount: z.number().int().nonnegative().optional(), totalFeatureCount: z.number().int().nonnegative().optional(),
  related: z.object({
    sources: z.record(z.string(), z.unknown()).optional(),
    licenses: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});
const SourceSchema = z.object({
  _id: IdentifierSchema.optional(), name: z.string().trim().max(300), licenseId: IdentifierSchema,
  attribution: z.string().trim().max(1000).nullable().optional(),
});
const LicenseSchema = z.object({
  _id: IdentifierSchema, name: z.string().trim().min(1).max(300),
  websiteURL: z.unknown().optional(), fullTextURL: z.unknown().optional(),
});

function unavailable(retryable: boolean): ProviderError {
  return new ProviderError(503, 'PROVIDER_UNAVAILABLE', 'The facility data service is unavailable. Please try again later.', { retryable });
}
function timeout(): ProviderError {
  return new ProviderError(504, 'PROVIDER_TIMEOUT', 'The facility data service took too long to respond.', { retryable: true });
}
function responseError(response: Response, now: number): ProviderError {
  if (response.status === 429) {
    const header = response.headers.get('Retry-After') ?? '';
    const seconds = /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : (Date.parse(header) - now) / 1000;
    const retryAfterSec = Number.isFinite(seconds) && seconds >= 0 ? Math.min(3600, Math.max(1, Math.ceil(seconds))) : 60;
    return new ProviderError(429, 'RATE_LIMITED', 'Please wait before requesting facility data again.', { retryable: true, retryAfterSec });
  }
  if (response.status === 408 || response.status === 504) return timeout();
  // accessibility.cloud 402 denotes source privileges, not a documented quota signal.
  return unavailable(response.status >= 500);
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function own(value: Record<string, unknown> | undefined, key: string): unknown {
  return value && Object.hasOwn(value, key) ? value[key] : undefined;
}
function boolean(value: unknown): boolean | null { return typeof value === 'boolean' ? value : null; }
function wheelchairEvidence(accessibility: unknown): { accessible: boolean | null; partiallyAccessible: boolean | null } {
  const facts = record(accessibility);
  return {
    accessible: boolean(record(facts?.accessibleWith)?.wheelchair),
    partiallyAccessible: boolean(record(facts?.partiallyAccessibleWith)?.wheelchair),
  };
}
function accessibility(evidence: ReturnType<typeof wheelchairEvidence>): PlaceDTO['accessibility'] {
  if (evidence.accessible === true && evidence.partiallyAccessible === true) return 'unknown';
  if (evidence.partiallyAccessible === true) return 'limited';
  if (evidence.accessible === true) return 'yes';
  if (evidence.accessible === false) return 'no';
  return 'unknown';
}
/** ac-format names can be plain strings or locale dictionaries; keep their values inert text. */
function facilityName(value: z.infer<typeof LocalizedNameSchema> | null | undefined, featureId: string): string {
  const clean = (text: string) => text.replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const priority = (locale: string) => locale.toLowerCase() === 'en' ? 0 : locale.toLowerCase() === 'en-au' ? 1 : 2;
  const candidates = typeof value === 'string' ? [value] : Object.entries(value ?? {}).sort(([left], [right]) => {
    const difference = priority(left) - priority(right);
    if (difference) return difference;
    // ASCII order makes the fallback independent of response order and host locale.
    const first = left.toLowerCase();
    const second = right.toLowerCase();
    return first < second ? -1 : first > second ? 1 : left < right ? -1 : left > right ? 1 : 0;
  }).map(([, name]) => name);
  const name = candidates.map(clean).find(Boolean) || `Facility (${featureId})`;
  // PlaceSchema's max length is UTF-16 based; never leave half of a surrogate pair.
  return name.slice(0, 120).replace(/[\uD800-\uDBFF]$/u, '');
}
function category(value: string | null | undefined): PlaceDTO['category'] {
  if (value === 'toilets') return 'toilet';
  if (value === 'entrance' || value === 'entrances') return 'entrance';
  if (value === 'bench' || value === 'shelter' || value === 'rest_area') return 'rest_area';
  return 'other';
}
function licenseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function configuredIds(value: string[]): string[] {
  const parsed = z.array(z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)).max(100).safeParse(value);
  if (!parsed.success) throw unavailable(false);
  return Array.from(new Set(parsed.data)).sort();
}

/** One tile contains the whole configured region; the result is filtered to its bbox again. */
function containingTile(bbox: BBox): { x: number; y: number; z: number } {
  const [west, south, east, north] = bbox;
  const longitude = (value: number) => (value + 180) / 360;
  const latitude = (value: number) => (1 - Math.asinh(Math.tan(value * Math.PI / 180)) / Math.PI) / 2;
  for (let z = 16; z >= 0; z--) {
    const count = 2 ** z;
    const clamp = (value: number) => Math.max(0, Math.min(count - 1, value));
    const leadingTile = (value: number) => clamp(Math.floor(value * count));
    // A closed bbox ending exactly at a tile edge is contained by that tile.
    const trailingTile = (value: number) => clamp(Math.ceil(value * count) - 1);
    const x = leadingTile(longitude(west));
    const y = leadingTile(latitude(north));
    if (x === trailingTile(longitude(east)) && y === trailingTile(latitude(south))) return { x, y, z };
  }
  return { x: 0, y: 0, z: 0 };
}

async function readJSON(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw invalidProviderResult();
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    const declared = response.headers.get('Content-Length');
    if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw invalidProviderResult();
    }
    while (true) {
      if (signal.aborted) throw timeout();
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel().catch(() => {}); throw invalidProviderResult(); }
      chunks.push(part.value);
    }
    if (signal.aborted) throw timeout();
  } catch (error) {
    if (signal.aborted) throw timeout();
    if (error instanceof ProviderError) throw error;
    throw unavailable(true);
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw invalidProviderResult(); }
}

/** One HTTP attempt only. PlacesService/ProviderGate own durable budgets and retries. */
export function createAccessibilityCloudAdapter(options: {
  appToken: string; sourceIds?: string[]; licenseIds: string[];
  fetch?: typeof fetch; now?: () => number; timeoutMs?: number;
}): PoiAdapter & { readonly source: 'accessibility.cloud' } {
  const appToken = typeof options.appToken === 'string' ? options.appToken.trim() : '';
  const sourceIds = configuredIds(options.sourceIds ?? []);
  const licenseIds = configuredIds(options.licenseIds);
  const timeoutMs = options.timeoutMs ?? 8000;
  if (!appToken || appToken.length > 4096 || !licenseIds.length || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000) throw unavailable(false);
  const tokenHash = digest(appToken);
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  return {
    source: 'accessibility.cloud',
    identity: `accessibility.cloud:facilities-v1:${digest(JSON.stringify({ tokenHash, sourceIds, licenseIds }))}`,
    keyFingerprint: `sha256:${tokenHash}`, timeoutMs,
    async fetchPlaces(bbox: BBox, isDemo: boolean): Promise<{ items: PlaceDTO[]; truncated: boolean }> {
      if (!BBoxSchema.safeParse(bbox).success || typeof isDemo !== 'boolean'
        || bbox[1] < -MAX_MERCATOR_LATITUDE || bbox[3] > MAX_MERCATOR_LATITUDE) {
        throw new AppError(400, 'INVALID_INPUT', 'Choose a valid facility search area.');
      }
      const tile = containingTile(bbox);
      const url = new URL(ENDPOINT);
      url.search = new URLSearchParams({
        appToken, x: String(tile.x), y: String(tile.y), z: String(tile.z), limit: '101',
        includePlacesWithoutAccessibility: '1', includeRelated: 'source,source.license',
        ...(sourceIds.length ? { includeSourceIds: sourceIds.join(',') } : {}),
      }).toString();
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(timeout()); }, timeoutMs);
      });
      const perform = async () => {
        let response: Response;
        try {
          response = await fetcher(url, {
            method: 'GET', headers: { Accept: 'application/geo+json, application/json' },
            signal: controller.signal, redirect: 'error', cache: 'no-store',
          });
        } catch { throw controller.signal.aborted ? timeout() : unavailable(true); }
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => {});
          throw timeout();
        }
        if (response.redirected || (response.status >= 300 && response.status < 400)) {
          void response.body?.cancel().catch(() => {});
          throw unavailable(false);
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw responseError(response, now());
        }
        const parsed = ResponseSchema.safeParse(await readJSON(response, controller.signal));
        if (!parsed.success) throw invalidProviderResult();
        const data = parsed.data;
        let truncated = data.features.length >= 101 || (data.totalFeatureCount ?? 0) > data.features.length || (data.featureCount ?? 0) > data.features.length;
        const fetchedAt = new Date(now()).toISOString();
        const items: PlaceDTO[] = [];
        const seen = new Set<string>();
        for (const feature of data.features) {
          const properties = feature.properties;
          if (!pointInBbox(feature.geometry.coordinates, bbox)) continue;
          const source = SourceSchema.safeParse(own(data.related?.sources, properties.sourceId));
          if ((sourceIds.length && !sourceIds.includes(properties.sourceId)) || !source.success
            || (source.data._id && source.data._id !== properties.sourceId) || !licenseIds.includes(source.data.licenseId)) {
            truncated = true; continue;
          }
          const license = LicenseSchema.safeParse(own(data.related?.licenses, source.data.licenseId));
          if (!license.success || license.data._id !== source.data.licenseId) { truncated = true; continue; }
          const id = `ac-${digest(JSON.stringify([properties.sourceId, properties._id]))}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const evidence = wheelchairEvidence(properties.accessibility);
          items.push(PlaceSchema.parse({
            id, source: 'accessibility.cloud', sourceId: properties._id,
            name: facilityName(properties.name, properties._id),
            category: category(properties.category), location: feature.geometry.coordinates,
            accessibility: accessibility(evidence), accessibilityNote: null, fetchedAt, isDemo,
            rawAccessibility: { wheelchair: null, toiletWheelchair: null },
            sourceMetadata: {
              provider: 'accessibility.cloud', datasetId: properties.sourceId, datasetName: source.data.name || properties.sourceId,
              originalId: properties.originalId?.trim() || null, licenseId: source.data.licenseId, licenseName: license.data.name,
              licenseUrl: licenseUrl(license.data.websiteURL) ?? licenseUrl(license.data.fullTextURL),
              attribution: source.data.attribution || null, rawWheelchair: evidence,
            },
          }));
        }
        return { items, truncated };
      };
      try { return await Promise.race([perform(), deadline]); }
      finally { clearTimeout(timer); }
    },
  };
}
