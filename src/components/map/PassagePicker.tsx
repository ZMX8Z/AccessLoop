'use client';
import type { PassageRef, Position, BBox } from '@/shared/contracts';
import { PassageRefSchema } from '@/shared/contracts';
import type { AvoidGeometry, Passage, Route } from '@/features/routing/client/models';
import { MapView } from './MapView';
import { inside } from '@/features/routing/client/state';
import { useState } from 'react';
export type PassagePickerProps={bbox:BBox;location:Position|null;route:Route|null;passages:Passage[];value:PassageRef|null;preview:AvoidGeometry|null;onLocationChange:(position:Position)=>void;onLocationDraftChange?:(dirty:boolean)=>void;onChange:(passage:PassageRef)=>void;now:number};
// Controlled selector. B owns preview fetching, report storage and explicit consent.
export function PassagePicker({bbox,location,route,passages,value,preview,onLocationChange,onLocationDraftChange,onChange,now}:PassagePickerProps){
  const [locationError,setLocationError]=useState('');
  const coordinates=route?.route.features[0].geometry.coordinates??[];
  const routeAvailable=route&&coordinates.length>=2&&Date.parse(route.routeRefExpiresAt)>now;
  const preset=value&&'presetPassageId'in value?passages.find(p=>p.id===value.presetPassageId&&p.passageVersion===value.passageVersion):undefined;
  const selectedSegment=value&&'routeRef'in value&&value.routeRef===route?.routeRef
    &&Number.isInteger(value.startIndex)&&Number.isInteger(value.endIndex)
    &&value.startIndex>=0&&value.startIndex<value.endIndex&&value.endIndex<coordinates.length
    ?value:{startIndex:0,endIndex:Math.max(1,coordinates.length-1)};
  const applyLocation=(point:Position)=>{setLocationError('');onLocationDraftChange?.(false);onLocationChange(point)};
  const editCoordinates=()=>{setLocationError('');onLocationDraftChange?.(true)};
  const range=`Longitude ${bbox[0].toFixed(5)} to ${bbox[2].toFixed(5)}; latitude ${bbox[1].toFixed(5)} to ${bbox[3].toFixed(5)}.`;
  return <section className="passage-picker" aria-label="Location and passage selection">
    <p>Choose the observed location on the map, or enter coordinates within this region. {range}</p>
    <MapView now={now} bbox={bbox} location={location} route={route} passage={preset?.geometry} preview={preview} onLocationChange={applyLocation}/>
    {preset&&<p className="note">Purple line: {preset.name}. Select the actual observation location on or near this passage.</p>}
    <form key={location?.join(',')??'no-location'} noValidate onSubmit={event=>{
      event.preventDefault();const data=new FormData(event.currentTarget);
      const longitude=String(data.get('longitude')??''),latitude=String(data.get('latitude')??'');
      const point:Position=[Number(longitude),Number(latitude)];
      if(!longitude.trim()||!latitude.trim()||!inside(point,bbox)){onLocationDraftChange?.(true);setLocationError(`Enter coordinates within this region. ${range}`);return}
      applyLocation(point);
    }}><div className="two-column"><label>Report longitude<input name="longitude" type="number" step="any" min={bbox[0]} max={bbox[2]} required defaultValue={location?.[0]} onChange={editCoordinates}/></label><label>Report latitude<input name="latitude" type="number" step="any" min={bbox[1]} max={bbox[3]} required defaultValue={location?.[1]} onChange={editCoordinates}/></label></div><button type="submit">Set report location</button>{locationError&&<p role="alert">{locationError}</p>}</form>
    {location&&<p className="note">Applied report location: {location[0].toFixed(6)}, {location[1].toFixed(6)}. Apply edited coordinates before saving.</p>}
    <p>Choose one passage option: a preset passage, or part of a current planned route.</p>
    <fieldset><legend>Preset passage</legend>{passages.length===0&&<p>No configured passages are available.</p>}{passages.map(p=><label className="radio-row" key={p.id}><input type="radio" name="passage" checked={!!value&&'presetPassageId' in value&&value.presetPassageId===p.id&&value.passageVersion===p.passageVersion} onChange={()=>onChange({presetPassageId:p.id,passageVersion:p.passageVersion})}/>{p.name} · v{p.passageVersion}</label>)}</fieldset>
    {routeAvailable?<fieldset><legend>Current route segment · alternative option</legend><p>Coordinate indices start at zero; both ends are included.</p><div className="two-column">{(['startIndex','endIndex'] as const).map((key)=><label key={key}>{key==='startIndex'?'From point':'To point'}<select value={selectedSegment[key]} onChange={e=>{
      if(!route||!routeAvailable)return;
      const selection={routeRef:route.routeRef,startIndex:selectedSegment.startIndex,endIndex:selectedSegment.endIndex,[key]:Number(e.target.value)};
      if(PassageRefSchema.safeParse(selection).success&&selection.endIndex<coordinates.length)onChange(selection);
    }}>{coordinates.map((_,i)=><option key={i} value={i}>{i}</option>)}</select></label>)}</div>
    <button type="button" onClick={()=>onChange({routeRef:route.routeRef,startIndex:0,endIndex:coordinates.length-1})}>Select whole route</button>
    </fieldset>:<p className="note">A planned route is not required when using a preset passage. To select a route segment instead, plan a current route first.</p>}
    <p className="note">Saving the report lets you review a server-generated avoidance preview. Avoidance starts only after your explicit confirmation.</p>
  </section>;
}
