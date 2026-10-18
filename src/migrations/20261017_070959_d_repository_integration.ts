import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_provider_blocks_reason" AS ENUM('rate', 'quota');
  ALTER TYPE "public"."enum_provider_events_kind" ADD VALUE 'call';
  ALTER TYPE "public"."enum_provider_events_kind" ADD VALUE 'error';
  CREATE TABLE "service_cache" (
    "id" varchar PRIMARY KEY NOT NULL,
    "result" jsonb NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "route_snapshots" ADD COLUMN "context" jsonb;
  ALTER TABLE "provider_blocks" ADD COLUMN "reason" "enum_provider_blocks_reason";
  ALTER TABLE "provider_events" ADD COLUMN "category" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "service_cache_id" varchar;
  CREATE INDEX "service_cache_expires_at_idx" ON "service_cache" USING btree ("expires_at");
  CREATE INDEX "service_cache_updated_at_idx" ON "service_cache" USING btree ("updated_at");
  CREATE INDEX "service_cache_created_at_idx" ON "service_cache" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_service_cache_fk" FOREIGN KEY ("service_cache_id") REFERENCES "public"."service_cache"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_service_cache_id_idx" ON "payload_locked_documents_rels" USING btree ("service_cache_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "service_cache" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_service_cache_fk";
  DROP TABLE "service_cache" CASCADE;

  DELETE FROM "provider_events" WHERE "kind" IN ('call', 'error');
  ALTER TABLE "provider_events" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_provider_events_kind";
  CREATE TYPE "public"."enum_provider_events_kind" AS ENUM('wait', 'cache_hit');
  ALTER TABLE "provider_events" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_provider_events_kind" USING "kind"::"public"."enum_provider_events_kind";
  DROP INDEX "payload_locked_documents_rels_service_cache_id_idx";
  ALTER TABLE "route_snapshots" DROP COLUMN "context";
  ALTER TABLE "provider_blocks" DROP COLUMN "reason";
  ALTER TABLE "provider_events" DROP COLUMN "category";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "service_cache_id";
  DROP TYPE "public"."enum_provider_blocks_reason";`)
}
