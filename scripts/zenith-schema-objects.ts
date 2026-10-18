import {sql} from '@payloadcms/db-postgres';

export function schemaObjectsStatement(){return sql`
    SELECT CASE WHEN n.nspname='public' THEN c.relname ELSE n.nspname||'.'||c.relname END AS name
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND left(n.nspname,3)<>'pg_'
    AND c.relkind IN ('r','p','v','m','S','f','c')
    UNION ALL
    SELECT n.nspname||'.'||t.typname AS name
    FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND left(n.nspname,3)<>'pg_'
    AND t.typtype IN ('e','d')
    UNION ALL
    SELECT pg_catalog.pg_describe_object(d.classid,d.objid,d.objsubid) AS name
    FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_namespace n
    ON d.refclassid='pg_catalog.pg_namespace'::regclass AND d.refobjid=n.oid
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND left(n.nspname,3)<>'pg_'
    UNION ALL
    SELECT 'schema:'||nspname AS name FROM pg_catalog.pg_namespace
    WHERE nspname NOT IN ('public','pg_catalog','information_schema') AND left(nspname,3)<>'pg_'
   `}
