import {sql} from '@payloadcms/db-postgres';
import {getPayload,readMigrationFiles} from 'payload';
import {z} from 'zod';
import {migrations} from '../src/migrations';
import {withTransaction} from '../src/server/storage/transaction';
import {planZenithBootstrap,parseAppliedMigrations} from './zenith-bootstrap-policy';

async function bootstrap(){
 if(process.env.PAYLOAD_DROP_DATABASE==='true')throw new Error('Destructive database initialization is forbidden.');
 process.env.DISABLE_PAYLOAD_HMR='true';
 const {default:config,assertPayloadEnvironment}=await import('../src/payload.config');assertPayloadEnvironment();
 const payload=await getPayload({config,disableOnInit:true});
 try{
  await withTransaction(payload,async transaction=>{
   await transaction.lock('deployment-schema-bootstrap');
   const found=z.object({rows:z.array(z.object({name:z.string()}))}).parse(await transaction.execute(sql`
    SELECT CASE WHEN n.nspname='public' THEN c.relname ELSE n.nspname||'.'||c.relname END AS name
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
    AND c.relkind IN ('r','p','v','m','S','f','c')
    UNION ALL
    SELECT n.nspname||'.'||t.typname AS name
    FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
    AND t.typtype IN ('e','d')
   `));
   const objects=found.rows.map(row=>row.name);
   const readApplied=async()=>parseAppliedMigrations(await transaction.execute(sql`SELECT name,batch FROM public.payload_migrations`));
   const expected=migrations.map(migration=>migration.name);
   const action=planZenithBootstrap({objects,applied:objects.includes('payload_migrations')?await readApplied():[],expected,allowEmptyBootstrap:process.env.ZENITH_BOOTSTRAP_EMPTY_DATABASE==='1'});
   if(action==='initialize'){
    // Each C migration commits independently. Partial schemas are refused on the next start.
    const releaseFiles=await readMigrationFiles({payload});
    if(releaseFiles.map(file=>file.name).sort().join('\n')!==[...expected].sort().join('\n'))throw new Error('Release migration files do not match the C migration index.');
    await payload.db.migrate({migrations:releaseFiles});
    planZenithBootstrap({objects:['payload_migrations'],applied:await readApplied(),expected,allowEmptyBootstrap:false});
    console.info('New empty database initialized with the release migrations.');
   }else console.info('Existing migration set verified; migrations skipped.');
  });
 }finally{await payload.destroy()}
}
const deadline=setTimeout(()=>{console.error('Zenith database readiness/initialization deadline exceeded.');process.exit(1)},60000);deadline.unref();
bootstrap().then(()=>{clearTimeout(deadline);process.exit(0)}).catch(()=>{console.error('Zenith database bootstrap failed. Existing data was not reset; check database readiness and migration compatibility.');process.exit(1)});
