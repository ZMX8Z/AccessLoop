import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as contracts from '../src/shared/contracts'
import * as api from '../src/shared/client/api'
import * as routingState from '../src/features/routing/client/state'
import {fixtureRegion} from '../src/features/routing/client/fixtures'

type Node={type:unknown;props:Record<string,unknown>&{children?:unknown}}
const region={...fixtureRegion,bbox:[151.22,-33.93,151.24,-33.91] as contracts.BBox}
const point:contracts.Position=[151.2295,-33.917]
const passage:contracts.PresetPassageDTO={id:'test-passage',passageVersion:1,name:'Synthetic test passage',isDemo:true,geometry:{type:'LineString',coordinates:[point,[151.2298,-33.917]]}}
const text=(node:unknown):string=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text((node as Node).props?.children):typeof node==='string'?node:''
function host(){
 const state:Record<string,unknown[]>={form:[],picker:[]};let active='form',cursor=0
 const writes:contracts.CreateReportInput[]=[]
 const hooks={
  useState(initial:unknown){const values=state[active],i=cursor++;if(!(i in values))values[i]=initial;return[values[i],(next:unknown)=>{values[i]=typeof next==='function'?next(values[i]):next}]},
  useRef(initial:unknown){const values=state[active],i=cursor++;return values[i]??={current:initial}},useEffect(){},
 }
 const component=()=>null
 const element=(type:unknown,props:Node['props'])=>({type,props})
 const imports:Record<string,unknown>={'react/jsx-runtime':{jsx:element,jsxs:element},react:hooks,'@/shared/contracts':contracts,'@/shared/contracts/hazards':contracts,'@/shared/client/api':api,'@/features/routing/client/state':routingState,'./MapView':{MapView:component},'./api':{createReport:async(input:contracts.CreateReportInput)=>{writes.push(input);return{id:'saved-report'}},patchReport:async()=>{throw Error('Not an edit')}}}
 function load(path:string){const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;const loaded={exports:{} as Record<string,(props:Record<string,unknown>)=>Node>};class FormData{constructor(private form:{values:Record<string,string>}){}get(name:string){return this.form.values[name]??null}}vm.runInNewContext(code,{exports:loaded.exports,require:(name:string)=>{assert.ok(name in imports,name);return imports[name]},FormData,Date,Intl,setInterval:()=>0,clearInterval(){}});return loaded.exports}
 const Picker=load('src/components/map/PassagePicker.tsx').PassagePicker
 imports['@/components/map/PassagePicker']={PassagePicker:Picker}
 const Form=load('src/features/hazards/client/ReportForm.tsx').ReportForm
 let description='Tables obstruct the corridor.'
 const flatten=(node:unknown,nodes:Node[]=[]):Node[]=>{if(Array.isArray(node)){node.forEach(n=>flatten(n,nodes));return nodes}if(node&&typeof node==='object'){nodes.push(node as Node);flatten((node as Node).props.children,nodes)}return nodes}
 const render=()=>{active='form';cursor=0;return flatten(Form({photoId:'owned-photo',region,passages:[passage],route:null,description,onFactsChange:(_category:unknown,value:string)=>{description=value},onReportCreated:()=>{}}))}
 const picker=()=>{const props=render().find(node=>node.type===Picker)!.props;active='picker';cursor=0;return flatten(Picker(props))}
 const saveButton=()=>render().find(node=>node.type==='button'&&text(node)==='Save report and review avoidance')!
 const selectPassage=()=>{(picker().find(node=>node.type==='input'&&node.props.type==='radio')!.props.onChange as()=>void)()}
 const observe=()=>{(render().find(node=>node.type==='button'&&text(node)==='Observed now · use device time')!.props.onClick as()=>void)()}
 const mapPoint=()=>{(picker().find(node=>'onLocationChange'in node.props)!.props.onLocationChange as(value:contracts.Position)=>void)(point)}
 const submit=(longitude:string,latitude:string)=>{(picker().find(node=>node.type==='form')!.props.onSubmit as(event:unknown)=>void)({preventDefault(){},currentTarget:{values:{longitude,latitude}}})}
 return{render,picker,writes,saveButton,selectPassage,observe,mapPoint,submit}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve))
test('preset reporting without a route does not render unusable route-segment fields',()=>{
 const h=host();h.selectPassage()
 assert.equal(h.picker().filter(node=>node.type==='select').length,0,'No route should show the preset alternative, not empty From/To dropdowns.')
 assert.match(text(h.picker()[0]),/route is not required/i)
 const map=h.picker().find(node=>'onLocationChange'in node.props)!
 assert.deepEqual(map.props.passage,passage.geometry,'Show the selected passage instead of guessing a report location.')
})
test('Save explains missing required details and invalid coordinates remain rejected',()=>{
 const h=host();h.selectPassage();h.submit('1','2')
 assert.equal(h.saveButton().props.disabled,true)
 assert.match(text(h.picker()[0]),/151\.22/)
 const checklist=h.render().find(node=>node.props['aria-label']==='Before saving')
 assert.ok(checklist,'Explain why saving is disabled.')
 assert.match(text(checklist),/report location/i);assert.match(text(checklist),/observation time/i)
 assert.equal(h.writes.length,0)
})
test('valid map location, observation and preset independently enable a report save without routing',async()=>{
 const h=host();h.selectPassage();h.observe();h.mapPoint()
 assert.equal(h.saveButton().props.disabled,false)
 ;(h.saveButton().props.onClick as()=>void)();await flush()
 assert.equal(h.writes.length,1)
 assert.deepEqual(Array.from(h.writes[0].location),point)
 assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].passage)),{presetPassageId:passage.id,passageVersion:1})
})
test('editing coordinate text revokes Save until those coordinates are explicitly applied',async()=>{
 const h=host();h.selectPassage();h.observe();h.mapPoint()
 assert.equal(h.saveButton().props.disabled,false)
 const longitude=h.picker().find(node=>node.type==='input'&&node.props.name==='longitude')!
 assert.equal(typeof longitude.props.onChange,'function','Unapplied coordinate text must not silently save the previous point.')
 ;(longitude.props.onChange as()=>void)()
 assert.equal(h.saveButton().props.disabled,true)
 ;(h.saveButton().props.onClick as()=>void)();await flush()
 assert.equal(h.writes.length,0)
 h.submit(String(point[0]),String(point[1]));assert.equal(h.saveButton().props.disabled,false)
})
test('a valid map selection clears a prior invalid coordinate error',()=>{
 const h=host();h.submit('1','2');assert.ok(h.picker().find(node=>node.props.role==='alert'))
 h.mapPoint();assert.equal(h.picker().find(node=>node.props.role==='alert'),undefined)
})
