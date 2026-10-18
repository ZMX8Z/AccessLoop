import {getPayload} from 'payload';
import {createBusinessRepository} from '../src/server/storage/business-repository';
import {dRoutingFixture} from '../src/shared/fixtures/d-routing';
import {decodeProviderLedger,restoreProviderLedger} from './zenith-provider-ledger';

async function initialize(){
 process.env.DISABLE_PAYLOAD_HMR='true';
 const ledger=process.env.PROVIDER_LEDGER_SNAPSHOT?decodeProviderLedger(process.env.PROVIDER_LEDGER_SNAPSHOT):null;
 const {default:config,assertPayloadEnvironment}=await import('../src/payload.config');assertPayloadEnvironment();
 const payload=await getPayload({config});
 try{
  if(ledger)console.info('Provider ledger restore:',JSON.stringify(await restoreProviderLedger(payload,ledger)));
  if((await payload.count({collection:'admins',overrideAccess:true})).totalDocs===0){
   const email=process.env.ADMIN_EMAIL?.trim(),password=process.env.ADMIN_PASSWORD;
   if(!email||!/^\S+@\S+\.\S+$/.test(email)||!password||password.length<12)throw new Error('Private administrator bootstrap settings are required.');
   await payload.create({collection:'admins',overrideAccess:true,context:{bootstrapAdmin:true},data:{email,password,role:'operator',enabled:true}});
   console.info('Initial operator created.');
  }else console.info('Existing operator accounts preserved.');
  if(process.env.APP_MODE==='demo'){
   const regionId=process.env.REGION_ID;
   if(!regionId)throw new Error('Demo region identifier is required.');
   const repository=createBusinessRepository(payload);
   if(!await repository.getRegion(regionId)){
    await repository.seedRegion({region:{...dRoutingFixture.region,id:regionId,name:'UNSW Kensington facilities demo — routes not field validated'},presetPassages:[{...dRoutingFixture.passages[0],id:regionId+'-passage',name:'Synthetic demo passage — not field validated'}],source:{kind:'synthetic',note:'Demo coverage and synthetic passage only; no surveyed path or real barrier. Facilities use licensed live providers.'}});
    console.info('Explicitly synthetic demonstration coverage initialized.');
   }else console.info('Existing region preserved.');
  }
 }finally{await payload.destroy()}
}
initialize().then(()=>process.exit(0)).catch(()=>{console.error('Zenith initialization failed. Check migrations and private bootstrap/ledger configuration.');process.exit(1)});
