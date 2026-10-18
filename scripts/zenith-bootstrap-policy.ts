import {z} from 'zod';
type State={objects:string[];applied:{name:string;batch:number}[];expected:string[];allowEmptyBootstrap:boolean};
export function planZenithBootstrap(state:State):'initialize'|'ready'{
 const {objects,applied,expected,allowEmptyBootstrap}=state;
 if(expected.length===0||new Set(expected).size!==expected.length)throw new Error('Invalid release migration set.');
 if(objects.length===0){
  if(allowEmptyBootstrap&&applied.length===0)return 'initialize';
  throw new Error('Empty database bootstrap must be explicitly enabled.');
 }
 if(!objects.includes('payload_migrations')||applied.length!==expected.length
  ||new Set(applied.map(row=>row.name)).size!==applied.length
  ||applied.some(row=>!expected.includes(row.name)||!Number.isInteger(row.batch)||row.batch<1)){
  throw new Error('Existing database needs a controlled migration review; automatic migration refused.');
 }
 return 'ready';
}

export function parseAppliedMigrations(value:unknown){return z.object({rows:z.array(z.object({name:z.string(),batch:z.union([z.number().int(),z.string().regex(/^-?\d+$/).transform(Number)]).refine(Number.isSafeInteger)}))}).parse(value).rows}
