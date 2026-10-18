import assert from 'node:assert/strict';
import test from 'node:test';
import {createFixtureService} from '../src/features/routing/client/fixtures';
import {routeOutdated} from '../src/features/routing/client/state';
test('route reference expiry invalidates the displayed route even without a version increment',async()=>{
 const service=createFixtureService();const route=await service.route({start:[0.002,0.002],end:[0.008,0.008],profile:'wheelchair',restrictions:(await service.region()).routing.defaultRestrictions});
 assert.equal(routeOutdated(route,await service.context(),Date.parse(route.routeRefExpiresAt)+1),true);
});
