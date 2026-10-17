import assert from 'node:assert/strict';
import test from 'node:test';
import { GET as region } from '../src/app/(frontend)/api/region/route';
import { GET as unsupportedRouteGet } from '../src/app/(frontend)/api/routes/route';
import { GET as health } from '../src/app/(frontend)/api/health/route';
test('without C repository, mounted endpoints fail closed with private safe envelopes',async()=>{
 const response=await region(new Request('https://example.test/api/region'));
 const body=await response.json();assert.equal(response.status,503);assert.equal(body.error.code,'PROVIDER_UNAVAILABLE');
 assert.equal(response.headers.get('X-Request-Id'),body.requestId);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(body.data,undefined);
 assert.equal((await health()).status,200);
});
test('unsupported business method returns controlled JSON and Allow header',async()=>{
 const response=unsupportedRouteGet();assert.equal(response.status,405);assert.equal(response.headers.get('Allow'),'POST');
 assert.ok((await response.json()).error.message);
});
