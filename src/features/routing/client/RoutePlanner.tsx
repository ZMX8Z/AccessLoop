'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Position, Restrictions, PlacesResultDTO } from '@/shared/contracts';
import { ApiError, errorMessage, LatestRequest, resetSession } from '@/shared/client/api';
import { MapView } from '@/components/map/MapView';
import { ReportsList } from '@/features/hazards/client/ReportsList';
import { ReportWizard } from '@/features/hazards/client/ReportWizard';
import { liveService } from './service';
import { createFixtureService } from './fixtures';
import { accessibilityLabels, contextCanReplace, contextKey, inside, publicStatus, routeOutdated } from './state';
import type { Context, Mine, Passage, Place, PublicReport, Region, Route, SearchResult } from './models';

type Endpoint = {name:string;location:Position};
export function RoutePlanner({fixture=false,pathname='/route',onNavigate,children}:{fixture?:boolean;pathname?:string;onNavigate?:(path:string)=>void;children?:ReactNode}) {
  const service=useMemo(()=>fixture?createFixtureService():liveService,[fixture]);
  const fixtureControls=fixture?(service as ReturnType<typeof createFixtureService>).controls:null;
  const [region,setRegion]=useState<Region|null>(null);
  const [places,setPlaces]=useState<Place[]>([]),[passages,setPassages]=useState<Passage[]>([]);
  const [facilitySources,setFacilitySources]=useState<NonNullable<PlacesResultDTO['sources']>>([]);
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
  const [panel,setPanel]=useState<'journey'|'parameters'|'layers'|null>(null);
  const [reportSource,setReportSource]=useState('/route');
  const panelRef=useRef<HTMLDivElement>(null);
  const [previousPath,setPreviousPath]=useState(pathname);
  // Adjust navigation state before committing the new page, including ordinary Next Links/back.
  if(previousPath!==pathname){
    setPreviousPath(pathname);setPanel(null);
    if(pathname.startsWith('/report')&&!previousPath.startsWith('/report'))setReportSource(previousPath.startsWith('/my-reports')?'/my-reports':previousPath==='/route/journey'?'/route/journey':'/route');
  }
  const routePage=pathname==='/route'||pathname==='/route/journey'||fixture;
  const journey=pathname==='/route/journey';
  const activeRoutePage=useRef(routePage);
  useEffect(()=>{activeRoutePage.current=routePage},[routePage]);
  const reportPage=pathname==='/report'||pathname.startsWith('/report/');
  const listPage=pathname==='/my-reports';
  const focusedReport=reportPage&&!pathname.startsWith('/report/success/');
  const navigate=(path:string)=>{if(path==='/report'&&!reportPage)setReportSource(pathname.startsWith('/my-reports')?'/my-reports':journey?'/route/journey':'/route');setPanel(null);onNavigate?.(path)};
  const beginReport=()=>{setReportSource(journey?'/route/journey':pathname.startsWith('/my-reports')?'/my-reports':'/route');navigate('/report')};
  const reportRefresh=useRef(new LatestRequest());
  const layerEpoch=useRef(0);
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
    if(fixture||typeof window==='undefined')return;
    const changed=()=>{layerEpoch.current++;inputEpoch.current++;routeRequest.current.cancel();setPlanning(false);setInputChanged(true);setContextUnavailable(true);setLayersUnavailable(true);setNotice('Your report changed. Recalculate to use current conditions.');};
    window.addEventListener('accessloop:reports-changed',changed);
    return()=>window.removeEventListener('accessloop:reports-changed',changed);
  },[fixture]);
  useEffect(()=>{
    const routes=routeRequest.current, searches=searchRequest.current, refreshReport=reportRefresh.current;
    let disposed=false;
    let polling=false;
    let activeController:AbortController|undefined;
    const initialEpoch=++layerEpoch.current;
    let lastFacilitiesReadAt=0;
    let lastFacilitiesTruncated=false;
    let facilitiesConfigVersion:number|null=null;
    const layers=async(r:Region,expected:Context,epoch:number,signal:AbortSignal,refreshFacilities=true)=>{
      const [p,ps,pub,own]=await Promise.all([refreshFacilities?service.places(r.bbox,signal):null,refreshFacilities?service.passages(signal):null,service.publicReports(signal),service.mine(signal)]);
      if(disposed||signal.aborted||epoch!==layerEpoch.current||!contextRef.current||contextKey(contextRef.current)!==contextKey(expected))return;
      if(p){setPlaces(p.items);setFacilitySources(p.sources??[]);lastFacilitiesTruncated=p.truncated;lastFacilitiesReadAt=Date.now();facilitiesConfigVersion=r.configVersion}if(ps)setPassages(ps.items);setReports(pub.items);setMine(own.items);setTruncated(lastFacilitiesTruncated||pub.truncated||own.truncated);setLayersUnavailable(false);
    };
    let currentRegion:Region|null=null;
    const initialize=async()=>{
      activeController=new AbortController();
      setLoading(true);setError('');
      try {
        await service.initialize();
        const r=await service.region(activeController.signal);
        const c=await service.context(activeController.signal);
        if(disposed||activeController.signal.aborted||initialEpoch!==layerEpoch.current)return;
        currentRegion=r;setRegion(r);setRestrictions(r.routing.defaultRestrictions);setContext(c);contextRef.current=c;setContextUnavailable(false);
        await layers(r,c,initialEpoch,activeController.signal);
      }catch(cause){if(!disposed&&initialEpoch===layerEpoch.current){setError(errorMessage(cause));setLayersUnavailable(true);setContextUnavailable(true)}}
      finally{if(!disposed)setLoading(false)}
    };
    void initialize();
    const timer=setInterval(async()=>{
      if(disposed||polling||!currentRegion)return;
      polling=true;activeController=new AbortController();
      const controller=activeController,epoch=layerEpoch.current;
      const timeout=setTimeout(()=>controller.abort(),4500);
      try{
        const next=await service.context(controller.signal);
        if(disposed||controller.signal.aborted||epoch!==layerEpoch.current)return;
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
          setReports([]);setMine([]);
        }
        if(configChanged){
          // A known replacement invalidates the old facility snapshot even if region refresh fails.
          setPlaces([]);setPassages([]);setFacilitySources([]);setSelected(null);
          searchRequest.current.cancel();setResults([]);setSearchStatus('');
          replacementRegion=await service.region(controller.signal);
          if(disposed||controller.signal.aborted||epoch!==layerEpoch.current)return;
          // A newer config may have arrived between the two reads. Retry the snapshot next poll.
          if(replacementRegion.configVersion!==next.configVersion)return;
        }
        if(epoch!==layerEpoch.current||!contextCanReplace(contextRef.current,next))return;
        if(configChanged){
          setPlaces([]);setPassages([]);setFacilitySources([]);setSelected(null);lastFacilitiesTruncated=false;
          currentRegion=replacementRegion;
          setRegion(currentRegion);setRestrictions(currentRegion.routing.defaultRestrictions);
          inputEpoch.current++;routeRequest.current.cancel();setPlanning(false);setInputChanged(true);
        }
        setContext(next);contextRef.current=next;setContextUnavailable(false);
        // Retry failed layer refreshes as well as version-triggered refreshes.
        await layers(currentRegion,next,epoch,controller.signal,configChanged||facilitiesConfigVersion!==currentRegion.configVersion||(activeRoutePage.current&&(typeof document==='undefined'||document.visibilityState==='visible')&&Date.now()-lastFacilitiesReadAt>=60000));
      }catch(cause){if(!disposed&&epoch===layerEpoch.current){setContextUnavailable(true);setLayersUnavailable(true);if(cause instanceof ApiError&&cause.code==='UNAUTHENTICATED'){resetSession();setMine([]);setRoute(null);setNotice('Session expired. Reconnect to initialize a new session.')}}}
      finally{clearTimeout(timeout);polling=false}
    },5000);
    return()=>{disposed=true;clearInterval(timer);activeController?.abort();routes.cancel();searches.cancel();refreshReport.cancel()};
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
  function invalidateInput(){inputEpoch.current++;routeRequest.current.cancel();setPlanning(false);setInputChanged(true);setError('');setNotice('Selections changed. Press Plan or Recalculate to update the route.')}
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
      setRoute(result);setRouteNames({start:start.name,end:end.name});setContext(latest);contextRef.current=latest;setContextUnavailable(false);setInputChanged(false);setPanel(null);setNotice('Candidate route ready. Review the sources and current conditions before travelling.');
    }catch(cause){if(task.current()){setInputChanged(true);showError(cause)}}
    finally{if(task.current())setPlanning(false)}
  }
  async function reportChanged(){
    const task=reportRefresh.current.begin(),epoch=++layerEpoch.current;
    inputEpoch.current++;routeRequest.current.cancel();setPlanning(false);setInputChanged(true);
    setContextUnavailable(true);setLayersUnavailable(true);
    setNotice('Your report changed. Recalculate to use the current personal and public conditions.');
    try{
      const next=await service.context(task.signal);
      const [pub,own]=await Promise.all([service.publicReports(task.signal),service.mine(task.signal)]);
      if(!task.current()||epoch!==layerEpoch.current||!region||next.configVersion!==region.configVersion||!contextCanReplace(contextRef.current,next))return;
      setContext(next);contextRef.current=next;setReports(pub.items);setMine(own.items);
      setContextUnavailable(false);setLayersUnavailable(false);
    }catch(cause){if(task.current()&&epoch===layerEpoch.current)showError(cause)}
  }
  const stale=!!route&&(inputChanged||contextUnavailable||routeOutdated(route,context,now));
  const wait=Math.max(0,Math.ceil((retryAt-now)/1000));
  useEffect(()=>{
    if(!panel)return;
    const previous=document.activeElement as HTMLElement|null;
    const node=panelRef.current;
    const controls=()=>Array.from(node?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary')??[]).filter(element=>element.getClientRects().length>0);
    controls()[0]?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setPanel(null);return}if(event.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};
    node?.addEventListener('keydown',key);return()=>{node?.removeEventListener('keydown',key);previous?.focus()};
  },[panel]);
  const facilityCredits=Array.from(new Map(places.flatMap(p=>p.sourceMetadata?[p.sourceMetadata]:[]).map(metadata=>[`${metadata.datasetId}/${metadata.licenseId}`,metadata])).values());
  const selectPlace=(p:Place)=>{setSelected(p);choose({name:p.name,location:p.location})};
  return <div className={`public-app${focusedReport?' focused-report':''}`}>
    <a className="skip-link" href="#public-main">Skip to content</a>
    <header className="app-header">
      {journey?<><Link href="/route" className="icon-button" aria-label="Return to route">←</Link><h1>Journey overview</h1></>:reportPage?<><button className="icon-button" aria-label="Return to previous step" onClick={()=>navigate(pathname==='/report/confirm'?'/report':reportSource)}>←</button><h1>New Barrier Report</h1></>:<Link href="/route" className="brand"><span className="brand-icon" aria-hidden="true"><svg width="28" height="30" viewBox="0 0 28 30" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="17" cy="4" r="2" fill="currentColor"/><path d="m15 9-4 7h8l3 7h3M11 11H7l-2 4M9 17a6 6 0 1 0 8 7M15 9l5 3"/></svg></span>AccessLoop</Link>}
      <div className="app-header-actions">{(fixture||region?.isDemo)&&<span className="demo-badge">● {fixture?'Fixture':'Demo'}</span>}<button className="account-button" aria-label="Session and data information" onClick={()=>setPanel('layers')}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2c0-5 14-5 14 0v2Z"/></svg></button></div>
    </header>
    <main id="public-main" className="public-main" tabIndex={-1}>
      <div hidden={!routePage} className={`route-screen${journey?' journey-screen':''}`}>
        {fixture&&<div className="banner warning"><strong>Design fixture — not for navigation.</strong> Synthetic route and search. <Link href="/route">Open real business pages</Link></div>}
        <section className="route-map" aria-label="Map and route">
          {loading?<div className="empty-state" role="status">Loading region and current conditions…</div>:!region?<div className="empty-state"><h2>Map configuration unavailable</h2><p>Reconnect services or try again after the region is configured.</p><button onClick={()=>setReload(n=>n+1)}>Retry</button></div>:<MapView fitRoute bbox={region.bbox} places={places} route={stale?null:route} start={start?.location} end={end?.location} publicReports={layersUnavailable?[]:reports} mine={layersUnavailable?[]:mine} now={now} onPlaceSelect={selectPlace} onLocationChange={journey?undefined:location=>choose({name:'Selected map point',location})}/>}
          {!journey&&<div className="map-search-bar"><button onClick={()=>setPanel('journey')}><span aria-hidden="true">⌕</span><span>{end?.name??'Where to?'}</span></button><button className="icon-button" aria-label="Wheelchair parameters" onClick={()=>setPanel('parameters')}>☷</button></div>}
          <button className="floating-layers" aria-label="Map layers and place list" onClick={()=>setPanel('layers')}>▱</button>
          {!journey&&<div className="map-selection-hint"><button onClick={()=>{setTarget('start');setPanel('journey')}}>A · {start?.name??'Set start'}</button><button onClick={()=>{setTarget('end');setPanel('journey')}}>B · {end?.name??'Set destination'}</button></div>}
        </section>
        <section className="route-sheet" aria-label={journey?'Journey details':'Route preview'}>
          <div className="sheet-handle" aria-hidden="true"/>
          <div className="section-heading"><span className="eyebrow">{journey?'Your journey':region?.name??'Plan your journey'}</span>{route&&<span className={stale?'pill caution':'pill'}>{stale?'Recalculation needed':'Current context'}</span>}</div>
          <h2>{start?.name??'Choose a starting point'} → {end?.name??'Choose your destination'}</h2>
          {route&&<div className="metrics"><div><small>Distance</small><strong>{Math.round(route.distanceM)} m</strong></div><div><small>Est. time</small><strong>~{Math.ceil(route.durationS/60)} min</strong></div><div><small>Impact</small><strong>{route.routingScope==='personal'?'Personal':'Public'}</strong></div></div>}
          {error&&<div role="alert" className="banner error">{error}<button onClick={()=>{resetSession();setReload(n=>n+1)}}>Reconnect services</button></div>}
          {notice&&<p className="notice" role="status">{notice}</p>}
          {stale&&<p className="banner warning" role="status">This route is outdated. Recalculate before starting or continuing your journey.</p>}
          {journey?<>
            {(!route||stale)?<div className="banner warning">{route?'Route conditions need review.':'Plan a current route before starting a journey.'}<Link href="/route" className="report-link">Return to Route</Link></div>:<>
              <p className="note">Route geometry from {fixture?'a synthetic fixture':route.source.toUpperCase()}. These are reference nodes, not turn-by-turn instructions or arrival tracking. Surface, measured grade and width are unknown.</p>
              <ol className="journey-nodes">{route.route.features[0].geometry.coordinates.filter((_,i,array)=>i===0||i===Math.floor(array.length/2)||i===array.length-1).map((position,i,array)=><li key={i}><span className="node-dot">{i===0?'A':i===array.length-1?'B':'•'}</span><div><strong>{i===0?routeNames?.start:i===array.length-1?routeNames?.end:'Intermediate geometry node'}</strong><p>{position.map(value=>value.toFixed(6)).join(', ')} · longitude, latitude</p></div></li>)}</ol>
            </>}
            <div className="journey-actions"><button onClick={beginReport}>Report Barrier</button><Link className="primary button-link" href="/route">End Journey</Link></div>
          </>:<>
            <div className="route-primary-actions"><button className="primary plan-button" disabled={!start||!end||!restrictions||planning||wait>0} onClick={()=>void plan()}>{planning?'Planning…':wait>0?`Please wait ${wait}s`:route?'Recalculate route →':'Plan route →'}</button>{route&&!stale&&!planning&&<Link className="primary button-link start-journey" href="/route/journey">➤ Start Journey</Link>}</div>
            {!start||!end?<button className="setup-journey" onClick={()=>setPanel('journey')}>Set start & destination →</button>:null}
            {route?.routingScope==='personal'&&<p className="banner warning">Your temporary avoidance, not publicly verified. Valid until {route.personalValidUntil}.</p>}
            {route?.avoidedReportIds.length?<div className="detour-card"><strong>{route.avoidedReportIds.length} report(s) included in avoidance</strong><p>Calculated from current public and personal conditions.</p>{route.avoidedReportIds.map(id=><Link key={id} href={`/route/barriers/${encodeURIComponent(id)}`}>Inspect #{id} →</Link>)}</div>:null}
          </>}
          <details className="route-facts"><summary>Sources, parameters & limitations</summary>{route&&<><p>Source: {fixture?'Synthetic fixture':route.source.toUpperCase()} · Calculated {route.computedAt}</p><p>Public v{route.hazardVersion} · Personal v{route.personalVersion} · Config v{route.configVersion}. Reference expires {route.routeRefExpiresAt}.</p>{route.warnings.map(w=><p key={w}>{w}</p>)}</>}<p>Wheelchair limits: {restrictions?.maximum_incline}% maximum incline, {restrictions?.maximum_sloped_kerb} m maximum kerb, {restrictions?.minimum_width} m minimum width. These are requested limits, not measured route values.</p><p>Candidate route only. Unknown or expired data does not mean clear passage. No live navigation. {region?.isDemo?'Demo region and synthetic passages are not field validated.':''}</p></details>
        </section>
      </div>
      <div hidden={!reportPage} className="report-screen">{!fixture&&<ReportWizard region={region??undefined} passages={passages} route={stale?null:route} onChanged={reportChanged} pathname={pathname} returnTo={reportSource} onNavigate={navigate}/>}</div>
      <div hidden={!listPage} className="reports-screen">{!fixture&&<ReportsList onNavigate={navigate}/>}</div>
      {fixtureControls&&<section className="fixture-controls"><h2>Fixture regression controls</h2><p>Synthetic responses only. No routing supplier requests.</p><button onClick={()=>{choose({name:'Fixture start',location:[0.002,0.002]});setStart({name:'Fixture start',location:[0.002,0.002]});setEnd({name:'Fixture destination',location:[0.008,0.008]})}}>Set fixture endpoints</button><button onClick={()=>fixtureControls.deferNextRoute()}>Delay next fixture route</button><button onClick={()=>fixtureControls.changePublicSet()}>Change fixture public set</button><button onClick={()=>fixtureControls.releaseRoute()}>Release delayed fixture route</button></section>}
      {children}
    </main>
    <div hidden={!panel} className="route-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)setPanel(null)}}>
      <div ref={panelRef} className="route-control-panel" role="dialog" aria-modal="true" aria-label={panel==='layers'?'Map layers and places':panel==='parameters'?'Wheelchair parameters':'Set your journey'}>
        <div className="section-heading"><h2>{panel==='layers'?'Map layers & places':panel==='parameters'?'Wheelchair parameters':'Set your journey'}</h2><button aria-label="Close panel" onClick={()=>setPanel(null)}>×</button></div>
        <div hidden={panel==='layers'}>
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

        <button className="setup-journey" onClick={()=>setPanel(null)}>Done · return to map</button></div>
        <div hidden={panel!=='layers'}><p className="note">{region?.name??'Region unavailable'}. Browser-session identity only; private photos and reports are not publicly published. Closing your browser may lose access.</p><div className="segmented"><button aria-pressed={view==='map'} onClick={()=>setView('map')}>Sources & legend</button><button aria-pressed={view==='list'} onClick={()=>setView('list')}>Place list</button></div>
          <ul className="place-list" hidden={view!=='list'}>{places.map((p,i)=><li key={p.id}><button onClick={()=>{selectPlace(p);setPanel(null)}}><span className={`place-number ${p.accessibility}`}>{i+1}</span><span><strong>{p.name}</strong><small>{accessibilityLabels[p.accessibility]} · {p.source}</small></span></button></li>)}</ul>
        {facilitySources.filter(source=>source.status!=='available').map(source=><p className="banner warning" role="status" key={source.provider}>{source.provider==='accessibility.cloud'?'Supplementary facility data':'OpenStreetMap facility data'} {source.status==='not_configured'?'is not connected.':'is temporarily unavailable. Other available information is shown.'}</p>)}
        {facilityCredits.length>0&&<div className="facility-attributions" aria-label="Facility data sources">{facilityCredits.map(metadata=><p key={metadata.datasetId+'/'+metadata.licenseId}>{metadata.datasetName} via accessibility.cloud · {metadata.licenseUrl?<a href={metadata.licenseUrl} target="_blank" rel="noreferrer noopener">{metadata.licenseName}</a>:metadata.licenseName}{metadata.attribution&&metadata.attribution!==metadata.datasetName?` · ${metadata.attribution}`:''}</p>)}</div>}
        <div className="legend">{Object.entries(accessibilityLabels).map(([key,label])=><span key={key}><b className={`legend-symbol ${key}`}>{key==='yes'?'✓':key==='limited'?'△':key==='no'?'×':'?'}</b>{label}</span>)}</div>
        {truncated&&<p className="banner warning">The service returned a limited set of results. This is not a complete inventory.</p>}
        {selected&&<div className="place-detail"><button className="close" aria-label="Close place details" onClick={()=>setSelected(null)}>×</button><h3>{selected.name}</h3><p>{accessibilityLabels[selected.accessibility]} · {selected.accessibilityNote??'No further access information.'}</p><p className="note">{selected.location.join(', ')} · Source: {selected.source} / {selected.sourceId}<br/>Updated {selected.fetchedAt}. {selected.sourceMetadata?`Provider wheelchair facts: accessible ${String(selected.sourceMetadata.rawWheelchair.accessible??'unknown')}; partially accessible ${String(selected.sourceMetadata.rawWheelchair.partiallyAccessible??'unknown')}.`:`Original wheelchair tag: ${selected.rawAccessibility.wheelchair??'missing'}; toilet tag: ${selected.rawAccessibility.toiletWheelchair??'missing'}.`}</p></div>}

      <section className="conditions"><div className="section-heading"><div><p className="eyebrow">Shared knowledge, clearly sourced</p><h2>Conditions around you</h2></div><span className="pill">Updates every 5 seconds</span></div>
      {(contextUnavailable||layersUnavailable)&&<p className="banner warning" role="status">Current conditions could not be verified. Previous map data is not marked as current.</p>}
      <div className="condition-grid">{!layersUnavailable&&reports.map(r=><article className="condition-card" key={r.id}><span className="eyebrow">{fixture?'Fixture · ':''}Public · revision {r.publicRevision}</span><h3>{publicStatus(r,now)}</h3><Link href={`/route/barriers/${encodeURIComponent(r.id)}`}>Inspect report →</Link><p>{r.description}</p><p className="note">Source: {r.publicVerification.source==='admin_field_check'?'Independent administrator field check':'Trusted maintainer'}{fixture?' (simulated)':''}<br/>Verified {r.publicVerification.verifiedAt}<br/>Valid until {r.publicVerification.validUntil}</p></article>)}{!layersUnavailable&&mine.map(r=><article className="condition-card" key={r.id}><span className="eyebrow">Only your session</span><Link href={`/my-reports/${encodeURIComponent(r.id)}`}>Inspect your report →</Link><h3>{r.personalAvoidance?.effective&&Date.parse(r.personalAvoidance.validUntil)>now?'Your temporary avoidance':'Personal report · inactive'}</h3><p>{r.description}</p><p className="note">Not publicly verified.{r.personalAvoidance&&` Valid until ${r.personalAvoidance.validUntil}. Expiry does not mean the barrier is gone.`}</p></article>)}</div>
      {!loading&&!layersUnavailable&&reports.length===0&&mine.length===0&&<p className="note">No reports returned for this region. This does not confirm that paths are clear.</p>}
      </section>

          <button onClick={beginReport}>Report an obstacle</button>
        </div>
      </div>
    </div>
    {!focusedReport&&<nav className="main-tabs" aria-label="Main Navigation"><Link href="/route" aria-current={routePage||pathname.startsWith('/route/')?'page':undefined}><span aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21v-5C12 9 5 12 5 4m-3 3 3-3 3 3m4 9c0-7 7-4 7-12m-3 3 3-3 3 3"/></svg></span>Route</Link><button aria-current={reportPage?'page':undefined} onClick={beginReport}><span aria-hidden="true">＋</span>Report</button><Link href="/my-reports" aria-current={pathname.startsWith('/my-reports')?'page':undefined}><span aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 4H4v18h16V4h-4M8 2h8v5H8ZM8 11h8M8 15h8M8 19h6"/></svg></span>My Reports</Link></nav>}
  </div>;
}
