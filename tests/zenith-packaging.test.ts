import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('every container stage uses the exact Node runtime required by the application',()=>{
 const runtime=JSON.parse(readFileSync('package.json','utf8')).engines.node as string;
 assert.equal(readFileSync('.nvmrc','utf8').trim(),runtime);
 const bases=[...readFileSync('Dockerfile','utf8').matchAll(/^FROM\s+node:([^\s]+)(?:\s+AS\s+\S+)?$/gmi)].map(match=>match[1]);
 assert.ok(bases.length>=2);
 for(const base of bases)assert.ok(base.startsWith(runtime+'-'),`Container base ${base} violates locked Node ${runtime}`);
});

import {gzipSync,brotliCompressSync} from 'node:zlib';
import {decodeProviderLedger,requireRepeatableEventRestore} from '../scripts/zenith-provider-ledger';
const encode=(value:unknown)=>gzipSync(JSON.stringify(value)).toString('base64');
const ledger=()=>({version:1,exportedAt:'2026-10-18T00:00:00Z',usage:[{id:'reservation-1',keyFingerprint:'a'.repeat(64),service:'vision',reservedAt:'2026-10-17T23:59:00Z',startedAt:'2026-10-17T23:59:01Z',outcome:'error',finishedAt:'2026-10-17T23:59:02Z',errorCode:'PROVIDER_UNAVAILABLE'}],blocks:[{id:'block-1',keyFingerprint:'a'.repeat(64),service:'vision',blockedUntil:'2026-10-18T00:01:00Z',reason:'rate'}],events:[{id:'event-1',service:'vision',kind:'error',category:'PROVIDER_UNAVAILABLE',occurredAt:'2026-10-17T23:59:02Z'}]});
test('private ledger restore retains charged timestamps, error events and quota blocks',()=>{
 const input=ledger(),result=decodeProviderLedger(encode(input));
 assert.deepEqual(result,input);
});
test('ledger restore rejects duplicate identities, unknown fields and invalid services without echoing private input',()=>{
 const duplicate=ledger();duplicate.usage.push(duplicate.usage[0]);
 for(const value of [duplicate,{...ledger(),privateTrip:'secret-sentinel'}, {...ledger(),usage:[{...ledger().usage[0],service:'unknown-secret-sentinel'}]}]){
  assert.throws(()=>decodeProviderLedger(encode(value)),error=>error instanceof Error&&!error.message.includes('secret-sentinel')&&error.message.includes('snapshot is invalid'));
 }
});
test('ledger restore bounds compressed input and decompressed data before parsing',()=>{
 for(const value of ['not base64','a'.repeat(30001),gzipSync('x'.repeat(1048577)).toString('base64')])assert.throws(()=>decodeProviderLedger(value),/snapshot is invalid/);
});
test('compact ledger preserves each event count and stable identity across equivalent restores',()=>{
 const source=ledger();const {id:_id,...event}=source.events[0];void _id;
 const compact={version:2,exportedAt:source.exportedAt,usage:source.usage,blocks:source.blocks,eventGroups:[{...event,count:2}]};
 const first=decodeProviderLedger(encode(compact)),again=decodeProviderLedger(encode(compact));
 assert.equal(first.events.length,2);assert.deepEqual(first.events,again.events);assert.notEqual(first.events[0].id,first.events[1].id);
 for(const row of first.events){assert.equal(row.occurredAt,event.occurredAt);assert.equal(row.kind,event.kind);assert.equal(row.service,event.service)}
 assert.deepEqual(first.usage,source.usage);
});
test('compact ledger refuses inflated counts and duplicate groups instead of fabricating events',()=>{
 const source=ledger();const {id:_id,...event}=source.events[0];void _id;
 for(const groups of [[{...event,count:4001}],[{...event,count:1},{...event,count:1}]]){
  assert.throws(()=>decodeProviderLedger(encode({version:2,exportedAt:source.exportedAt,usage:[],blocks:[],eventGroups:groups})),/snapshot is invalid/);
 }
});

test('Brotli ledger transport preserves bounded records within the platform private-env envelope',()=>{
 const input=ledger();assert.deepEqual(decodeProviderLedger('br:'+brotliCompressSync(JSON.stringify(input)).toString('base64')),input);
});

test('restoring a different event format into an existing ledger is rejected before inserts',()=>{
 const source=ledger(),legacy=decodeProviderLedger(encode(source));const {id:_id,...event}=source.events[0];void _id;
 const compact=decodeProviderLedger(encode({version:2,exportedAt:source.exportedAt,usage:source.usage,blocks:source.blocks,eventGroups:[{...event,count:1}]}));
 assert.throws(()=>requireRepeatableEventRestore(1,new Set(legacy.events.map(row=>row.id)),compact.events.map(row=>row.id)),/incompatible/);
 assert.doesNotThrow(()=>requireRepeatableEventRestore(0,new Set(),compact.events.map(row=>row.id)));
 assert.doesNotThrow(()=>requireRepeatableEventRestore(2,new Set([...compact.events.map(row=>row.id),'a-new-live-event']),compact.events.map(row=>row.id)));
});
