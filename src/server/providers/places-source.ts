import { AppError } from '../http/errors';
import { createPoiAdapter } from './poi';
import { createOverpassAdapter } from './overpass';

/** Deployment configuration chooses a fixed source; request parameters never select a proxy. */
export function createPlacesAdapter(environment: Record<string, string | undefined>, options: {fetch?: typeof fetch} = {}) {
  const provider = environment.POI_PROVIDER?.trim() || 'overpass';
  if (provider === 'overpass') return createOverpassAdapter({baseUrl: environment.OVERPASS_BASE_URL?.trim() || undefined, ...options});
  if (provider === 'heigit') return createPoiAdapter({apiKey: environment.ORS_API_KEY ?? '', baseUrl: environment.POI_BASE_URL?.trim() || undefined, ...options});
  throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The place source is not configured correctly.');
}
