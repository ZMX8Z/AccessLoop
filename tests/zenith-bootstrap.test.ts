import assert from 'node:assert/strict';
import test from 'node:test';
import {planZenithBootstrap,parseAppliedMigrations} from '../scripts/zenith-bootstrap-policy';

const expected=['initial','foundation'];
test('a new empty database needs explicit permission before its first migration',()=>{
 assert.equal(planZenithBootstrap({objects:[],applied:[],expected,allowEmptyBootstrap:true}),'initialize');
 assert.throws(()=>planZenithBootstrap({objects:[],applied:[],expected,allowEmptyBootstrap:false}));
});
test('an existing compatible database starts without scheduling migrations',()=>{
 assert.equal(planZenithBootstrap({objects:['admins','payload_migrations'],applied:[{name:'initial',batch:1},{name:'foundation',batch:1}],expected,allowEmptyBootstrap:true}),'ready');
});
test('partial, foreign, development-pushed and newer databases are never automatically migrated',()=>{
 for(const state of [
  {objects:['foreign_table'],applied:[]},
  {objects:['payload_migrations'],applied:[{name:'initial',batch:1}]},
  {objects:['payload_migrations'],applied:[{name:'initial',batch:1},{name:'foundation',batch:-1}]},
  {objects:['payload_migrations'],applied:[{name:'initial',batch:1},{name:'foundation',batch:1},{name:'future',batch:2}]},
  {objects:['payload_migrations'],applied:[{name:'initial',batch:1},{name:'initial',batch:1}]},
 ])assert.throws(()=>planZenithBootstrap({...state,expected,allowEmptyBootstrap:true}));
});

test('migration batches returned as pg numeric strings are parsed without rounding',()=>{
 assert.deepEqual(parseAppliedMigrations({rows:[{name:'initial',batch:'1'},{name:'foundation',batch:2}]}),[{name:'initial',batch:1},{name:'foundation',batch:2}]);
 for(const batch of ['1.5','',null,'9007199254740993'])assert.throws(()=>parseAppliedMigrations({rows:[{name:'initial',batch}]}));
});
