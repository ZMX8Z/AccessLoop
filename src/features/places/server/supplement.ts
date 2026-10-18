import { AppError } from '../../../server/http/errors';
import type { BBox, PlacesResultDTO } from '../../../shared/contracts';
import type { PoiPlaces } from './places';

type PlaceSource = { getPlaces(bbox: BBox): Promise<PoiPlaces> };
const sourceFailures = new Set(['PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'RATE_LIMITED', 'QUOTA_EXHAUSTED', 'INVALID_PROVIDER_RESULT']);

/** Each source owns its durable cache and budget. Partial source failure remains visible. */
export class SupplementedPlacesService {
  constructor(private readonly primary: PlaceSource, private readonly primaryName: 'overpass' | 'heigit', private readonly cloud: PlaceSource | null) {}

  async getPlaces(bbox: BBox): Promise<PlacesResultDTO> {
    const pending = [this.primary.getPlaces(bbox), ...(this.cloud ? [this.cloud.getPlaces(bbox)] : [])];
    const results = await Promise.allSettled(pending);
    for (const result of results) {
      if (result.status === 'rejected' && (!(result.reason instanceof AppError) || !sourceFailures.has(result.reason.code))) throw result.reason;
    }
    if (results.every((result) => result.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
    const sources: NonNullable<PlacesResultDTO['sources']> = results.map((result, index) => ({
      provider: index === 0 ? this.primaryName : 'accessibility.cloud',
      status: result.status === 'fulfilled' ? 'available' : 'unavailable',
    }));
    if (!this.cloud) sources.push({ provider: 'accessibility.cloud', status: 'not_configured' });
    const lists = results.map((result) => result.status === 'fulfilled' ? result.value.items : []);
    const merged = [], seen = new Set<string>();
    for (let index = 0; index < Math.max(...lists.map((list) => list.length)); index++) {
      for (const list of lists) {
        const item = list[index];
        if (!item) continue;
        const identity = `${item.source}/${item.sourceId}`;
        if (!seen.has(identity)) { seen.add(identity); merged.push(item); }
      }
    }
    return {
      items: merged.slice(0, 100),
      truncated: merged.length > 100 || results.some((result) => result.status === 'rejected' || result.value.truncated),
      sources,
    };
  }
}
