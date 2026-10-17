'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Position, Restrictions, PassageRef } from '@/shared/contracts';
import { ApiError, errorMessage, LatestRequest, resetSession } from '@/shared/client/api';
import { MapView } from '@/components/map/MapView';
import { PassagePicker } from '@/components/map/PassagePicker';
import { liveService } from './service';
import { createFixtureService } from './fixtures';
import { accessibilityLabels, contextCanReplace, contextKey, inside, publicStatus, routeOutdated } from './state';
import type { Context, Mine, Passage, Place, PublicReport, Region, Route, SearchResult } from './models';

type Endpoint = {name:string;location:Position};
export function RoutePlanner({fixture=false}:{fixture?:boolean}) {
  const service=useMemo(()=>fixture?createFixtureService():liveService,[fixture]);
  const [region,setRegion]=useState<Region|null>(null);
  const [places,setPlaces]=useState<Place[]>([]),[passages,setPassages]=useState<Passage[]>([]);
  const [reports,setReports]=useState<PublicReport[]>([]),[mine,setMine]=useState<Mine[]>([]);
  const [context,setContext]=useState<Context|null>(null),[route,setRoute]=useState<Route|null>(null);
  const [start,setStart]=useState<Endpoint|null>(null),[end,setEnd]=useState<Endpoint|null>(null);
  const [target,setTarget]=useState<'start'|'end'>('start');
  const [restrictions,setRestrictions]=useState<Restrictions|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[planning,setPlanning]=useState(false);
  const [routeNames,setRouteNames]=useState<{start:string;end:string}|null>(null);
  const [inputChanged,setInputChanged]=useState(false),[contextUnavailable,setContextUnavailable]=useState(false),[layersUnavailable,setLayersUnavailable]=useState(false);
  const [truncated,setTruncated]=useState(false),[retryAt,setRetryAt]=useState(0),[now,setNow]=useState(0),[reload,setReload]=useState(0);
  const [query,setQuery]=useState(''),[results,setResults]=useState<SearchResult[]>([]),[searchStatus,setSearchStatus]=useState('');
  const [selected,setSelected]=useState<Place|null>(null),[view,setView]=useState<'map'|'list'>('map');
  const [passage,setPassage]=useState<PassageRef|null>(null),[picker,setPicker]=useState(false);
  const [manualLng,setManualLng]=useState(''),[manualLat,setManualLat]=useState('');
  const routeRequest=useRef(new LatestRequest()),searchRequest=useRef(new LatestRequest());
  const contextRef=useRef<Context|null>(null);
  const inputEpoch=useRef(0);
  const showError=(cause:unknown)=>{
    setError(errorMessage(cause)+(cause instanceof ApiError&&cause.requestId?` Reference: ${cause.requestId}`:''));
    if(cause instanceof ApiError&&cause.retryAfterSec)setRetryAt(Date.now()+cause.retryAfterSec*1000);
    if(cause instanceof ApiError&&cause.code==='UNAUTHENTICATED'){
      resetSession();setRoute(null);setMine([]);setContext(null);contextRef.current=null;
      setNotice('Your session ended. Reconnect to initialize a new session; previous private reports cannot be recovered.');
    }
  };
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[]);
  useEffect(()=>{
    const routes=routeRequest.current, searches=searchRequest.current;
    let disposed=false;
    let polling=false;
    let activeController:AbortController|undefined;
    const layers=async(r:Region,signal:AbortSignal)=>{
      const [p,ps,pub,own]=await Promise.all([service.places(r.bbox,signal),service.passages(signal),service.publicReports(signal),service.mine(signal)]);
      if(disposed||signal.aborted)return;
      setPlaces(p.items);setPassages(ps.items);setReports(pub.items);setMine(own.items);setTruncated(p.truncated||pub.truncated||own.truncated);setLayersUnavailable(false);
    };
    let currentRegion:Region|null=null;
    const initialize=async()=>{
      activeController=new AbortController();
      setLoading(true);setError('');
      try {
        await service.initialize();
        const r=await service.region(activeController.signal);
        const c=await service.context(activeController.signal);
        if(disposed)return;
        currentRegion=r;setRegion(r);setRestrictions(r.routing.defaultRestrictions);setContext(c);contextRef.current=c;setContextUnavailable(false);
        await layers(r,activeController.signal);
      }catch(cause){if(!disposed){setError(errorMessage(cause));setLayersUnavailable(true);setContextUnavailable(true)}}
      finally{if(!disposed)setLoading(false)}
    };
    void initialize();
    const timer=setInterval(async()=>{
      if(disposed||polling||!currentRegion)return;
      polling=true;activeController=new AbortController();
      const controller=activeController;
      const timeout=setTimeout(()=>controller.abort(),4500);
      try{
        const next=await service.context(controller.signal);
        if(disposed||controller.signal.aborted)return;
        const previous=contextRef.current;
        if(!contextCanReplace(previous,next))return;
        const changed=!previous||contextKey(previous)!==contextKey(next);
        const configChanged=currentRegion.configVersion!==next.configVersion;
        let replacementRegion=currentRegion;
        if(changed){
          // A known change invalidates the route even while replacement data is pending.
          setContextUnavailable(true);setLayersUnavailable(true);
          routeRequest.current.cancel();setPlanning(false);setInputChanged(true);
          setNotice('Conditions changed. Please recalculate the route.');
          setReports([]);setMine([]);setPassage(null);
        }
        if(configChanged){
          replacementRegion=await service.region(controller.signal);
          if(disposed||controller.signal.aborted)return;
          // A newer config may have arrived between the two reads. Retry the snapshot next poll.
          if(replacementRegion.configVersion!==next.configVersion)return;
        }
        if(!contextCanReplace(contextRef.current,next))return;
        if(configChanged){
          currentRegion=replacementRegion;
          setRegion(currentRegion);setRestrictions(currentRegion.routing.defaultRestrictions);
          inputEpoch.current++;routeRequest.current.cancel();setPlanning(false);setInputChanged(true);
        }
        setContext(next);contextRef.current=next;setContextUnavailable(false);
        // Retry failed layer refreshes as well as version-triggered refreshes.
        await layers(currentRegion,controller.signal);
      }catch(cause){if(!disposed){setContextUnavailable(true);setLayersUnavailable(true);if(cause instanceof ApiError&&cause.code==='UNAUTHENTICATED'){resetSession();setMine([]);setRoute(null);setNotice('Session expired. Reconnect to initialize a new session.')}}}
      finally{clearTimeout(timeout);polling=false}
    },5000);
    return()=>{disposed=true;clearInterval(timer);activeController?.abort();routes.cancel();searches.cancel()};
  },[service,reload]);
  useEffect(()=>{
    const searches=searchRequest.current;
    const task=searches.begin();
    const trimmed=query.trim();
    if(trimmed.length<2||trimmed.length>100)return;
    const timer=setTimeout(async()=>{
      setSearchStatus('Searching…');
      try{
        const data=await service.search(trimmed,task.signal);
        if(!task.current())return;
        setResults(data.items);setSearchStatus(data.items.length?'Select a result below.':'No matches in this region. Choose a map point or a listed place.');
      }catch(cause){if(task.current()){setResults([]);setSearchStatus(errorMessage(cause));if(cause instanceof ApiError&&cause.retryAfterSec)setRetryAt(Date.now()+cause.retryAfterSec*1000)}}
    },350);
    return()=>{clearTimeout(timer);searches.cancel()};
  },[query,service]);
  function invalidateInput(){inputEpoch.current++;routeRequest.current.cancel();setPlanning(false);setInputChanged(true);setPassage(null);setError('');setNotice('Selections changed. Press Plan or Recalculate to update the route.')}
  function choose(point:Endpoint){
    if(!region||!inside(point.location,region.bbox)){setError('This point is outside the configured region. Choose a point within the map.');return}
    invalidateInput();if(target==='start'){setStart(point);setTarget('end')}else setEnd(point);
    setNotice(`${target==='start'?'Start':'Destination'} set to ${point.name}. Select Plan route when ready.`);
  }
  async function plan(){
    if(!region||!restrictions||!start||!end)return;
    if(!inside(start.location,region.bbox)||!inside(end.location,region.bbox)){setError('An endpoint is outside the configured region. Select it again.');return}
    const task=routeRequest.current.begin(),epoch=inputEpoch.current;
    setPlanning(true);setError('');
    try{
      const result=await service.route({start:start.location,end:end.location,profile:'wheelchair',restrictions},task.signal);
      const latest=await service.context(task.signal);
      if(!task.current()||epoch!==inputEpoch.current)return;
      if(latest.configVersion!==region.configVersion||!contextCanReplace(contextRef.current,latest)||contextKey(result)!==contextKey(latest))throw new ApiError('ROUTE_STALE','Conditions changed during planning. Please recalculate.');
      setRoute(result);setRouteNames({start:start.name,end:end.name});setContext(latest);contextRef.current=latest;setContextUnavailable(false);setInputChanged(false);setNotice('Candidate route ready. Review the sources and current conditions before travelling.');
    }catch(cause){if(task.current()){setInputChanged(true);showError(cause)}}
    finally{if(task.current())setPlanning(false)}
  }
  const stale=!!route&&(inputChanged||contextUnavailable||routeOutdated(route,context,now));
  const wait=Math.max(0,Math.ceil((retryAt-now)/1000));
  const selectPlace=(p:Place)=>{setSelected(p);choose({name:p.name,location:p.location})};
  return <>
    <header className="site-header"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">↗</span>AccessLoop</Link><div className="header-right"><span className="pill">{fixture?'Fixture preview':region?.isDemo?'Demo region':'Campus mobility'}</span><a href="#planner">Plan a journey</a></div></header>
    <main id="planner">
      <div className="intro"><div><p className="eyebrow">A little more confidence, every journey</p><h1>Your campus.<br className="mobile-only"/> Your way through.</h1><p>Find places, understand barriers, and plan around your needs.</p></div><div className="region-label"><span aria-hidden="true">⌖</span>{region?.name??'UNSW Kensington · awaiting region configuration'}</div></div>
      {fixture&&<div className="banner warning"><strong>Design fixture — not for navigation.</strong> Synthetic places, route, search and status examples. No ORS or live business API is called. <Link href="/">Open live mode</Link></div>}
      {!fixture&&<div className="banner neutral">Live business API mode. <a href="/preview">Explore the clearly labelled design fixture</a></div>}
      {error&&<div role="alert" className="banner error"><strong>Unable to complete this request.</strong> {error} <button onClick={()=>{resetSession();setReload(n=>n+1)}}>Reconnect services</button></div>}
      {notice&&<p className="notice" role="status">{notice}</p>}
      <div className="planner-grid"><aside className="panel planner-panel"><div className="section-heading"><span className="eyebrow">01 / Your journey</span><span className="pill">Wheelchair</span></div><h2>Where are you headed?</h2>
        <div className="endpoints"><button className={target==='start'?'endpoint active':'endpoint'} onClick={()=>{inputEpoch.current++;setTarget('start')}}><span className="endpoint-letter">A</span><span><small>Start</small>{start?.name??'Choose a starting point'}</span></button><button className="swap" aria-label="Swap start and destination" onClick={()=>{invalidateInput();setStart(end);setEnd(start)}}>⇅</button><button className={target==='end'?'endpoint active':'endpoint'} onClick={()=>{inputEpoch.current++;setTarget('end')}}><span className="endpoint-letter">B</span><span><small>Destination</small>{end?.name??'Choose your destination'}</span></button></div>
        <label className="search-label" htmlFor="place-search">Search for {target==='start'?'a starting point':'a destination'}</label><input id="place-search" type="search" placeholder="Search places in this region" maxLength={100} value={query} disabled={!region||wait>0} onChange={e=>{searchRequest.current.cancel();setResults([]);setSearchStatus('');setQuery(e.target.value)}}/>
        <p role="status" className="note">{searchStatus}</p>{results.length>0&&<ul className="search-results">{results.map(result=><li key={result.id}><button onClick={()=>{choose(result);setQuery('');setResults([]);setSearchStatus('')}}>{result.name}<small>{result.source}</small></button></li>)}</ul>}
        <button className="text-button" disabled={!region} onClick={()=>{
          if(!navigator.geolocation){setError('Location is unavailable. Select a map point or use the place list.');return}
          const epoch=inputEpoch.current,selectedTarget=target;
          navigator.geolocation.getCurrentPosition(position=>{if(epoch===inputEpoch.current&&selectedTarget===target)choose({name:'Current location',location:[position.coords.longitude,position.coords.latitude]})},()=>setError('Location permission was denied or unavailable. Select a map point, enter coordinates, or use the place list.'),{timeout:10000});
        }}>⌖ Use my location</button>
        <details><summary>Enter coordinates manually</summary><div className="two-column"><label>Longitude<input type="number" step="any" value={manualLng} onChange={e=>setManualLng(e.target.value)}/></label><label>Latitude<input type="number" step="any" value={manualLat} onChange={e=>setManualLat(e.target.value)}/></label></div><button disabled={!region||!manualLng.trim()||!manualLat.trim()} onClick={()=>choose({name:'Selected map point',location:[Number(manualLng),Number(manualLat)]})}>Use coordinates</button></details>
        <div className="divider"/><h3>Your wheelchair parameters</h3><p className="note">Options come from this region’s configuration.</p>
        {restrictions&&region?(['maximum_incline','maximum_sloped_kerb','minimum_width'] as const).map(key=><label className="parameter" key={key}><span>{key==='maximum_incline'?'Maximum incline':key==='maximum_sloped_kerb'?'Maximum kerb':'Minimum width'}</span><select value={restrictions[key]} onChange={e=>{invalidateInput();setRestrictions({...restrictions,[key]:Number(e.target.value)})}}>{region.routing.supportedRestrictions[key].map(value=><option key={value} value={value}>{value}{key==='maximum_incline'?`% (${(Math.atan(value/100)*180/Math.PI).toFixed(1)}°)`:' m'}</option>)}</select></label>):<p className="note">Waiting for supported parameters.</p>}
        <button className="primary plan-button" disabled={!start||!end||!restrictions||planning||wait>0} onClick={()=>void plan()}>{planning?'Planning…':wait>0?`Please wait ${wait}s`:route?'Recalculate route →':'Plan route →'}</button><p className="note">Routes calculate only when you press this button. Your selections are kept if a request fails.</p>
      </aside>
      <section className="map-panel panel" aria-label="Map and route"><div className="map-toolbar"><div><span className="eyebrow">02 / Explore the area</span><h2>{view==='map'?'A clearer picture':'Places in this region'}</h2></div><div className="segmented"><button aria-pressed={view==='map'} onClick={()=>setView('map')}>Map</button><button aria-pressed={view==='list'} onClick={()=>setView('list')}>List</button></div></div>
        {loading?<div className="empty-state" role="status">Loading region and current conditions…</div>:!region?<div className="empty-state"><span className="empty-symbol">⌖</span><h3>The campus map is getting ready</h3><p>Region and routing services are not available in this skeleton yet.</p><a className="primary button-link" href="/preview">View the Stitch design preview →</a></div>:view==='map'?<MapView bbox={region.bbox} places={places} route={route} start={start?.location} end={end?.location} publicReports={layersUnavailable?[]:reports} mine={layersUnavailable?[]:mine} now={now} onPlaceSelect={selectPlace} onLocationChange={location=>choose({name:'Selected map point',location})}/>:<ul className="place-list">{places.map((p,i)=><li key={p.id}><button onClick={()=>selectPlace(p)}><span className={`place-number ${p.accessibility}`}>{i+1}</span><span><strong>{p.name}</strong><small>{accessibilityLabels[p.accessibility]} · {p.category.replace('_',' ')}</small><small>{p.source}</small></span><span aria-hidden="true">↗</span></button></li>)}</ul>}
        <div className="legend">{Object.entries(accessibilityLabels).map(([key,label])=><span key={key}><b className={`legend-symbol ${key}`}>{key==='yes'?'✓':key==='limited'?'△':key==='no'?'×':'?'}</b>{label}</span>)}</div>
        {truncated&&<p className="banner warning">The service returned a limited set of results. This is not a complete inventory.</p>}
        {selected&&<div className="place-detail"><button className="close" aria-label="Close place details" onClick={()=>setSelected(null)}>×</button><h3>{selected.name}</h3><p>{accessibilityLabels[selected.accessibility]} · {selected.accessibilityNote??'No further access information.'}</p><p className="note">{selected.location.join(', ')} · Source: {selected.source} / {selected.sourceId}<br/>Updated {selected.fetchedAt}. Original wheelchair tag: {selected.rawAccessibility.wheelchair??'missing'}; toilet tag: {selected.rawAccessibility.toiletWheelchair??'missing'}.</p></div>}
        {route?<div className="route-summary"><div className="section-heading"><span className="eyebrow">Your candidate route</span><span className={stale?'pill caution':'pill'}>{stale?'Recalculation needed':'Current context'}</span></div><h2>{routeNames?.start} → {routeNames?.end}</h2><div className="metrics"><div><small>Distance</small><strong>{Math.round(route.distanceM)} m</strong></div><div><small>Estimated time</small><strong>{Math.ceil(route.durationS/60)} min</strong></div><div><small>Impact</small><strong>{route.routingScope==='personal'?'Personal':'Public'}</strong></div></div>
          {stale&&<p className="banner warning" role="status">Inputs, conditions or data freshness changed. This displayed route is outdated; recalculate before relying on it.</p>}
          {route.routingScope==='personal'&&<p className="banner warning">Includes your temporary avoidance, not publicly verified. Valid until {route.personalValidUntil}.</p>}
          {route.warnings.map(w=><p className="note" key={w}>{w}</p>)}<p className="note">Source: {fixture?'Synthetic fixture — no ORS call':route.source.toUpperCase()} · Calculated {route.computedAt}<br/>Public v{route.hazardVersion} · Personal v{route.personalVersion} · Config v{route.configVersion}</p>
        </div>:<div className="route-placeholder"><span aria-hidden="true">↗</span><div><strong>A route that starts with your needs</strong><p>Choose two points to see distance, estimated time and reported barriers.</p></div></div>}
      </section></div>
      <section className="conditions"><div className="section-heading"><div><p className="eyebrow">Shared knowledge, clearly sourced</p><h2>Conditions around you</h2></div><span className="pill">Updates every 5 seconds</span></div>
      {(contextUnavailable||layersUnavailable)&&<p className="banner warning" role="status">Current conditions could not be verified. Previous map data is not marked as current.</p>}
      <div className="condition-grid">{!layersUnavailable&&reports.map(r=><article className="condition-card" key={r.id}><span className="eyebrow">{fixture?'Fixture · ':''}Public · revision {r.publicRevision}</span><h3>{publicStatus(r,now)}</h3><p>{r.description}</p><p className="note">Source: {r.publicVerification.source==='admin_field_check'?'Independent administrator field check':'Trusted maintainer'}{fixture?' (simulated)':''}<br/>Verified {r.publicVerification.verifiedAt}<br/>Valid until {r.publicVerification.validUntil}</p></article>)}{!layersUnavailable&&mine.map(r=><article className="condition-card" key={r.id}><span className="eyebrow">Only your session</span><h3>{r.personalAvoidance?.effective&&Date.parse(r.personalAvoidance.validUntil)>now?'Your temporary avoidance':'Personal report · inactive'}</h3><p>{r.description}</p><p className="note">Not publicly verified.{r.personalAvoidance&&` Valid until ${r.personalAvoidance.validUntil}. Expiry does not mean the barrier is gone.`}</p></article>)}</div>
      {!loading&&!layersUnavailable&&reports.length===0&&mine.length===0&&<p className="note">No reports returned for this region. This does not confirm that paths are clear.</p>}
      </section>
      {region&&<details className="panel integration-panel" open={picker} onToggle={e=>setPicker(e.currentTarget.open)}><summary>Location & passage selection preview</summary><p>Shared component for the reporting form. Select a preset passage or a route segment. Report submission and server-generated avoidance previews are supplied by work packages B/C/D.</p>{picker&&<PassagePicker bbox={region.bbox} location={start?.location??null} route={stale?null:route} passages={passages} value={passage} preview={null} now={now} onLocationChange={location=>choose({name:'Selected map point',location})} onChange={setPassage}/>}<p role="status">{passage?'Passage selected. No report saved and no avoidance enabled.':'No passage selected.'}</p></details>}
      <footer><strong>AccessLoop</strong><p>Place accessibility does not guarantee that the journey is accessible. Unknown and expired information must not be treated as clear passage. Candidate routes depend on available data and are not an accessibility certification.</p><span>{fixture?'Synthetic design fixture · not surveyed':'UNSW Kensington · configured coverage only'} · No live turn-by-turn guidance</span></footer>
    </main>
  </>;
}
