import type { MapSettings } from '../components/map/MapSettings';
const DEFAULT_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ATTRIBUTION = '© OpenStreetMap contributors';
const DEFAULT_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

/** Only these three explicitly public values may cross the server/client boundary. */
export function publicMapSettings(environment: Readonly<Record<string, string | undefined>>): MapSettings {
  const tileUrl = environment.MAP_TILE_URL?.trim() || DEFAULT_URL;
  const custom = tileUrl !== DEFAULT_URL;
  const attribution = environment.MAP_ATTRIBUTION?.trim() || (custom ? '' : DEFAULT_ATTRIBUTION);
  const attributionUrl = environment.MAP_ATTRIBUTION_URL?.trim() || (custom ? '' : DEFAULT_COPYRIGHT);
  const invalid = () => new Error('Configure an HTTPS XYZ basemap and its public attribution.');
  if (tileUrl.length > 2048 || !['x', 'y', 'z'].every((key) => tileUrl.includes(`{${key}}`))
    || /\{(?![xyz]\})/.test(tileUrl) || !attribution || attribution.length > 500 || /[<>]/.test(attribution)) throw invalid();
  try {
    for (const raw of [tileUrl.replace(/\{[xyz]\}/g, '0'), attributionUrl]) {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw invalid();
    }
  } catch { throw invalid(); }
  return { tileUrl, attribution, attributionUrl };
}
