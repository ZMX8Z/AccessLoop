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
function host(service: ReturnType<typeof createFixtureService>) {
 const values:unknown[]=[];let cursor=0;
 const effects:(()=>unknown)[]=[];
 const intervals:{run:()=>unknown;ms:number}[]=[];
 const element=(type:unknown,props:Element['props'])=>({type,props});
 const react={
  useState:(initial:unknown)=>{const index=cursor++;if(!(index in values))values[index]=initial;return [values[index],(next:unknown)=>{values[index]=typeof next==='function'?next(values[index]):next}]},
  useRef:(initial:unknown)=>{const index=cursor++;return values[index]??=( {current:initial} )},
  useMemo:(factory:()=>unknown)=>{const index=cursor++;return values[index]??=factory()},
  useEffect:(effect:()=>unknown)=>{const index=cursor++;if(!(index in values)){values[index]=true;effects.push(effect)}},
 };
 const imports:Record<string,unknown>={'react/jsx-runtime':{jsx:element,jsxs:element},react,'next/link':{default:()=>null},'@/shared/client/api':api,'@/components/map/MapView':{MapView:()=>null},'@/components/map/PassagePicker':{PassagePicker:()=>null},'@/features/hazards/client/ReportWizard':{ReportWizard:()=>null},'./service':{liveService:service},'./fixtures':{createFixtureService:()=>service},'./state':state};
 const source=readFileSync(new URL('../src/features/routing/client/RoutePlanner.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const loaded={exports:{} as {RoutePlanner:(props:object)=>Element}};
 vm.runInNewContext(code,{exports:loaded.exports,require:(name:string)=>{assert.ok(name in imports,`Unexpected import ${name}`);return imports[name]},Date,AbortController,setTimeout:()=>0,clearTimeout:()=>{},setInterval:(run:()=>unknown,ms:number)=>{intervals.push({run,ms});return intervals.length},clearInterval:()=>{}});
 const render=()=>{
  cursor=0;const nodes:Element[]=[];
  const visit=(value:unknown):void=>{if(Array.isArray(value)){value.forEach(visit);return}if(!value||typeof value!=='object')return;const node=value as Element;nodes.push(node);visit(node.props?.children)};
  visit(loaded.exports.RoutePlanner({}));return nodes;
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
