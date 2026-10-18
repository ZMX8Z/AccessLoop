'use client';
import { useEffect, useRef, useState } from 'react';
import type { BBox, Position, LineString } from '@/shared/contracts';
import type { AvoidGeometry, Place, Route, PublicReport, Mine } from '@/features/routing/client/models';
import { createLeafletMap, type LeafletMapController } from './LeafletMap';
import { useMapSettings } from './MapSettings';

export type MapViewProps = { bbox:BBox; places?:Place[]; route?:Route|null; passage?:LineString|null; start?:Position|null; end?:Position|null; location?:Position|null; preview?:AvoidGeometry|null; publicReports?:PublicReport[]; mine?:Mine[]; onLocationChange?:(position:Position)=>void; onPlaceSelect?:(place:Place)=>void; now:number; fitRoute?:boolean };

export function MapView(props: MapViewProps) {
  const { tileUrl, attribution, attributionUrl } = useMapSettings();
  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<LeafletMapController | null>(null);
  const latest = useRef(props);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [tileUnavailable, setTileUnavailable] = useState(false);

  useEffect(() => {
    latest.current = props;
    controller.current?.update(props);
  }, [props]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let created: LeafletMapController | null = null;
    // Leaflet accesses window during module loading; import only after the client has mounted.
    void import('leaflet').then((L) => {
      if (disposed) return;
      created = createLeafletMap(L, element, { tileUrl, attribution, attributionUrl }, (unavailable) => {
        if (!disposed) setTileUnavailable(unavailable);
      });
      controller.current = created;
      created.update(latest.current);
      setStatus('ready');
    }).catch(() => {
      if (disposed) return;
      created?.remove();
      controller.current = null;
      setStatus('failed');
    });
    return () => {
      disposed = true;
      created?.remove();
      if (controller.current === created) controller.current = null;
    };
  }, [tileUrl, attribution, attributionUrl]);

  return <div className="map-wrap">
    <div ref={container} className="map leaflet-map" role="region" tabIndex={0}
      aria-label="Region map. Use arrow keys to pan and plus or minus to zoom. Use the place list or coordinate fields for keyboard point selection." />
    {status === 'loading' && <p className="map-load-status" role="status">Loading street map…</p>}
    {status === 'failed' && <p className="map-tile-warning" role="status">Map could not load. Use the place list or coordinate fields to select a point.</p>}
    {status === 'ready' && tileUnavailable && <p className="map-tile-warning" role="status">Street basemap unavailable. Route and barrier overlays remain visible; coordinate selection still works.</p>}
    {status === 'ready' && <button className="map-reset" aria-label="Reset map to configured region" onClick={() => controller.current?.reset()}>⌖</button>}
    <div className="map-attribution"><a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>{' | '}
      <a href={attributionUrl} target="_blank" rel="noreferrer">{attribution}</a>
    </div>
    <div className="map-caption">WGS84 · longitude, latitude · map data does not certify route accessibility</div>
  </div>;
}
