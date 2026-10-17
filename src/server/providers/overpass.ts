import { createHash } from 'node:crypto';
import { z } from 'zod';

import { normalizeAccessibility } from '../../features/places/server/accessibility';
import { pointInBbox } from '../../features/routing/server/geometry';
import { BBoxSchema, type BBox } from '../../shared/contracts/common';
import { PlaceSchema, type PlaceDTO } from '../../shared/contracts/region';
import { AppError } from '../http/errors';
import { ProviderError, invalidProviderResult } from './provider-error';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const MAX_RESPONSE_BYTES = 1_048_576;
const TagsSchema = z.object({
  name: z.string().trim().max(2000).optional(), amenity: z.string().trim().max(100).optional(),
  entrance: z.string().trim().max(100).optional(), wheelchair: z.string().max(100).optional(),
  'toilets:wheelchair': z.string().max(100).optional(),
});
const LocationSchema = z.object({ lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180) });
const ElementSchema = z.discriminatedUnion('type', [
  LocationSchema.extend({ type: z.literal('node'), id: z.number().int().positive().safe(), tags: TagsSchema.optional() }),
  z.object({ type: z.literal('way'), id: z.number().int().positive().safe(), center: LocationSchema, tags: TagsSchema.optional() }),
  z.object({ type: z.literal('relation'), id: z.number().int().positive().safe(), center: LocationSchema, tags: TagsSchema.optional() }),
]);
const ResponseSchema = z.object({ elements: z.array(ElementSchema).max(102), remark: z.never().optional() });

function unavailable(retryable: boolean): ProviderError {
  return new ProviderError(503, 'PROVIDER_UNAVAILABLE', 'The place data service is unavailable. Please try again later.', { retryable });
}
function timeout(): ProviderError {
  return new ProviderError(504, 'PROVIDER_TIMEOUT', 'The place data service took too long to respond.', { retryable: true });
}
function responseError(response: Response, now: number): ProviderError {
  if (response.status === 429) {
    const header = response.headers.get('Retry-After') ?? '';
    const seconds = /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : (Date.parse(header) - now) / 1000;
    const retryAfterSec = Number.isFinite(seconds) && seconds >= 0 ? Math.min(3600, Math.max(1, Math.ceil(seconds))) : 60;
    return new ProviderError(429, 'RATE_LIMITED', 'Please wait before requesting place data again.', { retryable: true, retryAfterSec });
  }
  if (response.status === 408 || response.status === 504) return timeout();
  if (response.status === 400) return new ProviderError(400, 'INVALID_INPUT', 'The place data service could not process the selected area.', { retryable: false });
  return unavailable(response.status >= 500);
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
      await reader.cancel();
      throw invalidProviderResult();
    }
    while (true) {
      if (signal.aborted) throw timeout();
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw invalidProviderResult(); }
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

function category(tags: z.infer<typeof TagsSchema> | undefined): PlaceDTO['category'] {
  if (tags?.amenity === 'toilets') return 'toilet';
  if (tags?.amenity === 'bench' || tags?.amenity === 'shelter') return 'rest_area';
  if (tags?.entrance && tags.entrance !== 'no') return 'entrance';
  return 'other';
}

/** One public-service attempt. ProviderGate owns persistent budgets and retries. */
export function createOverpassAdapter(options: {
  fetch?: typeof fetch; baseUrl?: string; now?: () => number; timeoutMs?: number;
} = {}) {
  try {
    const url = new URL(options.baseUrl ?? ENDPOINT);
    if (url.href !== ENDPOINT || url.username || url.password || url.search || url.hash) throw unavailable(false);
  } catch { throw unavailable(false); }
  const timeoutMs = options.timeoutMs ?? 8000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw unavailable(false);
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  return {
    identity: `overpass:osm-places-v1:${ENDPOINT}`,
    keyFingerprint: `sha256:${createHash('sha256').update(`public:${ENDPOINT}`).digest('hex')}`,
    timeoutMs,
    async fetchPlaces(bbox: BBox, isDemo: boolean): Promise<{ items: PlaceDTO[]; truncated: boolean }> {
      if (!BBoxSchema.safeParse(bbox).success || typeof isDemo !== 'boolean') throw new AppError(400, 'INVALID_INPUT', 'Choose a valid place search area.');
      const [west, south, east, north] = bbox;
      const area = `${south},${west},${north},${east}`;
      // Overpass QL: bounded union, center coordinates and at most 102 source elements.
      const query = `[out:json][timeout:8][maxsize:16777216];(nwr["amenity"~"^(toilets|bench|shelter)$"](${area});nwr["entrance"](${area});nwr["wheelchair"](${area}););out center 102;`;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(timeout()); }, timeoutMs);
      });
      const perform = async () => {
        let response: Response;
        try {
          response = await fetcher(ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json' },
            body: new URLSearchParams({ data: query }), signal: controller.signal, redirect: 'error', cache: 'no-store',
          });
        } catch { throw controller.signal.aborted ? timeout() : unavailable(true); }
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
        const items: PlaceDTO[] = [];
        const seen = new Set<string>();
        const fetchedAt = new Date(now()).toISOString();
        for (const element of parsed.data.elements) {
          const position = element.type === 'node' ? element : element.center;
          const location: [number, number] = [position.lon, position.lat];
          if (!pointInBbox(location, bbox)) continue;
          const sourceId = `${element.type}/${element.id}`;
          if (seen.has(sourceId)) continue;
          seen.add(sourceId);
          const mappedCategory = category(element.tags);
          const rawAccessibility = {
            wheelchair: element.tags?.wheelchair ?? null, toiletWheelchair: element.tags?.['toilets:wheelchair'] ?? null,
          };
          const name = element.tags?.name || `OpenStreetMap ${mappedCategory.replace('_', ' ')} (${sourceId})`;
          items.push(PlaceSchema.parse({
            id: `osm-${element.type}-${element.id}`, sourceId, source: 'openstreetmap',
            name: name.slice(0, 120).replace(/[\uD800-\uDBFF]$/u, ''), category: mappedCategory, location,
            accessibility: normalizeAccessibility(mappedCategory, rawAccessibility), accessibilityNote: null,
            fetchedAt, isDemo, rawAccessibility,
          }));
          if (items.length === 101) break;
        }
        return { items, truncated: parsed.data.elements.length >= 101 };
      };
      try { return await Promise.race([perform(), deadline]); }
      finally { clearTimeout(timer); }
    },
  };
}
