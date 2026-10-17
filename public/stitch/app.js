'use strict';
// Interactive migration of the supplied Stitch documents. This is an explicitly
// labelled, browser-local design prototype; no API success or AI result is simulated.
const page = document.body.dataset.page;
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escapeText = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const key = 'accessloop-stitch-v2';
const now = Date.now();
const defaults = {
  start:'West Gate', end:'Engineering Hall', routeReady:true, journey:false, paused:false,
  filter:'all', returnTo:'route', draft:null, lastReport:null,
  reports:[
    {id:'DEMO-204',title:'Scaffolding Narrowing',location:'South Quad Breezeway',description:'Scaffolding uprights narrowing the passage past the library turn.',status:'active',validUntil:now+3600000,category:'construction',observedAt:new Date(now).toISOString()},
    {id:'DEMO-174',title:'Lift Maintenance Outage',location:'Transit Center Overpass',description:'Example lift maintenance report. Resolution shown for design review only.',status:'resolved',category:'obstruction',observedAt:new Date(now-86400000).toISOString()},
    {id:'DEMO-189',title:'Steep Curb Ramp',location:'Student Union West Entrance',description:'Example curb report. This is not a verified maintenance record.',status:'resolved',category:'steps_or_kerb',observedAt:new Date(now-172800000).toISOString()},
  ],
};
let state;
try { state = JSON.parse(sessionStorage.getItem(key)) || defaults; } catch { state = defaults; }
function save() {
  try { sessionStorage.setItem(key,JSON.stringify(state)); return true; }
  catch { feedback('Browser storage is full or unavailable. Your changes have not been saved.'); return false; }
}
function go(target) { if(save()) location.assign(target+'.html'); }
let feedbackTimer;
function feedback(message) {
  const box=$('#feedback'); box.textContent=message;box.classList.add('visible');
  clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>box.classList.remove('visible'),5000);
}
const paths={
  mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8',
  volume_up:'M3 9h4l5-4v14l-5-4H3V9ZM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  turn_slight_right:'M6 21v-7c0-5 5-7 11-7m-4-4 4 4-4 4',
  auto_awesome:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
  zoom_in:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0M10 6v8m-4-4h8',
  sync:'M3 3v6h6M3 9a9 9 0 0 1 17-2M21 21v-6h-6m6 0a9 9 0 0 1-17 2',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow_back:'M19 12H5m7-7-7 7 7 7',arrow_forward:'M5 12h14m-7-7 7 7-7 7',
  chevron_right:'m9 5 7 7-7 7',near_me:'m3 10 18-7-7 18-3-8-8-3Z',navigation:'m3 10 18-7-7 18-3-8-8-3Z',
  check:'m5 12 4 4L19 6',check_circle:'m7 12 3 3 7-7M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  add:'M12 5v14M5 12h14',remove:'M5 12h14',close:'m6 6 12 12M6 18 18 6',
  my_location:'M12 2v3m0 14v3M2 12h3m14 0h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  location_on:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  photo_camera:'M3 6h4l2-3h6l2 3h4v14H3ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  add_photo_alternate:'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M8 7h.01',
  person:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 22v-3a8 8 0 0 1 16 0v3',
  accessible_forward:'M15 4h.01M10 8h5l-3 5h5l3 5M12 13H8M7 10a6 6 0 1 0 7 9',
  accessible:'M15 4h.01M10 8h5l-3 5h5l3 5M12 13H8M7 10a6 6 0 1 0 7 9',
  alt_route:'M5 21V8l4-4m-4 4L1 4M5 16l12-8m0 0V3m0 5h5',
  assignment:'M8 4H4v18h16V4h-4M8 2h8v4H8ZM8 11h8M8 16h6',
  tune:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-7 0v6',
  layers:'m2 8 10-6 10 6-10 6L2 8Zm0 5 10 6 10-6M2 18l10 5 10-5',
  schedule:'M12 6v7l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  straighten:'M2 7h20v10H2ZM6 7v5m4-5v3m4-3v5m4-5v3',
  show_chart:'m2 18 6-7 5 3 9-12',share:'M18 4 6 12l12 8M21 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0M9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 20a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  pause:'M8 4v16M16 4v16',play_arrow:'m6 3 15 9-15 9V3Z',report:'m5 2 14 0 3 6v8l-3 6H5l-3-6V8l3-6ZM12 7v6m0 4h.01',
  stop_circle:'M8 8h8v8H8ZM22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  history:'M3 3v6h6M3 9a9 9 0 1 1 0 7M12 7v6l4 2',visibility:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  edit:'m4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4',delete:'M3 5h18M8 5V2h8v3M5 5l1 17h12l1-17M10 9v9m4-9v9',
  info:'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',help_outline:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
function icon(name){return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]||paths.info}"/></svg>`;}
function icons(root=document){$$('.material-symbols-outlined',root).forEach(el=>{if(el.querySelector('svg'))return;el.innerHTML=icon(el.textContent.trim());el.setAttribute('aria-hidden','true')});}
function buttonByText(text){return $$('button').find(b=>b.textContent.includes(text));}
function on(selector,callback){const el=$(selector);if(el)el.addEventListener('click',callback);}
function bindText(text,callback){buttonByText(text)?.addEventListener('click',callback);}
function dialog(title,content){
  const box=document.createElement('dialog');box.className='stitch-dialog';
  box.innerHTML=`<div class="dialog-header"><h2>${escapeText(title)}</h2><button class="close-dialog" aria-label="Close panel">×</button></div>${content}`;
  document.body.append(box);$('.close-dialog',box).onclick=()=>box.close();box.addEventListener('close',()=>box.remove());box.addEventListener('click',event=>{if(event.target===box)box.close()});box.showModal();return box;
}
function initCommon(){
  const note=document.createElement('div');note.className='demo-note';note.textContent='Interactive design demo · example data · no live navigation or submissions';
  $('main').prepend(note);
  const active=page==='report-detail'?'my-reports':page.startsWith('report')?'report':page==='my-reports'?'my-reports':page==='barrier-detail'?'route':'route';
  if($('nav'))$('nav').innerHTML=[['route','alt_route','Route'],['report-photo','add','Report'],['my-reports','assignment','My Reports']].map(([file,symbol,label])=>`<a href="${file}.html" ${((active==='report'&&file==='report-photo')||file===active||(page==='report-detail'&&file==='my-reports'))?'aria-current="page"':''} class="flex-1 flex flex-col items-center justify-center py-1 px-1 gap-1"><span class="tab-icon text-[24px]">${icon(symbol)}</span><span class="font-label-sm text-label-sm">${label}</span></a>`).join('');
  $$('a[href="report-photo.html"]').forEach(a=>a.onclick=e=>{e.preventDefault();state.returnTo=page==='journey'?'journey':page==='my-reports'?'my-reports':'route';go(state.draft?.stage==='confirm'?'report-confirm':'report-photo')});
  on('button[aria-label="Go back"]',()=>go(page==='journey'?'route':page==='report-confirm'?'report-photo':page==='report-success'?'route':state.returnTo));
  on('[data-cancel]',e=>{e.preventDefault();go(state.returnTo)});
  on('[aria-label="Accessibility Settings"]',()=>dialog('Display & accessibility','<p>Use your browser’s zoom and text-size controls. Every page supports keyboard navigation and keeps visible focus outlines.</p><p>This prototype follows the three-tab Stitch structure. The route map is an illustration, not a live map.</p>'));
  icons();
}
const locations=['West Gate','Engineering Hall','North Atrium Ramp','South Quad Breezeway','Science Lawn','Student Union West Entrance'];
function routePanel(){
  const box=dialog('Plan your route',`<p>Choose from the example campus locations. These are demonstration points, not real search results. The map is a fixed layout illustration; changing labels does not calculate a real route.</p><label for="route-start">Starting point</label><select id="route-start">${locations.map(name=>`<option ${name===state.start?'selected':''}>${name}</option>`).join('')}</select><button id="swap-points" style="margin-top:10px">⇅ Swap endpoints</button><label for="route-end">Destination</label><select id="route-end">${locations.map(name=>`<option ${name===state.end?'selected':''}>${name}</option>`).join('')}</select><label for="search-place">Filter example places</label><input id="search-place" type="search" placeholder="Search campus examples"><div id="search-results" class="panel-choices"></div><p id="search-message" role="status"></p><button id="plan-example" class="primary">Plan demo route</button>`);
  $('#swap-points',box).onclick=()=>{const a=$('#route-start',box),b=$('#route-end',box);[a.value,b.value]=[b.value,a.value]};
  $('#search-place',box).oninput=e=>{const found=locations.filter(name=>name.toLowerCase().includes(e.target.value.toLowerCase()));$('#search-results',box).replaceChildren();found.forEach(name=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>{$('#route-end',box).value=name;$('#search-message',box).textContent='Destination selected.'};$('#search-results',box).append(b)});$('#search-message',box).textContent=found.length?'Choose a destination.':'No matching example. Use the dropdown or change your search.'};
  $('#plan-example',box).onclick=()=>{const start=$('#route-start',box).value,end=$('#route-end',box).value;if(start===end){$('#search-message',box).textContent='Choose different start and destination points.';return}state.start=start;state.end=end;state.routeReady=true;state.journey=false;if(save()){box.close();location.reload()}};
}
function routeSettings(){dialog('Wheelchair parameters','<p>Example configuration. These values do not certify a route as accessible.</p><label>Maximum incline<select><option>6% (3.4°)</option></select></label><label>Maximum kerb height<select><option>0.06 m</option></select></label><label>Minimum width<select><option>0.9 m</option></select></label><p>Additional supported options require the configured route service.</p>');}
function initRoute(){
  $('main h1').textContent=`${state.start} → ${state.end}`;
  const search=$('input[aria-label="Search destination or campus building"]');search.value=state.end;search.readOnly=true;search.onclick=routePanel;search.onkeydown=e=>{if(e.key==='Enter')routePanel()};
  on('[aria-label="Search routes"]',routePanel);on('[aria-label="Route filters"]',routeSettings);
  on('#startJourneyBtn',()=>{state.journey=true;state.paused=false;go('journey')});
  on('#inspectBtn',()=>go('barrier-detail'));
  on('#revertBtn',()=>dialog('Original route','<p>The original example crosses the illustrated barrier. No alternative is automatically selected.</p><button class="primary" id="change-route">Choose endpoints</button>')&&($('#change-route').onclick=()=>{$('dialog').close();routePanel()}));
  on('#recenterBtn',()=>{const graphic=$('svg[viewBox="0 0 360 260"]');graphic?.setAttribute('viewBox','0 0 360 260');feedback('Example map centered on your selected route.')});
  on('[aria-label="Adjust layer preferences"]',()=>{
    const box=dialog('Map & places','<p>Illustrated campus map. Route and barrier marks are examples.</p><label><input type="checkbox" id="barrier-layer" checked style="width:auto;min-height:20px"> Show example barrier</label><div class="panel-choices">'+locations.map(name=>`<button data-place="${name}">${name}<span>→</span></button>`).join('')+'</div>');
    $('#barrier-layer',box).onchange=e=>{const group=$('svg[viewBox="0 0 360 260"] g');if(group)group.style.display=e.target.checked?'':'none'};
    $$('[data-place]',box).forEach(b=>b.onclick=()=>{state.end=b.dataset.place;state.routeReady=true;save();box.close();location.reload()});
  });
  on('[aria-label="Voice input"]',()=>feedback('Voice input is not available in this design demo. Use the place selector.'));
  on('#audioCueBtn',()=>feedback('Voice guidance is not available. Route nodes are shown on the journey page.'));
  on('[aria-label="Share route telemetry"]',async()=>{try{await navigator.clipboard.writeText(`AccessLoop design demo: ${state.start} → ${state.end}. Example route, not for navigation.`);feedback('Demo route summary copied.')}catch{feedback('Copy is unavailable in this browser.')}});
}
function initJourney(){
  if(!state.journey){location.replace('route.html');return}
  $$('main *').filter(el=>el.children.length===0&&el.textContent.includes('West Gate → Engineering Hall')).forEach(el=>el.textContent=`${state.start} → ${state.end}`);
  on('#end-trip-btn',()=>{state.journey=false;state.paused=false;go('route')});
  const pause=$('#pause-journey-btn');function renderPause(){pause.innerHTML=icon(state.paused?'play_arrow':'pause');pause.setAttribute('aria-label',state.paused?'Resume Journey':'Pause Journey');pause.setAttribute('aria-pressed',String(state.paused))}
  renderPause();pause.onclick=()=>{state.paused=!state.paused;save();renderPause();feedback(state.paused?'Journey view paused. No location tracking is running.':'Journey view resumed.')};
  on('#report-issue-btn',()=>{state.returnTo='journey';go(state.draft?.stage==='confirm'?'report-confirm':'report-photo')});
  on('#toggle-audio-btn',()=>feedback('Audio navigation is not connected. Read the route nodes below the map.'));
  on('#emergency-assist-btn',()=>{state.journey=false;go('route')});
  on('#recenter-btn',()=>{window.scrollTo({top:0,behavior:'smooth'});feedback('Showing the retained route map.')});
  on('#elevation-toggle-btn',()=>dialog('Route information','<p>Elevations and surface descriptions in this Stitch screen are examples. Live elevation data is not connected.</p>'));
}
function draft(){return state.draft ||= {photo:null,name:'',category:'construction',description:'',location:'',observedAt:new Date().toISOString(),stage:'photo',avoid:false};}
function savePhoto(file){
  if(!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024){feedback('Choose a JPEG or PNG image of 5 MB or less.');return}
  const reader=new FileReader();reader.onload=()=>{const image=new Image();image.onload=()=>{
    const scale=Math.min(1,1000/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=image.width*scale;canvas.height=image.height*scale;
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const d=draft();d.photo=canvas.toDataURL('image/jpeg',.75);d.name=file.name;d.stage='photo';d.avoid=false;
    if(save())location.reload();
  };image.onerror=()=>feedback('This file could not be decoded as a photo.');image.src=reader.result;};reader.readAsDataURL(file);
}
function initPhoto(){
  const d=draft(),img=$('main img');img.src=d.photo||'evidence.svg';img.alt=d.photo?'Your selected evidence photo':'No evidence selected — illustrated placeholder';
  $$('main *').filter(el=>el.children.length===0&&el.textContent.includes('No photo selected')).forEach(el=>el.textContent=d.name||'No photo selected');
  $$('main *').filter(el=>el.children.length===0&&el.textContent.trim()==='Ready').forEach(el=>el.textContent=d.photo?'Selected':'Choose a photo');
  const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png';input.hidden=true;document.body.append(input);input.onchange=()=>{if(input.files[0])savePhoto(input.files[0])};
  bindText('Take Photo',()=>{input.setAttribute('capture','environment');input.click()});bindText('Upload Gallery',()=>{input.removeAttribute('capture');input.click()});bindText('Retake / Replace',()=>input.click());
  on('[aria-label="Remove uploaded photo"]',()=>{d.photo=null;d.name='';d.stage='photo';d.avoid=false;save();location.reload()});
  const sample=document.createElement('button');sample.className='text-primary min-h-[44px] w-full';sample.textContent='Use illustrated sample evidence';sample.onclick=()=>{d.photo='evidence.svg';d.name='Illustrated sample · demo only';d.stage='photo';if(save())location.reload()};$('#continueBtn').before(sample);
  $('#continueBtn').disabled=!d.photo;
  $('#continueBtn').onclick=()=>{if(!d.photo)return;d.stage='confirm';go('report-confirm')};
  const note=document.createElement('p');note.className='scan-note mt-2';note.textContent='Photos stay in this browser tab. This design demo does not send photos to AI or submit a real report.';$('#continueBtn').after(note);
}
function initConfirm(){
  const d=state.draft;if(!d?.photo){location.replace('report-photo.html');return}
  const photo=$('[data-alt]');photo.style.backgroundImage=`url("${d.photo}")`;
  const width=$('#width-display');width?.closest('.bg-surface-container-low')?.remove();
  const categories={construction:'Construction',steps_or_kerb:'Steps / kerb',surface_damage:'Surface damage',obstruction:'Obstruction',other:'Other'};
  const group=$('[role=radiogroup]');group.innerHTML=Object.entries(categories).map(([value,label])=>`<button type="button" role="radio" aria-checked="${d.category===value}" data-category="${value}">${label}</button>`).join('');
  $$('[data-category]').forEach(button=>button.onclick=()=>{d.category=button.dataset.category;save();$$('[data-category]').forEach(b=>b.setAttribute('aria-checked',String(b===button)))});
  const notes=$('#field-notes');notes.value=d.description;notes.maxLength=1000;notes.oninput=()=>{d.description=notes.value;save()};
  $$('button').filter(b=>b.textContent.trim()==='Edit').forEach(button=>button.onclick=()=>notes.focus());
  const fields=document.createElement('div');fields.className='extra-fields';
  const localTime=new Date(Date.parse(d.observedAt)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  fields.innerHTML=`<p class="scan-note">AI is not connected. Review and describe what you observed manually.</p><label for="observed-location">Observed location</label><select id="observed-location"><option value="">Choose a location</option>${locations.map(name=>`<option ${d.location===name?'selected':''}>${name}</option>`).join('')}</select><label for="observed-at">Observed time</label><input type="datetime-local" id="observed-at" value="${localTime}" max="${new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}"><label><input type="checkbox" id="avoid-demo" ${d.avoid?'checked':''}> Show a personal detour in this demo</label><p class="scan-note">A design preference only. No real avoidance area or public barrier is created.</p><p id="form-error" role="alert" class="text-error"></p>`;
  $('#submit-report-btn').parentElement.before(fields);
  $('#observed-location').onchange=e=>{d.location=e.target.value;save();updateLocation()};$('#observed-at').onchange=e=>{if(e.target.value)d.observedAt=new Date(e.target.value).toISOString();save()};$('#avoid-demo').onchange=e=>{d.avoid=e.target.checked;save()};
  function updateLocation(){$$('span').filter(el=>el.textContent==='South Engineering Breezeway'||el.dataset.location).forEach(el=>{el.dataset.location='true';el.textContent=d.location||'Choose a location below'})}updateLocation();
  const editLocation=$$('button').find(b=>b.textContent.trim()==='Edit');if(editLocation)editLocation.onclick=()=>$('#observed-location').focus();
  bindText('Edit Photo / Rescan',()=>{d.stage='photo';go('report-photo')});
  on('[aria-label="Enlarge photo preview"]',()=>{const box=dialog('Evidence photo','<img alt="Selected report evidence" style="width:100%;border-radius:12px">');$('img',box).src=d.photo});
  $('#submit-report-btn').onclick=()=>{
    if(!d.description.trim()||!d.location||!Number.isFinite(Date.parse(d.observedAt))||Date.parse(d.observedAt)>Date.now()){$('#form-error').textContent='Add a description, select the location and choose an observation time that is not in the future.';return}
    const id='DEMO-'+Date.now().toString(36).toUpperCase();const report={id,title:categories[d.category],location:d.location,description:d.description.trim(),category:d.category,status:d.avoid?'active':'pending',validUntil:d.avoid?Date.now()+3600000:null,observedAt:d.observedAt,photo:d.photo};
    state.reports.unshift(report);state.lastReport=id;state.draft=null;go('report-success');
  };
}
function initSuccess(){
  if(!state.lastReport||!state.reports.some(r=>r.id===state.lastReport)){location.replace('report-photo.html');return}
  $$('main *').filter(el=>el.children.length===0&&el.textContent.includes('#AL-204')).forEach(el=>el.textContent='#'+state.lastReport);
  on('#resume-route-btn',()=>go('route'));
}
function reportStatus(report){return report.status==='active'&&report.validUntil<=Date.now()?'expired':report.status;}
function initReports(){
  const container=$('#reports-container');const templates=$$('article',container).map(el=>el.cloneNode(true));
  let renderedSignature='';
  function render(){
    const signature=JSON.stringify([state.filter,state.reports.map(r=>[r.id,reportStatus(r)])]);
    if(signature===renderedSignature)return;
    renderedSignature=signature;
    const visible=state.reports.filter(r=>state.filter==='all'||reportStatus(r)===state.filter);
    container.replaceChildren();
    visible.forEach(report=>{
      const status=reportStatus(report),template=templates[status==='active'?0:status==='resolved'?2:1].cloneNode(true);
      template.dataset.status=status;
      const title=$('.font-body-bold',template);title.textContent=report.title;
      const id=$('.font-tabular-data',template);id.textContent='#'+report.id;
      const location=$('.font-body-md.truncate',template);location.textContent=report.location;
      const badge=$('.inline-flex',template);badge.textContent=status==='active'?'Active Detour':status==='resolved'?'Resolved':status==='expired'?'Expired · unknown':'Pending · personal';
      $('p',template).textContent=status==='active'?`Personal demo · until ${new Date(report.validUntil).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:report.description;
      const button=$('button',template);button.setAttribute('aria-label','View details for '+report.title);
      template.onclick=()=>{save();locationAssignDetail(report.id)};
      container.append(template);
    });
    if(!visible.length){const empty=document.createElement('p');empty.className='empty-reports';empty.textContent='No reports in this filter.';container.append(empty)}
    [['all',state.reports.length],['active',state.reports.filter(r=>reportStatus(r)==='active').length],['resolved',state.reports.filter(r=>reportStatus(r)==='resolved').length]].forEach(([filter,count])=>{
      const button=$('#filter-'+filter);button.setAttribute('aria-selected',String(state.filter===filter));button.classList.toggle('bg-primary',state.filter===filter);button.classList.toggle('text-on-primary',state.filter===filter);button.classList.toggle('bg-surface-container-high',state.filter!==filter);
      const counts=$$('.font-tabular-data',button);counts.forEach(c=>c.textContent=count);
    });
    $$('span').filter(el=>/^\d+ total$/.test(el.textContent.trim())).forEach(el=>el.textContent=state.reports.length+' total');
    icons(container);
  }
  ['all','active','resolved'].forEach(filter=>on('#filter-'+filter,()=>{state.filter=filter;save();render()}));
  on('[aria-label="Help and reporting guidelines"]',()=>dialog('Your reports','<p>These reports exist only in this browser tab for design testing. Active Detour is a personal demo preference. Resolved examples are not live maintenance records.</p><p>Closing the tab may remove this session. Nothing is submitted to campus facilities.</p>'));
  render();setInterval(render,10000);
}
// These are standalone HTML documents, not Next client-side routes.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
function locationAssignDetail(id){location.assign('report-detail.html?id='+encodeURIComponent(id));}
function initDetail(){
  const barrier=page==='barrier-detail';const id=barrier?'DEMO-204':new URLSearchParams(location.search).get('id');const report=state.reports.find(r=>r.id===id);const content=$('#detail-content');
  on('#detail-back',()=>go(barrier?'route':'my-reports'));
  if(!report){content.innerHTML='<h1>Report not found</h1><p>This report is not available in this browser session.</p>';return}
  const status=reportStatus(report);
  content.innerHTML=`<span class="sample-badge">${barrier?'Route barrier':'My report'} · design demo</span><h1>${escapeText(report.title)}</h1><p>#${escapeText(report.id)}</p><div class="detail-card"><h2>${escapeText(report.location)}</h2><p>${escapeText(report.description)}</p>${report.photo&&!barrier?'<img id="detail-photo" alt="Your report evidence">':''}<p>Status: <strong>${escapeText(status)}</strong></p><p>Observed: ${escapeText(new Date(report.observedAt).toLocaleString())}</p>${report.validUntil?`<p>Valid until: ${escapeText(new Date(report.validUntil).toLocaleString())}</p>`:''}<p>Source: browser-local demonstration. Not publicly verified. Expiry does not mean an obstacle is gone.</p></div><div class="detail-actions"><button id="detail-route">View route</button>${!barrier?'<button id="copy-report">Copy report</button><button id="print-report">Print</button>':''}${!barrier&&status==='active'?'<button id="disable-detour">Stop demo detour</button>':''}${!barrier&&status==='expired'?'<button id="renew-report">Confirm a new observation</button>':''}</div>`;
  if($('#detail-photo'))$('#detail-photo').src=report.photo;
  on('#detail-route',()=>go('route'));on('#print-report',()=>window.print());
  on('#copy-report',async()=>{try{await navigator.clipboard.writeText(`DESIGN DEMO — NOT SUBMITTED\n${report.id}\n${report.title}\n${report.location}\n${report.description}\nStatus: ${status}\nNot publicly verified.`);feedback('Report text copied.')}catch{feedback('Clipboard is unavailable. Use Print instead.')}});
  on('#disable-detour',()=>{report.status='pending';report.validUntil=null;if(save())location.reload()});
  on('#renew-report',()=>{state.draft={photo:report.photo||'evidence.svg',name:'Previous evidence — reconfirm observation',category:report.category,description:report.description,location:report.location,observedAt:new Date().toISOString(),stage:'confirm',avoid:false};state.returnTo='my-reports';go('report-confirm')});
}
initCommon();
({route:initRoute,journey:initJourney,'report-photo':initPhoto,'report-confirm':initConfirm,'report-success':initSuccess,'my-reports':initReports,'report-detail':initDetail,'barrier-detail':initDetail}[page]||(()=>{}))();
icons();
