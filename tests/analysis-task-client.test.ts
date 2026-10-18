import assert from 'node:assert/strict'
import test from 'node:test'
import {analyzePhoto} from '../src/features/hazards/client/api'
import {ApiError} from '../src/shared/client/api'
const jobId='a'.repeat(64)
const analysis={analysisId:'analysis-job',photoId:'photo-job',model:'glm-4.6v',promptVersion:'1',schemaVersion:'1',createdAt:'2026-10-18T00:00:00.000Z',cacheHit:false,aiStatus:'unavailable',result:null,unavailableReason:'provider_timeout'}
const json=(data:unknown)=>Response.json({data,requestId:'task-request'})
async function withFetch(run:()=>Promise<void>,fetcher:typeof fetch){const previous=globalThis.fetch;globalThis.fetch=fetcher;try{await run()}finally{globalThis.fetch=previous}}
test('analysis POST returns promptly then only private GETs poll the same job until completion',async()=>{
 const calls:{path:string;method:string;key:string|null}[]=[]
 await withFetch(async()=>{assert.deepEqual(await analyzePhoto('photo-job','same-submit-key'),analysis);assert.deepEqual(calls.map(c=>c.method),['POST','GET','GET']);assert.equal(calls[0].key,'same-submit-key');assert.ok(calls.slice(1).every(c=>c.path===`/api/analyze/${jobId}`&&c.key===null))},async(path,options)=>{
  calls.push({path:String(path),method:options?.method??'GET',key:new Headers(options?.headers).get('Idempotency-Key')})
  return json(calls.length<3?{jobId,status:'pending',pollAfterSec:0}:{jobId,status:'completed',analysis})
 })
})
test('failed task preserves quota semantics without starting another paid request',async()=>{
 let calls=0
 await withFetch(async()=>{await assert.rejects(analyzePhoto('photo-job','quota-submit-key'),e=>e instanceof ApiError&&e.code==='QUOTA_EXHAUSTED');assert.equal(calls,1)},async()=>{calls++;return json({jobId,status:'failed',error:{code:'QUOTA_EXHAUSTED',message:'Configured quota reached.'}})})
})
test('canceling a pending analysis stops polling without starting a replacement job',async()=>{
 const controller=new AbortController();let calls=0
 await withFetch(async()=>{const pending=analyzePhoto('photo-job','cancel-submit-key',controller.signal);const rejected=assert.rejects(pending);await new Promise(resolve=>setImmediate(resolve));controller.abort();await rejected;assert.equal(calls,1)},async()=>{calls++;return json({jobId,status:'pending',pollAfterSec:2})})
})
test('a completed job cannot return an analysis for a different photo',async()=>{
 await withFetch(async()=>{await assert.rejects(analyzePhoto('photo-job','photo-submit-key'),e=>e instanceof ApiError&&e.code==='INVALID_RESPONSE')},async()=>json({jobId,status:'completed',analysis:{...analysis,photoId:'someone-elses-photo'}}))
})
test('a task that never finishes has a finite polling limit and no repeated POST',async()=>{
 let posts=0,gets=0
 await withFetch(async()=>{await assert.rejects(analyzePhoto('photo-job','finite-submit-key'),e=>e instanceof ApiError&&e.code==='PROVIDER_TIMEOUT');assert.equal(posts,1);assert.ok(gets>0&&gets<=93)},async(_path,options)=>{if(options?.method==='POST')posts++;else gets++;return json({jobId,status:'pending',pollAfterSec:0})})
})
