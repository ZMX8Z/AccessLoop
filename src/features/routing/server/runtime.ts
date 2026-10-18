import { AppError } from '../../../server/http/errors';
import { createOrsAdapter } from '../../../server/providers/ors';
import { createGeocodingAdapter } from '../../../server/providers/geocoding';
import { SearchService } from '../../places/server/search';
import { configuredFacilities } from '../../../server/providers/facility-sources';
import { RoutingService } from './service';
import { createRoutingHandlers } from './handlers';
import type { RoutingRepository } from './repository';

type Registry = {
  factory?: () => Promise<RoutingRepository>;
  handlers?: Promise<ReturnType<typeof createRoutingHandlers>>;
};
const globalRegistry = globalThis as typeof globalThis & {
  __accessloopRoutingRegistry?: Registry;
};
const registry = () => (globalRegistry.__accessloopRoutingRegistry ??= {});
/** C calls once at server initialization with its shared Payload repository factory.
 * This is intentionally unavailable until the real repository is installed.
 */
export function installRoutingRepository(
  factory: () => Promise<RoutingRepository>,
): void {
  const state = registry();
  if (state.factory && state.factory !== factory)
    throw new Error('Routing repository is already installed');
  state.factory = factory;
}
function limit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}
export async function routingHandlers() {
  const state = registry();
  const factory = state.factory;
  if (!factory)
    throw new AppError(
      503,
      'PROVIDER_UNAVAILABLE',
      'Routing data is not configured yet.',
    );
  if (!state.handlers) {
    state.handlers = (async () => {
      const repository = await factory();
      const ors = createOrsAdapter({
        apiKey: process.env.ORS_API_KEY ?? '',
        baseUrl: process.env.ORS_BASE_URL,
      });
      const geocoding = createGeocodingAdapter({
        apiKey: process.env.ORS_API_KEY ?? '',
        baseUrl: process.env.GEOCODING_BASE_URL,
      });
      const routes = new RoutingService(repository, ors, {
        policy: {
          minuteLimit: limit('ORS_RPM', 30),
          dayLimit: limit('ORS_DAILY_BUDGET', 1800),
        },
      });
      const search = new SearchService(repository, geocoding, {
        policy: {
          minuteLimit: limit('GEOCODING_RPM', 60),
          dayLimit: limit('GEOCODING_DAILY_BUDGET', 2500),
        },
      });
      const places = configuredFacilities(repository, process.env, { minuteLimit: limit('POI_RPM', 10), dayLimit: limit('POI_DAILY_BUDGET', 450) });
      const applicationOrigin = process.env.APP_BASE_URL
        ? new URL(process.env.APP_BASE_URL).origin
        : '';
      return createRoutingHandlers({
        repository,
        routes,
        search,
        places,
        applicationOrigin,
        requireProvider: () => {
          if (!process.env.ORS_API_KEY?.trim())
            throw new AppError(
              503,
              'PROVIDER_UNAVAILABLE',
              'The route and search service is not configured.',
            );
        },
      });
    })().catch((error) => {
      state.handlers = undefined;
      throw error;
    });
  }
  return state.handlers;
}
