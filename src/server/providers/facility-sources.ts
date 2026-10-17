import { PlacesService } from '../../features/places/server/places';
import { SupplementedPlacesService } from '../../features/places/server/supplement';
import type { RoutingRepository } from '../../features/routing/server/repository';
import { AppError } from '../http/errors';
import { createAccessibilityCloudAdapter } from './accessibility-cloud';
import { createPlacesAdapter } from './places-source';

function list(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(item))) throw new Error();
    return [...new Set(value)] as string[];
  } catch { throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The facility source selection is not configured.'); }
}

export function configuredFacilities(repository: RoutingRepository, environment: Readonly<Record<string, string | undefined>>, policy: {minuteLimit: number; dayLimit: number}) {
  const primary = new PlacesService(repository, createPlacesAdapter(environment), { policy });
  const primaryName = environment.POI_PROVIDER?.trim() === 'heigit' ? 'heigit' : 'overpass';
  let cloud: PlacesService | undefined;
  const configured = !!environment.ACCESSIBILITY_CLOUD_APP_TOKEN?.trim() && !!environment.ACCESSIBILITY_CLOUD_LICENSE_IDS?.trim()
    && environment.ACCESSIBILITY_CLOUD_LICENSE_IDS.trim() !== '[]';
  // Lazy validation keeps an optional source's configuration failure out of routing/search initialization.
  const supplement = configured ? { getPlaces: async (bbox: Parameters<PlacesService['getPlaces']>[0]) => {
    cloud ??= new PlacesService(repository, createAccessibilityCloudAdapter({
      appToken: environment.ACCESSIBILITY_CLOUD_APP_TOKEN!.trim(),
      sourceIds: list(environment.ACCESSIBILITY_CLOUD_SOURCE_IDS), licenseIds: list(environment.ACCESSIBILITY_CLOUD_LICENSE_IDS),
    }), { policy });
    return cloud.getPlaces(bbox);
  } } : null;
  return new SupplementedPlacesService(primary, primaryName, supplement);
}
