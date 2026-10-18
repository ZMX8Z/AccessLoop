import type { PlaceDTO } from '../../../shared/contracts';
/** OSM labels describe the facility, never the route leading to it. */
export function normalizeAccessibility(
  category: PlaceDTO['category'],
  raw: PlaceDTO['rawAccessibility'],
): PlaceDTO['accessibility'] {
  const values: Record<string, PlaceDTO['accessibility']> = {
    yes: 'yes',
    limited: 'limited',
    no: 'no',
  };
  const wheelchair = raw.wheelchair?.trim().toLowerCase();
  const toilet = raw.toiletWheelchair?.trim().toLowerCase();
  const chosen = category === 'toilet' ? toilet : wheelchair;
  if (!chosen || !Object.hasOwn(values, chosen)) return 'unknown';
  if (
    category === 'toilet' &&
    wheelchair &&
    (!Object.hasOwn(values, wheelchair) || wheelchair !== chosen)
  )
    return 'unknown';
  return values[chosen];
}
