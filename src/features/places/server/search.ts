import { z } from 'zod';
import { AppError } from '../../../server/http/errors';
import { ProviderGate } from '../../../server/providers/gate';
import {
  RegionSchema,
  SearchQuerySchema,
  SearchResultSchema,
} from '../../../shared/contracts';
import type { BBox, SearchResultDTO } from '../../../shared/contracts';
import { digest } from '../../routing/server/context';
import { pointInBbox } from '../../routing/server/geometry';
import type { RoutingRepository } from '../../routing/server/repository';
export type SearchAdapter = {
  identity: string;
  keyFingerprint: string;
  search(query: string, bbox: BBox): Promise<SearchResultDTO[]>;
};
const CachedSearch = z.strictObject({
  items: z.array(SearchResultSchema).max(5),
  expiresAt: z.iso.datetime(),
});
export class SearchService {
  private readonly inFlight = new Map<string, Promise<SearchResultDTO[]>>();
  private readonly now: () => number;
  private readonly gate: ProviderGate;
  private readonly policy: { minuteLimit: number; dayLimit: number };
  constructor(
    private readonly repository: RoutingRepository,
    private readonly adapter: SearchAdapter,
    options: {
      now?: () => number;
      gate?: ProviderGate;
      policy?: { minuteLimit: number; dayLimit: number };
    } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.gate = options.gate ?? new ProviderGate(repository, { now: this.now });
    this.policy = options.policy ?? { minuteLimit: 60, dayLimit: 2500 };
  }
  async search(
    raw: string,
  ): Promise<{ query: string; items: SearchResultDTO[] }> {
    const parsed = SearchQuerySchema.safeParse(raw);
    if (!parsed.success)
      throw new AppError(
        400,
        'INVALID_INPUT',
        'Enter between 2 and 100 characters.',
      );
    const query = parsed.data;
    let cleanup: (() => void) | undefined;
    try {
      const region = RegionSchema.parse(await this.repository.getRegion());
      const key = digest({
        adapter: this.adapter.identity,
        regionId: region.id,
        bbox: region.bbox,
        configVersion: region.configVersion,
        query,
      });
      const cached = CachedSearch.safeParse(
        await this.repository.getCache(key),
      );
      let items: SearchResultDTO[];
      let hit = false;
      if (cached.success && Date.parse(cached.data.expiresAt) > this.now()) {
        items = cached.data.items;
        hit = true;
      } else {
        const existing = this.inFlight.get(key);
        if (existing) {
          items = await existing;
          hit = true;
        } else {
          const request = this.gate.run({
            service: 'geocoding',
            keyFingerprint: this.adapter.keyFingerprint,
            policy: this.policy,
            operation: async () => {
              const results = z
                .array(SearchResultSchema)
                .max(100)
                .safeParse(await this.adapter.search(query, region.bbox));
              if (!results.success)
                throw new AppError(
                  502,
                  'INVALID_PROVIDER_RESULT',
                  'The search service returned an invalid result.',
                );
              return results.data
                .filter((item) => pointInBbox(item.location, region.bbox))
                .slice(0, 5);
            },
          });
          this.inFlight.set(key, request);
          cleanup = () => {
            if (this.inFlight.get(key) === request) this.inFlight.delete(key);
          };
          items = await request;
        }
      }
      const latest = RegionSchema.parse(await this.repository.getRegion());
      if (
        latest.id !== region.id ||
        latest.configVersion !== region.configVersion ||
        digest(latest.bbox) !== digest(region.bbox)
      )
        throw new AppError(
          409,
          'ROUTE_STALE',
          'The search area has changed. Please search again.',
        );
      if (hit)
        await this.repository.recordUsage({
          service: 'geocoding',
          event: 'cacheHit',
          at: new Date(this.now()).toISOString(),
        });
      else {
        const expiresAt = new Date(this.now() + 300000).toISOString();
        await this.repository.putCache(key, { items, expiresAt }, expiresAt);
      }
      return { query, items };
    } finally {
      cleanup?.();
    }
  }
}
