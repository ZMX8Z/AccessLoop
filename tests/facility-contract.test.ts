import assert from 'node:assert/strict';
import test from 'node:test';
import { PlaceSchema } from '../src/shared/contracts';

const cloud={id:'ac-place-1',name:'Supplemental toilet',category:'toilet',location:[151.23,-33.92],accessibility:'yes',accessibilityNote:null,source:'accessibility.cloud',sourceId:'cloud-place-1',fetchedAt:'2026-10-18T00:00:00Z',isDemo:true,rawAccessibility:{wheelchair:null,toiletWheelchair:null},sourceMetadata:{provider:'accessibility.cloud',datasetId:'dataset-1',datasetName:'Source organization',originalId:'original-1',licenseId:'license-1',licenseName:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',attribution:'Source organization',rawWheelchair:{accessible:true,partiallyAccessible:null}}};
test('cloud facilities retain real dataset and license metadata instead of masquerading as OSM tags',()=>{
 assert.equal(PlaceSchema.safeParse(cloud).success,true);
 const {sourceMetadata: omitted,...missing}=cloud;void omitted;
 assert.equal(PlaceSchema.safeParse(missing).success,false);
 assert.equal(PlaceSchema.safeParse({...cloud,rawAccessibility:{wheelchair:'yes',toiletWheelchair:null}}).success,false);
 assert.equal(PlaceSchema.safeParse({...cloud,sourceMetadata:{...cloud.sourceMetadata,licenseUrl:'javascript:alert(1)'}}).success,false);
});
