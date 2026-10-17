import type { RoutingService } from './service';
import type { Region, Place, Passage, Context, Route, PublicReport } from './models';
// Opt-in, browser-only synthetic example. Never served from a business endpoint.
const at = () => new Date().toISOString();
export const fixtureRegion: Region = { id:'fixture-only', name:'Campus layout · synthetic example', bbox:[0,0,0.01,0.01], timezone:'Australia/Sydney', isDemo:true, hazardVersion:1, configVersion:1, personalValiditySec:3600, publicValiditySec:86400, avoidanceBufferM:2,
  routing:{ profile:'wheelchair', defaultRestrictions:{ maximum_incline:6, maximum_sloped_kerb:0.06, minimum_width:0.9 }, supportedRestrictions:{ maximum_incline:[6], maximum_sloped_kerb:[0.06], minimum_width:[0.9] } } };
export const fixturePlaces: Place[] = [
  ['West entrance','entrance','yes',0.002,0.002], ['Library entrance','entrance','limited',0.008,0.008], ['Garden rest area','rest_area','unknown',0.003,0.007], ['South steps','other','no',0.007,0.002],
].map(([name,category,accessibility,x,y],i) => ({ id:`fixture-place-${i}`,name:String(name),category:category as Place['category'],accessibility:accessibility as Place['accessibility'],location:[Number(x),Number(y)],accessibilityNote:'Synthetic fixture; not a surveyed location.', source:'Synthetic fixture',sourceId:`example-${i}`, fetchedAt:at(),isDemo:true,rawAccessibility:{wheelchair:accessibility==='unknown'?null:String(accessibility),toiletWheelchair:null} }));
const passages: Passage[] = [{id:'fixture-passage',passageVersion:1,name:'Garden passage · example',geometry:{type:'LineString',coordinates:[[0.002,0.002],[0.003,0.007],[0.008,0.008]]},isDemo:true}];
export function createFixtureService(): RoutingService {
  const context: Context = { regionId:'fixture-only',hazardVersion:1,personalVersion:0,configVersion:1,activeDigest:'fixture-only:1',nextExpiryAt:null,evaluatedAt:at() };
  const reports: PublicReport[] = ['verified','resolved','rejected','verified'].map((status,i) => ({id:`fixture-report-${i}`, regionId:'fixture-only',publicRevision:1,status:status as PublicReport['status'],location:[0.005+i*0.0007,0.005],category:'construction',description:'Synthetic barrier state example — no field observation.',observedAt:at(),publicAvoidGeometry:{type:'Polygon',coordinates:[[[0.0048,0.0048],[0.0052,0.0048],[0.0052,0.0052],[0.0048,0.0052],[0.0048,0.0048]]]},publicVerification:{source:'admin_field_check',verifiedAt:at(),validUntil:new Date(Date.now()+(i===3?-60000:3600000)).toISOString(),resolvedAt:status==='resolved'?at():null},publicActivity:i===3?'expired':status==='verified'?'active':'inactive',isDemo:true}));
  return {
    initialize: async () => ({ready:true,regionId:'fixture-only',isDemo:true}),
    region:async()=>structuredClone(fixtureRegion), context:async()=>({...context,evaluatedAt:at()}),
    places:async()=>({items:structuredClone(fixturePlaces),truncated:false}), passages:async()=>({configVersion:1,items:structuredClone(passages)}),
    publicReports:async()=>({items:structuredClone(reports),truncated:false}),mine:async()=>({items:[],truncated:false}),
    search:async(query)=>({query,items:fixturePlaces.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())).map(({id,name,location,source})=>({id,name,location,source}))}),
    route:async(input):Promise<Route>=>({route:{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:[input.start,[0.003,0.007],input.end]},properties:{}}]},distanceM:785,durationS:720,hazardVersion:context.hazardVersion,personalVersion:context.personalVersion,configVersion:context.configVersion,activeDigest:context.activeDigest,routeRef:'fixture-route',routeRefExpiresAt:new Date(Date.now()+900000).toISOString(),routingScope:'public',personalValidUntil:null,avoidedReportIds:[],computedAt:at(),source:'ors',cacheHit:false,warnings:['Fixture only: this sample line is not routed, measured or checked for accessibility.']}),
  };
}
