import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type { MapViewProps } from '../src/components/map/MapView';
import { accessibilityLabels, inside, publicStatus } from '../src/features/routing/client/state';

// The host implements only Leaflet's browser boundary; assertions exercise the real map controller.
type TileEvent = { tile: object };
type Handler = (event: { latlng: { lat:number; lng:number } }) => void;
type Layer = { kind:string; value:unknown; options:Record<string, unknown>; tooltip?:{textContent:string}; handlers:Record<string,Handler>; addTo:(target:unknown)=>Layer; bindTooltip:(text:{textContent:string})=>Layer; on:(name:string, handler:Handler)=>Layer };
function host() {
  const layers:Layer[]=[];
  const handlers:Record<string, Handler>={};
  const tileHandlers:Record<string,(event:TileEvent)=>void>={};
  const bounds:unknown[]=[];
  let cleared=0, removed=0, off=0, tileOff=0, disconnected=0, resized=0;
  const map={on:(name:string,handler:Handler)=>{handlers[name]=handler;},off:()=>{off++;},fitBounds:(value:unknown)=>{bounds.push(value);},remove:()=>{removed++;},invalidateSize:()=>{resized++;}};
  const group={addTo:()=>group,clearLayers:()=>{cleared++;}};
  const tile={addTo:()=>tile,on:(name:string,handler:(event:TileEvent)=>void)=>{tileHandlers[name]=handler;return tile;},off:()=>{tileOff++;}};
  const make=(kind:string,value:unknown,options:Record<string,unknown>={})=>{
    const layer:Layer={kind,value,options,handlers:{},addTo:()=>layer,bindTooltip:(text)=>{layer.tooltip=text;return layer;},on:(name,handler)=>{layer.handlers[name]=handler;return layer;}};
    layers.push(layer);return layer;
  };
  const leaflet={map:()=>map,tileLayer:(url:string,options:Record<string,unknown>)=>{make('tile',url,options);return tile;},layerGroup:()=>group,geoJSON:(geometry:unknown,options:Record<string,unknown>)=>make('geometry',geometry,options),marker:(point:unknown,options:Record<string,unknown>)=>make('marker',point,options),divIcon:(options:Record<string,unknown>)=>options};
  const container={ownerDocument:{createElement:()=>({textContent:''})}};
  let resize:()=>void=()=>{};
  class Observer { constructor(callback:()=>void){resize=callback;} observe(){} disconnect(){disconnected++;} }
  const path=new URL('../src/components/map/LeafletMap.tsx', import.meta.url);
  const exported:Record<string,unknown>={};
  if(existsSync(path)) {
    const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports:exported,require:(name:string)=>{
      assert.equal(name,'@/features/routing/client/state');
      return { inside, accessibilityLabels, publicStatus };
    },ResizeObserver:Observer});
  }
  type Controller={update:(props:MapViewProps)=>void;reset:()=>void;remove:()=>void};
  const create=(props:MapViewProps,onTileState:(unavailable:boolean)=>void=()=>{})=>{
    assert.equal(typeof exported.createLeafletMap,'function','Leaflet map controller is available');
    const controller=(exported.createLeafletMap as (L:unknown,element:unknown,settings:unknown,onTileState:unknown)=>Controller)(leaflet,container,{tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© OpenStreetMap contributors',attributionUrl:'https://www.openstreetmap.org/copyright'},onTileState);
    controller.update(props);return controller;
  };
  return {create,layers,handlers,tileHandlers,bounds,resize:()=>resize(),counts:()=>({cleared,removed,off,tileOff,disconnected,resized})};
}
const props:MapViewProps={bbox:[151.22,-33.92,151.24,-33.90],now:1000};
const geometry={type:'Polygon',coordinates:[[[151.221,-33.919],[151.239,-33.919],[151.239,-33.901],[151.221,-33.919]],[[151.225,-33.915],[151.226,-33.915],[151.226,-33.914],[151.225,-33.915]]]} as const;
const json=(value:unknown)=>JSON.parse(JSON.stringify(value));

test('the tile map converts bbox and selections between WGS84 and Leaflet and ignores outside clicks',()=>{
  const h=host(),selected:unknown[]=[];const c=h.create({...props,onLocationChange:value=>selected.push(value)});
  assert.deepEqual(json(h.bounds[0]),[[-33.92,151.22],[-33.90,151.24]]);
  h.handlers.click({latlng:{lat:-33.91,lng:151.23}});h.handlers.click({latlng:{lat:-33.91,lng:153}});
  assert.deepEqual(json(selected),[[151.23,-33.91]]);
  const next:unknown[]=[];c.update({...props,onLocationChange:value=>next.push(value)});h.handlers.click({latlng:{lat:-33.91,lng:151.23}});
  assert.equal(selected.length,1);assert.equal(next.length,1);
});

test('layer refresh preserves the user viewport; only a changed bbox or explicit reset fits it',()=>{
  const h=host(),c=h.create(props);c.update({...props,bbox:[...props.bbox],now:2000,start:[151.23,-33.91]});
  assert.equal(h.bounds.length,1);c.update({...props,bbox:[151.21,-33.93,151.25,-33.89]});assert.equal(h.bounds.length,2);
  c.reset();assert.equal(h.bounds.length,3);
});

test('GeoJSON retains polygon holes and keeps public history, effective private avoidance and preview distinct',()=>{
  const h=host();h.create({...props,publicReports:[{id:'public',description:'Public',status:'verified',publicActivity:'active',publicVerification:{validUntil:new Date(5000).toISOString()},publicAvoidGeometry:geometry},{id:'history',description:'History',publicActivity:'expired',publicAvoidGeometry:geometry}] as unknown as MapViewProps['publicReports'],mine:[{id:'active',personalAvoidance:{effective:true,validUntil:new Date(5000).toISOString(),avoidGeometry:geometry}},{id:'expired',personalAvoidance:{effective:true,validUntil:new Date(500).toISOString(),avoidGeometry:geometry}}] as unknown as MapViewProps['mine'],preview:geometry as unknown as MapViewProps['preview']});
  const geometries=h.layers.filter(layer=>layer.kind==='geometry');assert.equal(geometries.length,4);
  assert.deepEqual(json(geometries[0].value),geometry);
  assert.deepEqual(geometries.map(layer=>(layer.options.style as {className:string}).className),['map-hazard','map-history','map-personal','map-preview']);
  assert.ok(geometries.every(layer=>layer.options.interactive===false));
});

test('facility text stays DOM text and selection remains independent of map point selection',()=>{
  const h=host(),selected:unknown[]=[];const place={id:'unsafe',name:'<img src=x onerror=alert(1)>',location:[151.23,-33.91],accessibility:'unknown'} as unknown as NonNullable<MapViewProps['places']>[number];
  h.create({...props,places:[place],onPlaceSelect:value=>selected.push(value)});
  const marker=h.layers.find(layer=>layer.kind==='marker')!;
  assert.deepEqual(json(marker.value),[-33.91,151.23]);assert.equal(marker.tooltip?.textContent,'<img src=x onerror=alert(1)>: Unknown access');
  assert.equal((marker.options.icon as {html:string}).html,'1');assert.equal(marker.options.bubblingMouseEvents,false);
  marker.handlers.click({latlng:{lat:0,lng:0}});assert.equal(selected[0],place);
});

test('tile failures can recover without removing overlays; teardown disconnects all map resources once',()=>{
  const h=host(),states:boolean[]=[];const c=h.create(props,value=>states.push(value));
  const tile={};h.tileHandlers.tileerror({tile});h.tileHandlers.tileload({tile});assert.deepEqual(states,[true,false]);
  h.resize();assert.equal(h.counts().resized,1);c.remove();c.remove();
  assert.deepEqual(h.counts(),{cleared:1,removed:1,off:1,tileOff:1,disconnected:1,resized:1});
});

test('two map instances do not share viewport state, layers or cleanup',()=>{
  const a=host(),b=host(),first=a.create(props);b.create({...props,bbox:[0,0,1,1]});first.remove();
  assert.equal(a.counts().removed,1);assert.equal(b.counts().removed,0);assert.deepEqual(json(b.bounds[0]),[[0,0],[1,1]]);
});


test('clock ticks preserve marker identity until private expiry or a public status transition changes visible layers',()=>{
  const h=host();
  const place={id:'facility',name:'Entrance',location:[151.23,-33.91],accessibility:'unknown'} as unknown as NonNullable<MapViewProps['places']>[number];
  const report={id:'public',description:'Public',status:'verified',publicActivity:'active',publicVerification:{validUntil:new Date(5000).toISOString()},publicAvoidGeometry:geometry};
  const full={...props,places:[place],publicReports:[report] as unknown as MapViewProps['publicReports'],mine:[{id:'mine',personalAvoidance:{effective:true,validUntil:new Date(3000).toISOString(),avoidGeometry:geometry}}] as unknown as MapViewProps['mine']};
  const c=h.create(full),initialLayerCount=h.layers.length;
  c.update({...full,now:2000});
  assert.equal(h.counts().cleared,1,'unchanged layers retain hover and keyboard focus during clock ticks');
  assert.equal(h.layers.length,initialLayerCount,'no replacement marker or path is created');
  c.update({...full,now:3000});assert.equal(h.counts().cleared,2,'private avoidance disappears exactly at expiry');
  c.update({...full,now:4000});assert.equal(h.counts().cleared,2);
  c.update({...full,now:5000});assert.equal(h.counts().cleared,3,'public geometry changes to history at expiry');
  const latestPublicGeometry=h.layers.filter(layer=>layer.kind==='geometry').at(-1)!;
  assert.equal((latestPublicGeometry.options.style as {className:string}).className,'map-history');
  c.update({...full,now:5001,publicReports:[{...report,status:'resolved'}] as unknown as MapViewProps['publicReports']});
  assert.equal(h.counts().cleared,4,'a status label change updates the visible layer tooltip');
  assert.equal(h.bounds.length,1,'expiry and status transitions do not reset the user viewport');
});

test('stable facility markers invoke the newest callback with current facility metadata',()=>{
  const h=host(),first:unknown[]=[],next:unknown[]=[];
  const place={id:'facility',name:'Entrance',location:[151.23,-33.91],accessibility:'unknown',accessibilityNote:'Old source detail'} as unknown as NonNullable<MapViewProps['places']>[number];
  const c=h.create({...props,places:[place],onPlaceSelect:value=>first.push(value)});
  const marker=h.layers.find(layer=>layer.kind==='marker')!;
  const updated={...place,accessibilityNote:'Current source detail'};
  c.update({...props,now:2000,places:[updated],onPlaceSelect:value=>next.push(value)});
  assert.equal(h.counts().cleared,1);
  marker.handlers.click({latlng:{lat:0,lng:0}});
  assert.equal(first.length,0);assert.equal(next[0],updated);
  c.update({...props,now:2001,places:[{...updated,name:'Renamed entrance'}]});
  assert.equal(h.counts().cleared,2,'a rendered name change refreshes the marker and tooltip');
});


test('a successful neighboring tile cannot hide a tile that still failed',()=>{
  const h=host(),states:boolean[]=[];h.create(props,value=>states.push(value));
  const failed={},neighbor={};
  h.tileHandlers.tileerror({tile:failed});
  h.tileHandlers.tileload({tile:neighbor});
  assert.equal(states.at(-1),true,'the failed tile remains part of the current map');
  h.tileHandlers.tileload({tile:failed});
  assert.equal(states.at(-1),false,'the warning clears only when that tile recovers');
});

test('failed tiles retain the warning until every failure recovers or unloads, and removed maps ignore late events',()=>{
  const h=host(),states:boolean[]=[];const c=h.create(props,value=>states.push(value));
  const a={},b={},healthy={};
  h.tileHandlers.tileerror({tile:a});h.tileHandlers.tileerror({tile:b});
  assert.equal(typeof h.tileHandlers.tileunload,'function','map failure state follows tile lifecycle');
  h.tileHandlers.tileunload({tile:healthy});h.tileHandlers.tileunload({tile:a});
  assert.equal(states.at(-1),true,'one failed tile still remains');
  h.tileHandlers.tileunload({tile:b});assert.equal(states.at(-1),false,'off-screen unloaded failures no longer affect the map');
  h.tileHandlers.tileerror({tile:a});
  c.remove();const count=states.length;
  h.tileHandlers.tileerror({tile:b});h.tileHandlers.tileload({tile:a});h.tileHandlers.tileunload({tile:b});
  assert.equal(states.length,count,'teardown detaches and invalidates late tile callbacks');
});

test('an explicit planner route focuses its geometry once, while polling and tab visibility preserve that viewport',()=>{
 const h=host(),c=h.create(props);
 const route={routeRef:'planned-route',route:{features:[{geometry:{type:'LineString',coordinates:[[151.2327,-33.917],[151.233,-33.9174]]}}]}} as unknown as NonNullable<MapViewProps['route']>;
 c.update({...props,route,fitRoute:true});
 assert.equal(h.bounds.length,2,'the first explicit route is visible at a useful scale');
 assert.deepEqual(json(h.bounds[1]),[[-33.917,151.2327],[-33.9174,151.233]]);
 c.update({...props,route,fitRoute:true,now:2000});
 c.update({...props,route:null,fitRoute:true});
 c.update({...props,route,fitRoute:true,now:3000});
 assert.equal(h.bounds.length,2,'ticks, stale hiding and tab restoration do not refit');
});
