import assert from 'node:assert/strict';
import test from 'node:test';
import { SupplementedPlacesService } from '../src/features/places/server/supplement';
import { AppError } from '../src/server/http/errors';
import { region } from './routing-support';

const item=(id:string,source='openstreetmap')=>({id,name:id,category:'other' as const,location:[151.23,-33.92] as [number,number],accessibility:'unknown' as const,accessibilityNote:null,source,sourceId:id,fetchedAt:'2026-10-18T00:00:00Z',isDemo:true,rawAccessibility:{wheelchair:null,toiletWheelchair:null}});
const primary={getPlaces:async()=>({items:[item('osm-1')],truncated:false})};
test('facilities report a missing supplement without hiding usable primary places',async()=>{
 const result=await new SupplementedPlacesService(primary,'overpass',null).getPlaces(region.bbox);
 assert.equal(result.items.length,1);
 assert.deepEqual(result.sources,[{provider:'overpass',status:'available'},{provider:'accessibility.cloud',status:'not_configured'}]);
});
test('facilities preserve usable supplementation and mark primary failure explicitly',async()=>{
 const broken={getPlaces:async()=>{throw new AppError(503,'PROVIDER_UNAVAILABLE','Source failed.')}};
 const cloud={getPlaces:async()=>({items:[item('ac-1','accessibility.cloud')],truncated:false})};
 const result=await new SupplementedPlacesService(broken,'overpass',cloud).getPlaces(region.bbox);
 assert.equal(result.items[0].id,'ac-1');assert.equal(result.truncated,true);
 assert.deepEqual(result.sources,[{provider:'overpass',status:'unavailable'},{provider:'accessibility.cloud',status:'available'}]);
 await assert.rejects(new SupplementedPlacesService(broken,'overpass',broken).getPlaces(region.bbox),{code:'PROVIDER_UNAVAILABLE'});
});
test('facilities do not swallow stale-region or out-of-coverage failures as partial source success',async()=>{
 for(const code of ['ROUTE_STALE','OUT_OF_COVERAGE']){
  const bad={getPlaces:async()=>{throw new AppError(409,code,'Area changed.')}};
  await assert.rejects(new SupplementedPlacesService(bad,'overpass',primary).getPlaces(region.bbox),{code});
 }
});
test('combined facilities have a bounded interleaved list without overwriting conflicting sources',async()=>{
 const many=(prefix:string)=>({getPlaces:async()=>({items:Array.from({length:80},(_,i)=>item(prefix+i)),truncated:false})});
 const result=await new SupplementedPlacesService(many('osm-'),'heigit',many('ac-')).getPlaces(region.bbox);
 assert.equal(result.items.length,100);assert.equal(result.truncated,true);assert.deepEqual(result.items.slice(0,4).map(x=>x.id),['osm-0','ac-0','osm-1','ac-1']);
});
