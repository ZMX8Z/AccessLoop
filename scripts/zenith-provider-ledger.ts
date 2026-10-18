import {createHash} from 'node:crypto';
import {gunzipSync,brotliDecompressSync} from 'node:zlib';
import type {Payload} from 'payload';
import {z} from 'zod';
import {ProviderServiceSchema,SessionHashSchema} from '../src/shared/contracts/storage';
import {withTransaction} from '../src/server/storage/transaction';

const id=z.string().min(1).max(128),instant=z.iso.datetime({offset:true});
export const UsageRow=z.strictObject({id,keyFingerprint:SessionHashSchema,service:ProviderServiceSchema,reservedAt:instant,reservationExpiresAt:instant.nullable().optional(),startedAt:instant.nullable().optional(),outcome:z.enum(['reserved','started','success','error']),finishedAt:instant.nullable().optional(),errorCode:z.string().max(200).nullable().optional()});
export const BlockRow=z.strictObject({id,keyFingerprint:SessionHashSchema,service:ProviderServiceSchema,blockedUntil:instant,reason:z.enum(['rate','quota']).nullable().optional()});
export const EventRow=z.strictObject({id,service:ProviderServiceSchema,kind:z.enum(['wait','cache_hit','call','error']),category:z.string().max(200).nullable().optional(),occurredAt:instant});
const unique=<T extends {id:string}>(rows:T[])=>new Set(rows.map(row=>row.id)).size===rows.length;
export const LedgerSchema=z.strictObject({version:z.literal(1),exportedAt:instant,usage:z.array(UsageRow).max(2000).refine(unique),blocks:z.array(BlockRow).max(2000).refine(unique),events:z.array(EventRow).max(4000).refine(unique)});
const groupKey=(row:z.infer<typeof EventRow>|z.infer<typeof EventGroup>)=>JSON.stringify([row.service,row.kind,row.category??null,row.occurredAt]);
const EventGroup=EventRow.omit({id:true}).extend({count:z.number().int().min(1).max(4000)});
export const CompactLedgerSchema=z.strictObject({version:z.literal(2),exportedAt:instant,usage:z.array(UsageRow).max(2000).refine(unique),blocks:z.array(BlockRow).max(2000).refine(unique),eventGroups:z.array(EventGroup).max(4000)})
 .refine(snapshot=>snapshot.eventGroups.reduce((sum,row)=>sum+row.count,0)<=4000)
 .refine(snapshot=>new Set(snapshot.eventGroups.map(groupKey)).size===snapshot.eventGroups.length);
export function decodeProviderLedger(encoded:string){
 try{
  const brotli=encoded.startsWith('br:'),body=brotli?encoded.slice(3):encoded;
  if(encoded.length>30000||!body||!/^[A-Za-z0-9+/]+={0,2}$/.test(body))throw new Error();
  const raw:unknown=JSON.parse((brotli?brotliDecompressSync:gunzipSync)(Buffer.from(body,'base64'),{maxOutputLength:1048576}).toString('utf8'));
  const compact=CompactLedgerSchema.safeParse(raw);
  if(compact.success){
   const {eventGroups,...base}=compact.data;
   const events=eventGroups.flatMap(row=>{const {count,...event}=row;return Array.from({length:count},(_,index)=>({...event,id:'migrated-'+createHash('sha256').update(groupKey(row)+'/'+index).digest('hex')}))});
   return LedgerSchema.parse({...base,version:1,events});
  }
  return LedgerSchema.parse(raw);
 }catch{throw new Error('The private provider ledger snapshot is invalid. No records were restored.');}
}
/** Controlled deployment restore through C's existing Payload transaction; never overwrites or resets usage. */
export async function restoreProviderLedger(payload:Payload,snapshot:z.infer<typeof LedgerSchema>){
 return withTransaction(payload,async({req,lock})=>{
  await lock('deployment-provider-ledger-restore');
  let restored=0,existing=0;
  for(const row of snapshot.usage){const found=await payload.count({collection:'provider-usage',where:{id:{equals:row.id}},overrideAccess:true,req});if(found.totalDocs){existing++;continue}await payload.create({collection:'provider-usage',data:row,overrideAccess:true,req});restored++}
  for(const row of snapshot.blocks){const found=await payload.count({collection:'provider-blocks',where:{id:{equals:row.id}},overrideAccess:true,req});if(found.totalDocs){existing++;continue}await payload.create({collection:'provider-blocks',data:row,overrideAccess:true,req});restored++}
  for(const row of snapshot.events){const found=await payload.count({collection:'provider-events',where:{id:{equals:row.id}},overrideAccess:true,req});if(found.totalDocs){existing++;continue}await payload.create({collection:'provider-events',data:row,overrideAccess:true,req});restored++}
  return {restored,existing};
 });
}
