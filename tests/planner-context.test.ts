import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as api from '../src/shared/client/api';
import * as state from '../src/features/routing/client/state';
import { createFixtureService, fixturePlaces } from '../src/features/routing/client/fixtures';
import type { Context } from '../src/features/routing/client/models';

type Element = {type:unknown;props:Record<string,unknown> & {children?:unknown}};
function host(service: ReturnType<typeof createFixtureService>, clock:()=>number=Date.now) {
 const values:unknown[]=[];let cursor=0;
 const effects:(()=>unknown)[]=[];
 const intervals:{run:()=>unknown;ms:number}[]=[];
 const element=(type:unknown,props:Element['props'])=>({type,props});
 const react={
  useState:(initial:unknown)=>{const index=cursor++;if(!(index in values))values[index]=initial;return [values[index],(next:unknown)=>{values[index]=typeof next==='function'?next(values[index]):next}]},
  useRef:(initial:unknown)=>{const index=cursor++;return values[index]??=( {current:initial} )},
  useMemo:(factory:()=>unknown)=>{const index=cursor++;return values[index]??=factory()},
  useEffect:(effect:()=>unknown,deps?:unknown[])=>{const index=cursor++,previous=values[index] as unknown[]|undefined;if(!previous||!deps||deps.some((value,i)=>value!==previous[i]))effects.push(effect);values[index]=deps??[]},
 };
 const imports:Record<string,unknown>={'react/jsx-runtime':{jsx:element,jsxs:element},react,'next/link':{default:()=>null},'@/shared/client/api':api,'@/components/map/MapView':{MapView:()=>null},'@/components/map/PassagePicker':{PassagePicker:()=>null},'@/features/hazards/client/ReportWizard':{ReportWizard:()=>null},'@/features/hazards/client/ReportsList':{ReportsList:()=>null},'./service':{liveService:service},'./fixtures':{createFixtureService:()=>service},'./state':state};
 const source=readFileSync(new URL('../src/features/routing/client/RoutePlanner.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const loaded={exports:{} as {RoutePlanner:(props:object)=>Element}};
 class ClockDate extends Date { static now(){return clock()} }
 vm.runInNewContext(code,{exports:loaded.exports,require:(name:string)=>{assert.ok(name in imports,`Unexpected import ${name}`);return imports[name]},Date:ClockDate,AbortController,setTimeout:()=>0,clearTimeout:()=>{},setInterval:(run:()=>unknown,ms:number)=>{intervals.push({run,ms});return intervals.length},clearInterval:()=>{}});
 const render=(props:object={})=>{
  cursor=0;const nodes:Element[]=[];
  const visit=(value:unknown):void=>{if(Array.isArray(value)){value.forEach(visit);return}if(!value||typeof value!=='object')return;const node=value as Element;nodes.push(node);visit(node.props?.children)};
  visit(loaded.exports.RoutePlanner(props));return nodes;
 };
 return {render,effects,intervals};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function text(node:unknown):string {
 if(Array.isArray(node))return node.map(text).join('');
 if(node&&typeof node==='object')return text((node as Element).props?.children);
 return typeof node==='string'?node:'';
}
test('a delayed planning context cannot roll back a newer polled public set',async()=>{
 const service=createFixtureService();
 const initial=await service.context();
 const newer:Context={...initial,hazardVersion:2,activeDigest:'new-public-set',evaluatedAt:new Date(Date.parse(initial.evaluatedAt)+1000).toISOString()};
 let calls=0;let release!:(context:Context)=>void;
 service.context=async()=>{calls++;if(calls===1)return initial;if(calls===2)return new Promise(resolve=>{release=resolve});return newer};
 const app=host(service);app.render();app.effects.forEach(effect=>effect());await flush();
 // Select real component MapView callbacks, then its Plan button.
 let nodes=app.render();const map=nodes.find(node=>'onPlaceSelect' in node.props)!;
 (map.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[0]);
 nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[1]);
 nodes=app.render();(nodes.find(node=>node.type==='button'&&text(node)==='Plan route →')!.props.onClick as ()=>void)();await flush();
 assert.equal(calls,2);
 await app.intervals.find(timer=>timer.ms===5000)!.run();
 release(initial);await flush();
 nodes=app.render();const output=text(nodes[0]);
 assert.match(output,/Conditions changed/);
 assert.doesNotMatch(output,/Current context/);
});

test('a route computed under a new configuration waits for matching region parameters',async()=>{
 const service=createFixtureService();const initial=await service.context();let contextCalls=0;
 service.context=async()=>++contextCalls===1?initial:{...initial,configVersion:2,evaluatedAt:new Date(Date.parse(initial.evaluatedAt)+1000).toISOString()};
 const originalRoute=service.route;
 service.route=async input=>({...await originalRoute(input),configVersion:2});
 const app=host(service);app.render();app.effects.forEach(effect=>effect());await flush();
 let nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[0]);
 nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[1]);
 nodes=app.render();(nodes.find(node=>node.type==='button'&&text(node)==='Plan route →')!.props.onClick as ()=>void)();await flush();
 const output=text(app.render()[0]);
 assert.match(output,/Conditions changed/);
 assert.doesNotMatch(output,/Current context/);
});

test('observing a config change cancels an old plan while region refresh is pending',async()=>{
 const service=createFixtureService();const initial=await service.context();const region=await service.region();let contexts=0,regions=0;
 let releasePlan!:(value:Context)=>void,releaseRegion!:(value:typeof region)=>void;
 service.context=async()=>{contexts++;if(contexts===1)return initial;if(contexts===2)return new Promise(resolve=>{releasePlan=resolve});return {...initial,configVersion:2,evaluatedAt:new Date(Date.parse(initial.evaluatedAt)+1000).toISOString()}};
 service.region=async()=>++regions===1?region:new Promise(resolve=>{releaseRegion=resolve});
 const app=host(service);app.render();app.effects.forEach(effect=>effect());await flush();
 let nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[0]);
 nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[1]);
 nodes=app.render();(nodes.find(node=>node.type==='button'&&text(node)==='Plan route →')!.props.onClick as ()=>void)();await flush();
 const poll=app.intervals.find(timer=>timer.ms===5000)!.run();await flush();
 releasePlan({...initial,evaluatedAt:new Date(Date.parse(initial.evaluatedAt)+2000).toISOString()});await flush();
 const output=text(app.render()[0]);
 releaseRegion({...region,configVersion:2});await poll;
 assert.doesNotMatch(output,/Current context/);
 assert.match(output,/Conditions changed/);
});


test('report changes preserve journey inputs, invalidate the old route and never auto-call directions', async () => {
 const service=createFixtureService();const original=service.route;const inputs:unknown[]=[];
 service.route=async input=>{inputs.push(input);return original(input)};
 const app=host(service);app.render();app.effects.forEach(effect=>effect());await flush();
 let nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[0]);
 nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[1]);
 nodes=app.render();(nodes.find(node=>node.type==='button'&&text(node)==='Plan route →')!.props.onClick as ()=>void)();await flush();
 nodes=app.render();const launch=nodes.find(node=>node.type==='button'&&text(node)==='Report an obstacle');
 assert.ok(launch,'The live planner must expose the actual reporting flow.');
 (launch.props.onClick as ()=>void)();
 nodes=app.render();const wizard=nodes.find(node=>'onChanged' in node.props&&'passages' in node.props);
 assert.ok(wizard,'The reporter receives the configured passages and current route.');
 assert.ok(wizard.props.route);
 await (wizard.props.onChanged as ()=>Promise<void>)();
 assert.equal(inputs.length,1,'Saving a report must not automatically call directions.');
 nodes=app.render();assert.match(text(nodes[0]),/Recalculation needed/);
 (nodes.find(node=>node.type==='button'&&text(node)==='Recalculate route →')!.props.onClick as ()=>void)();await flush();
 assert.equal(inputs.length,2);assert.deepEqual(inputs[1],inputs[0]);
});

test('a delayed pre-save poll cannot replace the freshly published personal report layer', async () => {
 const service=createFixtureService();const initial=await service.context();let contexts=0,mines=0;
 const next:Context={...initial,personalVersion:1,activeDigest:'after-report-save',evaluatedAt:new Date(Date.parse(initial.evaluatedAt)+1000).toISOString()};
 service.context=async()=>++contexts<=2?initial:next;
 let releaseOldMine!:(value:Awaited<ReturnType<typeof service.mine>>)=>void;
 const saved={id:'new-report',location:fixturePlaces[0].location,description:'Freshly saved personal observation.',status:'pending' as const,personalAvoidance:null};
 service.mine=async()=>{mines++;if(mines===2)return new Promise(resolve=>{releaseOldMine=resolve});return {items:mines>=3?[saved]:[],truncated:false}};
 const app=host(service);app.render();app.effects.forEach(effect=>effect());await flush();
 const oldPoll=app.intervals.find(timer=>timer.ms===5000)!.run();await flush();
 assert.equal(mines,2);
 let nodes=app.render();(nodes.find(node=>node.type==='button'&&text(node)==='Report an obstacle')!.props.onClick as ()=>void)();
 nodes=app.render();const wizard=nodes.find(node=>'onChanged' in node.props&&'passages' in node.props)!;
 await (wizard.props.onChanged as ()=>Promise<void>)();
 assert.match(text(app.render()[0]),/Freshly saved personal observation/);
 releaseOldMine({items:[],truncated:false});await oldPoll;
 assert.match(text(app.render()[0]),/Freshly saved personal observation/,'A prior poll may not erase the acknowledged report.');
});

test('public condition polling does not repeatedly request unchanged facility sources',async()=>{
 const service=createFixtureService(),original=service.places;let facilityReads=0;
 service.places=async(...args)=>{facilityReads++;return original(...args)};
 const app=host(service);app.render();app.effects.forEach(effect=>effect());await flush();
 assert.equal(facilityReads,1);
 await app.intervals.find(timer=>timer.ms===5000)!.run();
 await app.intervals.find(timer=>timer.ms===5000)!.run();
 assert.equal(facilityReads,1,'Facilities must not hammer a failed optional provider every five seconds.');
});

test('a failed facility refresh for new region config clears old data and retries before restoring layers',async()=>{
 const service=createFixtureService(),initial=await service.context(),region=await service.region(),original=service.places;let contexts=0,regions=0,reads=0;
 service.context=async()=>++contexts===1?initial:{...initial,configVersion:2,evaluatedAt:new Date(Date.parse(initial.evaluatedAt)+1000).toISOString()};
 service.region=async()=>++regions===1?region:{...region,configVersion:2,bbox:[151.229,-33.921,151.231,-33.919]};
 service.places=async(...args)=>{if(++reads===2)throw new Error('temporary refresh failure');return reads===1?original(...args):{items:[],truncated:false}};
 const app=host(service);app.render();app.effects.forEach(effect=>effect());await flush();
 const poll=app.intervals.find(timer=>timer.ms===5000)!;
 await poll.run();
 let nodes=app.render();assert.equal((nodes.find(node=>'onPlaceSelect' in node.props)!.props.places as unknown[]).length,0);
 await poll.run();nodes=app.render();
 assert.equal(reads,3,'New config facilities must retry instead of marking an old snapshot current.');
 assert.equal((nodes.find(node=>'onPlaceSelect' in node.props)!.props.places as unknown[]).length,0);
});


test('journey action requires a current route and tabs preserve inputs without directions',async()=>{
 const service=createFixtureService();const original=service.route;let calls=0;
 service.route=async input=>{calls++;return original(input)};
 const app=host(service);app.render();app.effects.forEach(effect=>effect());await flush();
 assert.doesNotMatch(text(app.render()[0]),/Start Journey/);
 let nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[0]);
 nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[1]);
 nodes=app.render();(nodes.find(node=>node.type==='button'&&text(node)==='Plan route →')!.props.onClick as ()=>void)();await flush();
 assert.match(text(app.render()[0]),/Start Journey/);
 app.render({pathname:'/my-reports'});app.render({pathname:'/route/journey'});
 assert.equal(calls,1);
 nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[2]);
 assert.doesNotMatch(text(app.render()[0]),/Start Journey/);
});

test('ordinary detail links capture My Reports as report source and dismiss old layers after navigation',async()=>{
 const app=host(createFixtureService());app.render({pathname:'/my-reports/report-1'});app.effects.forEach(effect=>effect());await flush();
 app.render({pathname:'/report'});let nodes=app.render({pathname:'/report'});
 assert.equal(nodes.find(node=>'returnTo' in node.props&&'onChanged' in node.props)!.props.returnTo,'/my-reports');
 app.render({pathname:'/route'});nodes=app.render({pathname:'/route'});
 (nodes.find(node=>node.props['aria-label']==='Map layers and place list')!.props.onClick as ()=>void)();
 assert.equal(app.render({pathname:'/route'}).find(node=>node.props.className==='route-panel-backdrop')!.props.hidden,false);
 app.render({pathname:'/route/barriers/report-1'});nodes=app.render({pathname:'/route/barriers/report-1'});
 assert.equal(nodes.find(node=>node.props.className==='route-panel-backdrop')!.props.hidden,true);
});

test('successful explicit planning closes its input panel so the route result is visible',async()=>{
 const app=host(createFixtureService());app.render();app.effects.forEach(effect=>effect());await flush();
 let nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[0]);
 nodes=app.render();(nodes.find(node=>'onPlaceSelect' in node.props)!.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[1]);
 nodes=app.render();(nodes.find(node=>node.props['aria-label']==='Wheelchair parameters')!.props.onClick as ()=>void)();
 assert.equal(app.render().find(node=>node.props.className==='route-panel-backdrop')!.props.hidden,false);
 nodes=app.render();await (nodes.find(node=>node.type==='button'&&text(node)==='Plan route →')!.props.onClick as ()=>Promise<void>)();await flush();
 assert.equal(app.render().find(node=>node.props.className==='route-panel-backdrop')!.props.hidden,true);
});


test('unchanged facility suppliers pause outside Route and refresh after returning without directions',async()=>{
 const service=createFixtureService(),originalPlaces=service.places;let reads=0,time=Date.now(),directions=0;
 service.places=async(...args)=>{reads++;return originalPlaces(...args)};service.route=async()=>{directions++;throw new Error('unexpected route')};
 const app=host(service,()=>time);app.render();app.effects.splice(0).forEach(effect=>effect());await flush();assert.equal(reads,1);
 app.render({pathname:'/report'});app.effects.splice(0).forEach(effect=>effect());time+=61000;
 await app.intervals.find(timer=>timer.ms===5000)!.run();assert.equal(reads,1,'the photo flow does not keep calling an unseen facility supplier');
 app.render({pathname:'/route'});app.effects.splice(0).forEach(effect=>effect());await app.intervals.find(timer=>timer.ms===5000)!.run();
 assert.equal(reads,2);assert.equal(directions,0);
});


test('inspecting a facility during a journey preserves endpoints and the planned route', async () => {
 const service=createFixtureService();let directions=0;
 const originalRoute=service.route;service.route=async(...args)=>{directions++;return originalRoute(...args)};
 const app=host(service);app.render();app.effects.splice(0).forEach(effect=>effect());await flush();
 for(const place of fixturePlaces.slice(0,2)){
  const map=app.render().find(node=>'onPlaceSelect' in node.props)!;
  (map.props.onPlaceSelect as (place:unknown)=>void)(place);
 }
 let nodes=app.render();(nodes.find(node=>node.type==='button'&&text(node)==='Plan route →')!.props.onClick as ()=>void)();await flush();
 nodes=app.render({pathname:'/route/journey'});
 const before=nodes.find(node=>'onPlaceSelect' in node.props)!;
 assert.ok(before.props.route);
 (before.props.onPlaceSelect as (place:unknown)=>void)(fixturePlaces[0]);
 const after=app.render({pathname:'/route/journey'}).find(node=>'onPlaceSelect' in node.props)!;
 assert.deepEqual(after.props.start,before.props.start);assert.deepEqual(after.props.end,before.props.end);
 assert.ok(after.props.route,'Facility inspection must not invalidate the active journey.');
 assert.equal(directions,1);
});
