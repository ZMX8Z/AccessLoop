import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type { MapViewProps } from '../src/components/map/MapView';

type Node={type:unknown;props:Record<string,unknown>&{children?:unknown}};
type Cleanup=void|(()=>void);
function renderHost() {
  const states:unknown[]=[],refs:{current:unknown}[]=[],effects:{run:()=>Cleanup;deps:unknown[]|undefined;cleanup?:Cleanup}[]=[];
  let stateIndex=0,refIndex=0,effectIndex=0,leafletLoads=0,created=0,removed=0;
  const updates:MapViewProps[]=[];const pending:(()=>void)[]=[];
  const node=(type:unknown,props:Node['props'])=>({type,props});
  const imports:Record<string,unknown>={
    'react/jsx-runtime':{jsx:node,jsxs:node},'@/features/routing/client/state':{accessibilityLabels:{},publicStatus:()=>''},react:{
      useState:(initial:unknown)=>{const index=stateIndex++;if(!(index in states))states[index]=initial;return[states[index],(next:unknown)=>{states[index]=next;}];},
      useRef:(initial:unknown)=>{const index=refIndex++;refs[index]??={current:initial};return refs[index];},
      useEffect:(run:()=>Cleanup,deps?:unknown[])=>{const index=effectIndex++,previous=effects[index];if(!previous||!deps||deps.some((value,i)=>value!==previous.deps?.[i]))pending.push(()=>{previous?.cleanup?.();effects[index]={run,deps,cleanup:run()};});},
    },
    './MapSettings':{useMapSettings:()=>({tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© OpenStreetMap contributors',attributionUrl:'https://www.openstreetmap.org/copyright'})},
    './LeafletMap':{createLeafletMap:()=>{created++;return{update:(props:MapViewProps)=>updates.push(props),remove:()=>{removed++;},reset:()=>{}};}},
  };
  const exported:{MapView?:(props:MapViewProps)=>Node}={};
  const code=ts.transpileModule(readFileSync(new URL('../src/components/map/MapView.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports:exported,require:(name:string)=>{if(name==='leaflet'){leafletLoads++;return{};}assert.ok(name in imports,`Unexpected map dependency ${name}`);return imports[name];}});
  const render=(props:MapViewProps)=>{stateIndex=refIndex=effectIndex=0;const root=exported.MapView!(props);const all:Node[]=[];const visit=(value:unknown):void=>{if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;const element=value as Node;all.push(element);if(element.props?.ref)(element.props.ref as {current:unknown}).current={ownerDocument:{}};visit(element.props?.children);};visit(root);return all;};
  return{render,flush:()=>{pending.splice(0).forEach(run=>run());},unmount:()=>{effects.forEach(effect=>effect.cleanup?.());},strictMount:()=>{effects.forEach(effect=>{effect.cleanup=effect.run();});},counts:()=>({leafletLoads,created,removed}),updates};
}
const props:MapViewProps={bbox:[151.22,-33.92,151.24,-33.90],now:1000};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('server render offers an accessible loading state and visible attribution without importing Leaflet',()=>{
  const host=renderHost(),nodes=host.render(props);
  assert.ok(nodes.some(node=>node.props.role==='region'&&String(node.props['aria-label']).includes('map')));
  assert.ok(nodes.some(node=>node.props.role==='status'&&String(node.props.children).includes('Loading')));
  assert.ok(nodes.some(node=>node.type==='a'&&node.props.href==='https://www.openstreetmap.org/copyright'&&node.props.children==='© OpenStreetMap contributors'));
  assert.equal(host.counts().leafletLoads,0);
});

test('a late dynamic import cannot initialize an unmounted map and StrictMode remount creates one current controller',async()=>{
  const host=renderHost();host.render(props);host.flush();host.unmount();await tick();
  assert.equal(host.counts().created,0);host.strictMount();await tick();assert.equal(host.counts().created,1);
  host.unmount();assert.equal(host.counts().removed,1);
});

test('prop updates reach the existing controller without recreating the base map',async()=>{
  const host=renderHost();host.render(props);host.flush();await tick();
  host.render({...props,now:2000,start:[151.23,-33.91]});host.flush();await tick();
  assert.equal(host.counts().created,1);assert.equal(host.counts().leafletLoads,1);assert.equal(host.updates.at(-1)?.now,2000);
  host.unmount();assert.equal(host.counts().removed,1);
});
