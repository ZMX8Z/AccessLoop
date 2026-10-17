import type * as Leaflet from 'leaflet';
import type { Position } from '@/shared/contracts';
import { accessibilityLabels, inside, publicStatus } from '@/features/routing/client/state';
import type { MapViewProps } from './MapView';
import type { MapSettings } from './MapSettings';

export type LeafletMapController = {
  update: (props: MapViewProps) => void;
  reset: () => void;
  remove: () => void;
};
const point = ([longitude, latitude]: Position): Leaflet.LatLngTuple => [latitude, longitude];

// React owns the container; this controller owns exactly one Leaflet map and its layers.
export function createLeafletMap(L: typeof Leaflet, container: HTMLElement, settings: MapSettings,
  onTileState: (unavailable: boolean) => void): LeafletMapController {
  const map = L.map(container, { attributionControl: false, keyboard: true, maxZoom: 19 });
  const tiles = L.tileLayer(settings.tileUrl, { maxZoom: 19, keepBuffer: 0, updateWhenIdle: true });
  const overlays = L.layerGroup().addTo(map);
  let current: MapViewProps | null = null;
  let boundsKey = '';
  let renderKey = '';
  let removed = false;
  tiles.on('tileerror', () => onTileState(true));
  tiles.on('tileload', () => onTileState(false));
  tiles.addTo(map);
  const text = (value: string) => {
    const element = container.ownerDocument.createElement('span');
    element.textContent = value;
    return element;
  };
  const fit = () => {
    if (!current || removed) return;
    const [west, south, east, north] = current.bbox;
    map.fitBounds([[south, west], [north, east]], { padding: [18, 18], maxZoom: 18, animate: false });
  };
  map.on('click', (event: Leaflet.LeafletMouseEvent) => {
    const position: Position = [event.latlng.lng, event.latlng.lat];
    if (current && inside(position, current.bbox)) current.onLocationChange?.(position);
  });
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (!removed) map.invalidateSize({ pan: false });
  });
  observer?.observe(container);
  return {
    update(props) {
      if (removed) return;
      current = props;
      const nextKey = props.bbox.join(',');
      if (nextKey !== boundsKey) { boundsKey = nextKey; fit(); }
      const publicLayers = (props.publicReports ?? []).map(report => ({
        geometry: report.publicAvoidGeometry,
        status: publicStatus(report, props.now), description: report.description,
      }));
      const personalGeometries = (props.mine ?? []).flatMap(report => {
        const avoidance = report.personalAvoidance;
        return avoidance?.effective && Date.parse(avoidance.validUntil) > props.now ? [avoidance.avoidGeometry] : [];
      });
      // Time itself and callback identities do not alter a layer. Compare only the visible
      // projection so a one-second clock tick preserves marker focus and open tooltips.
      const nextRenderKey = JSON.stringify({
        publicLayers, personalGeometries, route: props.route?.route.features[0].geometry ?? null,
        preview: props.preview ?? null,
        places: (props.places ?? []).map(({ id, name, location, accessibility }) => ({ id, name, location, accessibility })),
        points: [props.start ?? null, props.end ?? null, props.location ?? null],
      });
      if (nextRenderKey === renderKey) return;
      renderKey = nextRenderKey;
      overlays.clearLayers();
      const polygon = (geometry: NonNullable<MapViewProps['preview']>, className: string,
        color: string, label: string, historical = false) => {
        L.geoJSON(geometry, { interactive: false, style: {
          className, color, weight: historical ? 2 : 3, fillColor: color,
          fillOpacity: historical ? 0.06 : 0.2,
          ...(historical || className === 'map-preview' ? { dashArray: '7 5' } : {}),
        } }).bindTooltip(text(label)).addTo(overlays);
      };
      for (const { geometry, status, description } of publicLayers) {
        const active = status === 'Verified public barrier';
        polygon(geometry, active ? 'map-hazard' : 'map-history',
          active ? '#b91c1c' : '#64748b', `${status}: ${description}`, !active);
      }
      for (const geometry of personalGeometries) {
        polygon(geometry, 'map-personal', '#a16207', 'Your temporary avoidance; not publicly verified');
      }
      if (props.route) {
        const geometry = props.route.route.features[0].geometry;
        L.geoJSON(geometry, { interactive: false, style: { color: '#ffffff', weight: 10 } }).addTo(overlays);
        L.geoJSON(geometry, { interactive: false, style: { color: '#0f766e', weight: 6 } }).addTo(overlays);
      }
      if (props.preview) polygon(props.preview, 'map-preview', '#0f766e', 'Server preview — not yet confirmed');
      (props.places ?? []).forEach((place, index) => {
        L.marker(point(place.location), {
          icon: L.divIcon({ className: `map-point-icon ${place.accessibility}`, html: String(index + 1), iconSize: [32, 32], iconAnchor: [16, 16] }),
          keyboard: true, title: `${place.name}: ${accessibilityLabels[place.accessibility]}`,
          bubblingMouseEvents: false,
        }).bindTooltip(text(`${place.name}: ${accessibilityLabels[place.accessibility]}`))
          .on('click', () => {
            const selected = current?.places?.find(candidate => candidate.id === place.id);
            if (selected) current?.onPlaceSelect?.(selected);
          }).addTo(overlays);
      });
      for (const [label, position, title] of [
        ['A', props.start, 'Start'], ['B', props.end, 'Destination'], ['•', props.location, 'Selected location'],
      ] as const) {
        if (!position) continue;
        L.marker(point(position), { icon: L.divIcon({ className: 'map-point-icon map-endpoint-icon', html: label,
          iconSize: [34, 34], iconAnchor: [17, 17] }), keyboard: true, title,
          bubblingMouseEvents: false }).bindTooltip(text(title)).addTo(overlays);
      }
    },
    reset: fit,
    remove() {
      if (removed) return;
      removed = true;
      observer?.disconnect();
      tiles.off();
      map.off();
      map.remove();
      current = null;
    },
  };
}
