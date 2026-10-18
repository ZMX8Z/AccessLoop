import assert from 'node:assert/strict';
import test from 'node:test';
import { configuredFacilities } from '../src/server/providers/facility-sources';
import { fakeRepository,region } from './routing-support';

test('malformed optional source configuration fails the places request before upstream calls',async(t)=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({elements:[]})});
 for(const field of ['ACCESSIBILITY_CLOUD_SOURCE_IDS','ACCESSIBILITY_CLOUD_LICENSE_IDS']){
  const environment={ACCESSIBILITY_CLOUD_APP_TOKEN:'test-token',ACCESSIBILITY_CLOUD_LICENSE_IDS:'["test-license"]',[field]:'not-json'};
  const service=configuredFacilities(fakeRepository().repo,environment,{minuteLimit:10,dayLimit:20});
  await assert.rejects(service.getPlaces(region.bbox),{code:'PROVIDER_UNAVAILABLE'});
 }
 assert.equal(calls,0);
});
