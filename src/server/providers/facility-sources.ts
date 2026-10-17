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
  const configured = !!environment.ACCESSIBILITY_CLOUD_APP_TOKEN?.trim() && !!environment.ACCESSIBILITY_CLOUD_LICENSE_IDS?.trim()
    && environment.ACCESSIBILITY_CLOUD_LICENSE_IDS.trim() !== '[]';
  let combined: SupplementedPlacesService | undefined;
  // Validate on the places request, before either provider runs. Other services may initialize independently.
  return { getPlaces: async (bbox: Parameters<PlacesService['getPlaces']>[0]) => {
    if (!combined) {
      const cloud = configured ? new PlacesService(repository, createAccessibilityCloudAdapter({
        appToken: environment.ACCESSIBILITY_CLOUD_APP_TOKEN!.trim(),
        sourceIds: list(environment.ACCESSIBILITY_CLOUD_SOURCE_IDS), licenseIds: list(environment.ACCESSIBILITY_CLOUD_LICENSE_IDS),
      }), { policy }) : null;
      combined = new SupplementedPlacesService(primary, primaryName, cloud);
    }
    return combined.getPlaces(bbox);
  } };
}
