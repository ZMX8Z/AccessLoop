'use client';
import type { PassageRef, Position, BBox } from '@/shared/contracts';
import { PassageRefSchema } from '@/shared/contracts';
import type { AvoidGeometry, Passage, Route } from '@/features/routing/client/models';
import { MapView } from './MapView';
import { inside } from '@/features/routing/client/state';
import { useState } from 'react';
export type PassagePickerProps={bbox:BBox;location:Position|null;route:Route|null;passages:Passage[];value:PassageRef|null;preview:AvoidGeometry|null;onLocationChange:(position:Position)=>void;onChange:(passage:PassageRef)=>void;now:number};
// Controlled selector. B owns preview fetching, report storage and explicit consent.
export function PassagePicker({bbox,location,route,passages,value,preview,onLocationChange,onChange,now}:PassagePickerProps){
  const [locationError,setLocationError]=useState('');
  const coordinates=route?.route.features[0].geometry.coordinates??[];
  const routeAvailable=route&&coordinates.length>=2&&Date.parse(route.routeRefExpiresAt)>now;
  const selectedSegment=value&&'routeRef'in value&&value.routeRef===route?.routeRef
    &&Number.isInteger(value.startIndex)&&Number.isInteger(value.endIndex)
    &&value.startIndex>=0&&value.startIndex<value.endIndex&&value.endIndex<coordinates.length
    ?value:{startIndex:0,endIndex:Math.max(1,coordinates.length-1)};
  return <section className="passage-picker" aria-label="Location and passage selection">
    <MapView now={now} bbox={bbox} location={location} route={route} preview={preview} onLocationChange={onLocationChange}/>
    <form key={location?.join(',')??'no-location'} onSubmit={event=>{
      event.preventDefault();const data=new FormData(event.currentTarget);
      const longitude=String(data.get('longitude')??''),latitude=String(data.get('latitude')??'');
      const point:Position=[Number(longitude),Number(latitude)];
      if(!longitude.trim()||!latitude.trim()||!inside(point,bbox)){setLocationError('Enter longitude and latitude within this region.');return}
      setLocationError('');onLocationChange(point);
    }}><div className="two-column"><label>Report longitude<input name="longitude" type="number" step="any" required defaultValue={location?.[0]}/></label><label>Report latitude<input name="latitude" type="number" step="any" required defaultValue={location?.[1]}/></label></div><button type="submit">Set report location</button>{locationError&&<p role="alert">{locationError}</p>}</form>
    <fieldset><legend>Preset passage</legend>{passages.length===0&&<p>No configured passages are available.</p>}{passages.map(p=><label className="radio-row" key={p.id}><input type="radio" name="passage" checked={!!value&&'presetPassageId' in value&&value.presetPassageId===p.id&&value.passageVersion===p.passageVersion} onChange={()=>onChange({presetPassageId:p.id,passageVersion:p.passageVersion})}/>{p.name} · v{p.passageVersion}</label>)}</fieldset>
    <fieldset disabled={!routeAvailable}><legend>Current route segment</legend><p>Coordinate indices start at zero; both ends are included.</p><div className="two-column">{(['startIndex','endIndex'] as const).map((key)=><label key={key}>{key==='startIndex'?'From point':'To point'}<select value={selectedSegment[key]} onChange={e=>{
      if(!route||!routeAvailable)return;
      const selection={routeRef:route.routeRef,startIndex:selectedSegment.startIndex,endIndex:selectedSegment.endIndex,[key]:Number(e.target.value)};
      if(PassageRefSchema.safeParse(selection).success&&selection.endIndex<coordinates.length)onChange(selection);
    }}>{coordinates.map((_,i)=><option key={i} value={i}>{i}</option>)}</select></label>)}</div>
    {routeAvailable&&<button type="button" onClick={()=>onChange({routeRef:route.routeRef,startIndex:0,endIndex:coordinates.length-1})}>Select whole route</button>}
    </fieldset>{!routeAvailable&&<p>Plan a current route to select its segments.</p>}
    <p className="note">Selecting a passage requests a preview in the report form. It does not save a report or enable avoidance.</p>
  </section>;
}
