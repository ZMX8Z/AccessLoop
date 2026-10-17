import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoutingHandlers } from '../src/features/routing/server/handlers';
import { RoutingService } from '../src/features/routing/server/service';
import { SearchService } from '../src/features/places/server/search';
import { fakeRepository, instant, region, result } from './routing-support';

test('the public places handler consumes the configured source and retains incomplete-region semantics',async()=>{
 const f=fakeRepository();
 f.repo.getPlaces=async()=>{throw new Error('The legacy repository place source is not configured.')};
 const now=()=>Date.parse(instant);
 const place={id:'osm-node-1',name:'Source place',category:'toilet' as const,location:[151.23,-33.92] as [number,number],accessibility:'yes' as const,accessibilityNote:null,source:'HeiGIT OpenPOI / OpenStreetMap',sourceId:'node/1',fetchedAt:instant,isDemo:true,rawAccessibility:{wheelchair:'yes',toiletWheelchair:null}};
 const handlers=createRoutingHandlers({repository:f.repo,
  routes:new RoutingService(f.repo,{identity:'test',keyFingerprint:'test',directions:async()=>result},{now}),
  search:new SearchService(f.repo,{identity:'test-search',keyFingerprint:'test',search:async()=>[]},{now}),
  places:{getPlaces:async()=>({items:[place],truncated:true})},applicationOrigin:'https://example.test',now,
 });
 const response=await handlers.places(new Request(`https://example.test/api/places?bbox=${region.bbox.join(',')}`));
 assert.equal(response.status,200);
 const {data}=await response.json();
 assert.equal(data.items.length,1);
 assert.equal(data.items[0].accessibility,'unknown');
 assert.equal(data.truncated,true);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
