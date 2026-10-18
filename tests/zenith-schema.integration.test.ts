import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {sql} from '@payloadcms/db-postgres';
import {getPayload} from 'payload';
import {withTransaction} from '../src/server/storage/transaction';
import {schemaObjectsStatement} from '../scripts/zenith-schema-objects';

test('bootstrap inspection includes user routines in a schema without relations', {skip:process.env.ACCESSLOOP_ZENITH_SCHEMA_TESTS!=='1'},async()=>{
 const schema='pgcustom_zenith_test_'+randomUUID().replaceAll('-','');
 const {default:config}=await import('../src/payload.config');
 const payload=await getPayload({config,disableOnInit:true});
 const rollback=new Error('owned schema rollback');
 try{
  await assert.rejects(withTransaction(payload,async transaction=>{
   await transaction.execute(sql`CREATE SCHEMA ${sql.identifier(schema)}`);
   await transaction.execute(sql`CREATE FUNCTION ${sql.identifier(schema)}.existing_function() RETURNS integer LANGUAGE sql AS 'SELECT 1'`);
   const result=await transaction.execute(schemaObjectsStatement()) as {rows:{name:string}[]};
   assert.ok(result.rows.some(row=>row.name.includes(schema+'.existing_function')),'a function-only user schema must not be considered empty');
   throw rollback;
  }),error=>error===rollback);
 }finally{await payload.destroy()}
});
