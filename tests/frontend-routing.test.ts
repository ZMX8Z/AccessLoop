import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { ApiError, LatestRequest, request } from '../src/shared/client/api';
import { createFixtureService, fixtureRegion } from '../src/features/routing/client/fixtures';
import { publicStatus, routeOutdated, inside } from '../src/features/routing/client/state';
import { publicReportSchema } from '../src/features/routing/client/models';

test('late request cannot replace a newer result or edited input', async()=>{
 const requests=new LatestRequest(); const first=requests.begin(); const second=requests.begin();
 assert.equal(first.signal.aborted,true); assert.equal(first.current(),false);assert.equal(second.current(),true);
 requests.cancel();assert.equal(second.current(),false);
});
test('route invalidates on public, personal, digest and config changes or expiry',async()=>{
 const service=createFixtureService();const context=await service.context();
 const route=await service.route({start:[.002,.002],end:[.008,.008],profile:'wheelchair',restrictions:fixtureRegion.routing.defaultRestrictions});
 assert.equal(routeOutdated(route,context,Date.now()),false);
 for(const changed of [{hazardVersion:2},{personalVersion:1},{activeDigest:'expired-set'},{configVersion:2}])assert.equal(routeOutdated(route,{...context,...changed},Date.now()),true);
 assert.equal(routeOutdated(route,{...context,nextExpiryAt:new Date(Date.now()-1000).toISOString()},Date.now()),true);
 assert.equal(routeOutdated(route,null,Date.now()),true);
});
test('expired report remains unknown, never resolved; public DTO rejects private fields',async()=>{
 const service=createFixtureService();const {items}=await service.publicReports();
 assert.match(publicStatus(items[3],Date.now()),/Expired.*unknown/);
 assert.match(publicStatus(items[1],Date.now()),/Resolved/);
 assert.match(publicStatus(items[2],Date.now()),/Rejected/);
 assert.equal(publicReportSchema.safeParse(items[0]).success,true);
 assert.equal(publicReportSchema.safeParse({...items[0],photoId:'private'}).success,false);
});
test('longitude/latitude and coverage checks reject out-of-region and nonfinite coordinates',()=>{
 assert.equal(inside([.002,.003],fixtureRegion.bbox),true);
 assert.equal(inside([151.23,-33.91],fixtureRegion.bbox),false);
 assert.equal(inside([NaN,.003],fixtureRegion.bbox),false);
});
test('request unwraps response, preserves credentials/no-store, and exposes retry delay',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(_url,options)=>{assert.equal(options?.credentials,'same-origin');assert.equal(options?.cache,'no-store');return Response.json({data:{ok:true},requestId:'test'},{headers:{'X-Request-Id':'test'}})};
  assert.deepEqual(await request('/api/test',z.strictObject({ok:z.boolean()})),{ok:true});
  globalThis.fetch=async()=>Response.json({error:{code:'RATE_LIMITED',message:'Wait',details:{retryAfterSec:12}},requestId:'limited'},{status:429});
  await assert.rejects(request('/api/test',z.unknown()),e=>e instanceof ApiError&&e.code==='RATE_LIMITED'&&e.retryAfterSec===12);
  globalThis.fetch=async()=>new Response('not json',{status:503});
  await assert.rejects(request('/api/test',z.unknown()),e=>e instanceof ApiError&&e.code==='SERVICE_UNAVAILABLE');
 }finally{globalThis.fetch=original}
});

test('consumer region validation rejects version zero under the shared contract', async()=>{
 const {regionSchema}=await import('../src/features/routing/client/models');
 assert.equal(regionSchema.safeParse({...fixtureRegion,configVersion:0}).success,false);
});
test('consumer geometry validation rejects a polygon without a ring', async()=>{
 const {geometrySchema}=await import('../src/features/routing/client/models');
 assert.equal(geometrySchema.safeParse({type:'Polygon',coordinates:[]}).success,false);
});
test('consumer context validation accepts the contract timezone-offset timestamps', async()=>{
 const {contextSchema}=await import('../src/features/routing/client/models');
 const context=await createFixtureService().context();
 assert.equal(contextSchema.safeParse({...context,evaluatedAt:'2030-01-01T11:00:00+11:00'}).success,true);
});


test('context publication is monotonic but accepts a naturally expired effective set',async()=>{
 const {contextCanReplace}=await import('../src/features/routing/client/state');
 const current={...await createFixtureService().context(),hazardVersion:2,personalVersion:1,configVersion:2,evaluatedAt:'2030-01-01T00:00:01Z'};
 assert.equal(contextCanReplace(null,current),true);
 for(const older of [{evaluatedAt:'2030-01-01T00:00:00Z'},{hazardVersion:1},{personalVersion:0},{configVersion:1},{regionId:'another-region'}])assert.equal(contextCanReplace(current,{...current,...older}),false);
 assert.equal(contextCanReplace(current,{...current,activeDigest:'expired-set',evaluatedAt:'2030-01-01T00:00:02Z'}),true);
 assert.equal(contextCanReplace(current,{...current,activeDigest:'ambiguous-set'}),false);
});

test('public report layers reject identifiers invalid under the published C contract',async()=>{
 const report=(await createFixtureService().publicReports()).items[0];
 assert.equal(publicReportSchema.safeParse({...report,id:''}).success,false);
});
test('author layers validate the complete C response before retaining only map fields',async()=>{
 const {mineSchema}=await import('../src/features/routing/client/models');
 const at=new Date().toISOString();
 const report={id:'author-report',regionId:'fixture-only',rowVersion:1,status:'pending',publicRevision:null,photoId:'author-photo',analysis:null,location:[.002,.002],category:'construction',description:'Synthetic map projection.',observedAt:at,passage:null,personalAvoidance:null,publicAvoidGeometry:null,publicVerification:null,publicActivity:'inactive',createdAt:at,updatedAt:at,isDemo:true};
 assert.equal(mineSchema.safeParse({...report,rowVersion:0}).success,false);
 const layer=mineSchema.parse(report);
 assert.equal('photoId' in layer,false);
 assert.equal('analysis' in layer,false);
 assert.equal(layer.id,'author-report');
});
