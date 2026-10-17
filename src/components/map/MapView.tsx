'use client';
import { useState } from 'react';
import type { BBox, Position } from '@/shared/contracts';
import type { AvoidGeometry, Place, Route, PublicReport, Mine } from '@/features/routing/client/models';
import { accessibilityLabels, publicStatus } from '@/features/routing/client/state';
export type MapViewProps = { bbox:BBox; places?:Place[]; route?:Route|null; start?:Position|null; end?:Position|null; location?:Position|null; preview?:AvoidGeometry|null; publicReports?:PublicReport[]; mine?:Mine[]; onLocationChange?:(position:Position)=>void; onPlaceSelect?:(place:Place)=>void; now:number };
export function MapView({bbox,places=[],route,start,end,location,preview,publicReports=[],mine=[],onLocationChange,onPlaceSelect,now}:MapViewProps) {
  const [zoom,setZoom]=useState(1);
  const [offset,setOffset]=useState<[number,number]>([0,0]);
  const size=1000/zoom;
  const view=[500-size/2+offset[0],500-size/2+offset[1],size,size];
  const project=([x,y]:Position)=>[(x-bbox[0])/(bbox[2]-bbox[0])*1000,(bbox[3]-y)/(bbox[3]-bbox[1])*1000];
  const points=(coordinates:Position[])=>coordinates.map(p=>project(p).join(',')).join(' ');
  const polygons=(geometry:AvoidGeometry)=> (geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates).map((rings,i)=><path key={i} d={rings.map(ring=>'M'+ring.map(p=>project(p).join(',')).join('L')+'Z').join(' ')} fillRule="evenodd"/>);
  return <div className="map-wrap"><div className="map-tag">N ↑ <span>Coordinate map · no street basemap</span></div>
    <svg className="map" viewBox={view.join(' ')} role="img" aria-label="Region map. Use the place list or coordinate fields for keyboard point selection." onClick={event=>{
      if(!onLocationChange)return;
      const point=event.currentTarget.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
      const matrix=event.currentTarget.getScreenCTM();if(!matrix)return;
      const local=point.matrixTransform(matrix.inverse());
      if(local.x<0||local.x>1000||local.y<0||local.y>1000)return;
      onLocationChange([bbox[0]+local.x/1000*(bbox[2]-bbox[0]),bbox[3]-local.y/1000*(bbox[3]-bbox[1])]);
    }}>
      <defs><pattern id="map-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="#cddbd4" strokeWidth="1"/></pattern></defs>
      <rect width="1000" height="1000" fill="#e8eee8"/><rect width="1000" height="1000" fill="url(#map-grid)"/>
      {publicReports.map(r=><g key={r.id} className={publicStatus(r,now)==='Verified public barrier'?'map-hazard':'map-history'}><title>{publicStatus(r,now)}: {r.description}</title>{polygons(r.publicAvoidGeometry)}</g>)}
      {mine.filter(r=>r.personalAvoidance?.effective && Date.parse(r.personalAvoidance.validUntil)>now).map(r=><g key={r.id} className="map-personal"><title>Your temporary avoidance; not publicly verified</title>{polygons(r.personalAvoidance!.avoidGeometry)}</g>)}
      {route&&<><polyline points={points(route.route.features[0].geometry.coordinates)} fill="none" stroke="white" strokeWidth="15" strokeLinejoin="round"/><polyline points={points(route.route.features[0].geometry.coordinates)} fill="none" stroke="#0f766e" strokeWidth="8" strokeLinejoin="round"/></>}
      {preview&&<g className="map-preview"><title>Server preview — not yet confirmed</title>{polygons(preview)}</g>}
      {places.map((p,i)=>{const [x,y]=project(p.location);return <g key={p.id} transform={`translate(${x},${y})`} onClick={e=>{e.stopPropagation();onPlaceSelect?.(p)}}><title>{p.name}: {accessibilityLabels[p.accessibility]}</title><circle r="24" className={`pin ${p.accessibility}`}/><text textAnchor="middle" dy="7" fontSize="21" fontWeight="700">{i+1}</text><text y="-37" textAnchor="middle" className="map-label">{p.name}</text></g>})}
      {([['A',start],['B',end],['•',location]] as const).map(([label,p])=>{if(!p)return null;const[x,y]=project(p);return <g key={label} transform={`translate(${x},${y})`}><circle r="27" fill="#005c55" stroke="white" strokeWidth="5"/><text textAnchor="middle" dy="8" fill="white" fontSize="24" fontWeight="700">{label}</text></g>})}
    </svg>
    <div className="map-controls"><button aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(4,z+0.5))}>+</button><button aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(1,z-0.5))}>−</button><button aria-label="Pan north" onClick={()=>setOffset(([x,y])=>[x,y-100/zoom])}>↑</button><button aria-label="Pan south" onClick={()=>setOffset(([x,y])=>[x,y+100/zoom])}>↓</button><button aria-label="Pan west" onClick={()=>setOffset(([x,y])=>[x-100/zoom,y])}>←</button><button aria-label="Pan east" onClick={()=>setOffset(([x,y])=>[x+100/zoom,y])}>→</button><button aria-label="Reset map" onClick={()=>{setZoom(1);setOffset([0,0])}}>⌖</button></div>
    <div className="map-caption">WGS84 · longitude, latitude · select a point or use the list</div>
  </div>;
}
