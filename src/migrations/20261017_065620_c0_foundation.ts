import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_provider_usage_service" AS ENUM('ors_directions', 'vision', 'geocoding', 'poi');
  CREATE TYPE "public"."enum_provider_usage_outcome" AS ENUM('reserved', 'started', 'success', 'error');
  CREATE TYPE "public"."enum_provider_blocks_service" AS ENUM('ors_directions', 'vision', 'geocoding', 'poi');
  CREATE TYPE "public"."enum_provider_events_service" AS ENUM('ors_directions', 'vision', 'geocoding', 'poi');
  CREATE TYPE "public"."enum_provider_events_kind" AS ENUM('wait', 'cache_hit');
  CREATE TYPE "public"."enum_hazard_reports_status" AS ENUM('pending', 'ai_assessed', 'verified', 'resolved', 'rejected');
  CREATE TYPE "public"."enum_personal_avoidances_decision_source" AS ENUM('ai_user_confirmed', 'user_manual');
  CREATE TABLE "regions" (
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "bbox" jsonb NOT NULL,
    "timezone" varchar NOT NULL,
    "is_demo" boolean DEFAULT false NOT NULL,
    "hazard_version" numeric DEFAULT 0 NOT NULL,
    "config_version" numeric DEFAULT 1 NOT NULL,
    "personal_validity_sec" numeric NOT NULL,
    "public_validity_sec" numeric NOT NULL,
    "avoidance_buffer_m" numeric NOT NULL,
    "routing" jsonb NOT NULL,
    "seed_source" jsonb NOT NULL,
    "seed_fingerprint" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "preset_passages" (
    "id" varchar PRIMARY KEY NOT NULL,
    "region_id" varchar NOT NULL,
    "passage_version" numeric DEFAULT 1 NOT NULL,
    "name" varchar NOT NULL,
    "geometry" jsonb NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "anonymous_sessions" (
    "id" varchar PRIMARY KEY NOT NULL,
    "owner_session_hash" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "session_contexts" (
    "id" varchar PRIMARY KEY NOT NULL,
    "region_id" varchar NOT NULL,
    "owner_session_hash" varchar NOT NULL,
    "personal_version" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "route_snapshots" (
    "id" varchar PRIMARY KEY NOT NULL,
    "owner_session_hash" varchar NOT NULL,
    "region_id" varchar NOT NULL,
    "geometry" jsonb NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "route_cache" (
    "id" varchar PRIMARY KEY NOT NULL,
    "region_id" varchar NOT NULL,
    "scope_key" varchar NOT NULL,
    "request_hash" varchar NOT NULL,
    "hazard_version" numeric DEFAULT 0 NOT NULL,
    "personal_version" numeric DEFAULT 0 NOT NULL,
    "active_digest" varchar NOT NULL,
    "result" jsonb NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "provider_usage" (
    "id" varchar PRIMARY KEY NOT NULL,
    "key_fingerprint" varchar NOT NULL,
    "service" "enum_provider_usage_service" NOT NULL,
    "reserved_at" timestamp(3) with time zone NOT NULL,
    "started_at" timestamp(3) with time zone,
    "outcome" "enum_provider_usage_outcome" DEFAULT 'reserved' NOT NULL,
    "finished_at" timestamp(3) with time zone,
    "error_code" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "provider_blocks" (
    "id" varchar PRIMARY KEY NOT NULL,
    "key_fingerprint" varchar NOT NULL,
    "service" "enum_provider_blocks_service" NOT NULL,
    "blocked_until" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "provider_events" (
    "id" varchar PRIMARY KEY NOT NULL,
    "service" "enum_provider_events_service" NOT NULL,
    "kind" "enum_provider_events_kind" NOT NULL,
    "occurred_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "idempotency_records" (
    "id" varchar PRIMARY KEY NOT NULL,
    "request_fingerprint" varchar NOT NULL,
    "result" jsonb NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "hazard_reports" (
    "id" varchar PRIMARY KEY NOT NULL,
    "region_id" varchar NOT NULL,
    "owner_session_hash" varchar NOT NULL,
    "status" "enum_hazard_reports_status" NOT NULL,
    "row_version" numeric DEFAULT 1 NOT NULL,
    "public_snapshot" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "personal_avoidances" (
    "id" varchar PRIMARY KEY NOT NULL,
    "report_id" varchar NOT NULL,
    "region_id" varchar NOT NULL,
    "owner_session_hash" varchar NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "confirmed_path" jsonb NOT NULL,
    "avoid_geometry" jsonb NOT NULL,
    "decision_source" "enum_personal_avoidances_decision_source" NOT NULL,
    "observed_at" timestamp(3) with time zone NOT NULL,
    "confirmed_at" timestamp(3) with time zone NOT NULL,
    "valid_until" timestamp(3) with time zone NOT NULL,
    "confirmation_report_version" numeric DEFAULT 1 NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "report_events" (
    "id" varchar PRIMARY KEY NOT NULL,
    "report_id" varchar NOT NULL,
    "actor_id" varchar NOT NULL,
    "actor_role" varchar NOT NULL,
    "action" varchar NOT NULL,
    "before" jsonb NOT NULL,
    "after" jsonb NOT NULL,
    "context_versions" jsonb NOT NULL,
    "reason" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "regions_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "preset_passages_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "anonymous_sessions_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "session_contexts_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "route_snapshots_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "route_cache_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "provider_usage_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "provider_blocks_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "provider_events_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "idempotency_records_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "hazard_reports_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "personal_avoidances_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "report_events_id" varchar;
  CREATE INDEX "regions_updated_at_idx" ON "regions" USING btree ("updated_at");
  CREATE INDEX "regions_created_at_idx" ON "regions" USING btree ("created_at");
  CREATE INDEX "preset_passages_region_id_idx" ON "preset_passages" USING btree ("region_id");
  CREATE INDEX "preset_passages_updated_at_idx" ON "preset_passages" USING btree ("updated_at");
  CREATE INDEX "preset_passages_created_at_idx" ON "preset_passages" USING btree ("created_at");
  CREATE UNIQUE INDEX "anonymous_sessions_owner_session_hash_idx" ON "anonymous_sessions" USING btree ("owner_session_hash");
  CREATE INDEX "anonymous_sessions_updated_at_idx" ON "anonymous_sessions" USING btree ("updated_at");
  CREATE INDEX "anonymous_sessions_created_at_idx" ON "anonymous_sessions" USING btree ("created_at");
  CREATE INDEX "session_contexts_region_id_idx" ON "session_contexts" USING btree ("region_id");
  CREATE INDEX "session_contexts_owner_session_hash_idx" ON "session_contexts" USING btree ("owner_session_hash");
  CREATE INDEX "session_contexts_updated_at_idx" ON "session_contexts" USING btree ("updated_at");
  CREATE INDEX "session_contexts_created_at_idx" ON "session_contexts" USING btree ("created_at");
  CREATE INDEX "route_snapshots_owner_session_hash_idx" ON "route_snapshots" USING btree ("owner_session_hash");
  CREATE INDEX "route_snapshots_region_id_idx" ON "route_snapshots" USING btree ("region_id");
  CREATE INDEX "route_snapshots_expires_at_idx" ON "route_snapshots" USING btree ("expires_at");
  CREATE INDEX "route_snapshots_updated_at_idx" ON "route_snapshots" USING btree ("updated_at");
  CREATE INDEX "route_snapshots_created_at_idx" ON "route_snapshots" USING btree ("created_at");
  CREATE INDEX "route_cache_region_id_idx" ON "route_cache" USING btree ("region_id");
  CREATE INDEX "route_cache_scope_key_idx" ON "route_cache" USING btree ("scope_key");
  CREATE INDEX "route_cache_request_hash_idx" ON "route_cache" USING btree ("request_hash");
  CREATE INDEX "route_cache_expires_at_idx" ON "route_cache" USING btree ("expires_at");
  CREATE INDEX "route_cache_updated_at_idx" ON "route_cache" USING btree ("updated_at");
  CREATE INDEX "route_cache_created_at_idx" ON "route_cache" USING btree ("created_at");
  CREATE INDEX "provider_usage_key_fingerprint_idx" ON "provider_usage" USING btree ("key_fingerprint");
  CREATE INDEX "provider_usage_service_idx" ON "provider_usage" USING btree ("service");
  CREATE INDEX "provider_usage_reserved_at_idx" ON "provider_usage" USING btree ("reserved_at");
  CREATE INDEX "provider_usage_updated_at_idx" ON "provider_usage" USING btree ("updated_at");
  CREATE INDEX "provider_usage_created_at_idx" ON "provider_usage" USING btree ("created_at");
  CREATE INDEX "provider_blocks_key_fingerprint_idx" ON "provider_blocks" USING btree ("key_fingerprint");
  CREATE INDEX "provider_blocks_blocked_until_idx" ON "provider_blocks" USING btree ("blocked_until");
  CREATE INDEX "provider_blocks_updated_at_idx" ON "provider_blocks" USING btree ("updated_at");
  CREATE INDEX "provider_blocks_created_at_idx" ON "provider_blocks" USING btree ("created_at");
  CREATE INDEX "provider_events_service_idx" ON "provider_events" USING btree ("service");
  CREATE INDEX "provider_events_occurred_at_idx" ON "provider_events" USING btree ("occurred_at");
  CREATE INDEX "provider_events_updated_at_idx" ON "provider_events" USING btree ("updated_at");
  CREATE INDEX "provider_events_created_at_idx" ON "provider_events" USING btree ("created_at");
  CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records" USING btree ("expires_at");
  CREATE INDEX "idempotency_records_updated_at_idx" ON "idempotency_records" USING btree ("updated_at");
  CREATE INDEX "idempotency_records_created_at_idx" ON "idempotency_records" USING btree ("created_at");
  CREATE INDEX "hazard_reports_region_id_idx" ON "hazard_reports" USING btree ("region_id");
  CREATE INDEX "hazard_reports_owner_session_hash_idx" ON "hazard_reports" USING btree ("owner_session_hash");
  CREATE INDEX "hazard_reports_updated_at_idx" ON "hazard_reports" USING btree ("updated_at");
  CREATE INDEX "hazard_reports_created_at_idx" ON "hazard_reports" USING btree ("created_at");
  CREATE UNIQUE INDEX "personal_avoidances_report_id_idx" ON "personal_avoidances" USING btree ("report_id");
  CREATE INDEX "personal_avoidances_region_id_idx" ON "personal_avoidances" USING btree ("region_id");
  CREATE INDEX "personal_avoidances_owner_session_hash_idx" ON "personal_avoidances" USING btree ("owner_session_hash");
  CREATE INDEX "personal_avoidances_active_idx" ON "personal_avoidances" USING btree ("active");
  CREATE INDEX "personal_avoidances_observed_at_idx" ON "personal_avoidances" USING btree ("observed_at");
  CREATE INDEX "personal_avoidances_confirmed_at_idx" ON "personal_avoidances" USING btree ("confirmed_at");
  CREATE INDEX "personal_avoidances_valid_until_idx" ON "personal_avoidances" USING btree ("valid_until");
  CREATE INDEX "personal_avoidances_updated_at_idx" ON "personal_avoidances" USING btree ("updated_at");
  CREATE INDEX "personal_avoidances_created_at_idx" ON "personal_avoidances" USING btree ("created_at");
  CREATE INDEX "report_events_report_id_idx" ON "report_events" USING btree ("report_id");
  CREATE INDEX "report_events_updated_at_idx" ON "report_events" USING btree ("updated_at");
  CREATE INDEX "report_events_created_at_idx" ON "report_events" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_regions_fk" FOREIGN KEY ("regions_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_preset_passages_fk" FOREIGN KEY ("preset_passages_id") REFERENCES "public"."preset_passages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_anonymous_sessions_fk" FOREIGN KEY ("anonymous_sessions_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_session_contexts_fk" FOREIGN KEY ("session_contexts_id") REFERENCES "public"."session_contexts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_route_snapshots_fk" FOREIGN KEY ("route_snapshots_id") REFERENCES "public"."route_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_route_cache_fk" FOREIGN KEY ("route_cache_id") REFERENCES "public"."route_cache"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_provider_usage_fk" FOREIGN KEY ("provider_usage_id") REFERENCES "public"."provider_usage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_provider_blocks_fk" FOREIGN KEY ("provider_blocks_id") REFERENCES "public"."provider_blocks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_provider_events_fk" FOREIGN KEY ("provider_events_id") REFERENCES "public"."provider_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_idempotency_records_fk" FOREIGN KEY ("idempotency_records_id") REFERENCES "public"."idempotency_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_hazard_reports_fk" FOREIGN KEY ("hazard_reports_id") REFERENCES "public"."hazard_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_personal_avoidances_fk" FOREIGN KEY ("personal_avoidances_id") REFERENCES "public"."personal_avoidances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_report_events_fk" FOREIGN KEY ("report_events_id") REFERENCES "public"."report_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_regions_id_idx" ON "payload_locked_documents_rels" USING btree ("regions_id");
  CREATE INDEX "payload_locked_documents_rels_preset_passages_id_idx" ON "payload_locked_documents_rels" USING btree ("preset_passages_id");
  CREATE INDEX "payload_locked_documents_rels_anonymous_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("anonymous_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_session_contexts_id_idx" ON "payload_locked_documents_rels" USING btree ("session_contexts_id");
  CREATE INDEX "payload_locked_documents_rels_route_snapshots_id_idx" ON "payload_locked_documents_rels" USING btree ("route_snapshots_id");
  CREATE INDEX "payload_locked_documents_rels_route_cache_id_idx" ON "payload_locked_documents_rels" USING btree ("route_cache_id");
  CREATE INDEX "payload_locked_documents_rels_provider_usage_id_idx" ON "payload_locked_documents_rels" USING btree ("provider_usage_id");
  CREATE INDEX "payload_locked_documents_rels_provider_blocks_id_idx" ON "payload_locked_documents_rels" USING btree ("provider_blocks_id");
  CREATE INDEX "payload_locked_documents_rels_provider_events_id_idx" ON "payload_locked_documents_rels" USING btree ("provider_events_id");
  CREATE INDEX "payload_locked_documents_rels_idempotency_records_id_idx" ON "payload_locked_documents_rels" USING btree ("idempotency_records_id");
  CREATE INDEX "payload_locked_documents_rels_hazard_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("hazard_reports_id");
  CREATE INDEX "payload_locked_documents_rels_personal_avoidances_id_idx" ON "payload_locked_documents_rels" USING btree ("personal_avoidances_id");
  CREATE INDEX "payload_locked_documents_rels_report_events_id_idx" ON "payload_locked_documents_rels" USING btree ("report_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "regions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "preset_passages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "anonymous_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "session_contexts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "route_snapshots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "route_cache" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "provider_usage" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "provider_blocks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "provider_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "idempotency_records" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "hazard_reports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "personal_avoidances" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "report_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_regions_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_preset_passages_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_anonymous_sessions_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_session_contexts_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_route_snapshots_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_route_cache_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_provider_usage_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_provider_blocks_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_provider_events_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_idempotency_records_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_hazard_reports_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_personal_avoidances_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_report_events_fk";

  DROP TABLE "regions" CASCADE;
  DROP TABLE "preset_passages" CASCADE;
  DROP TABLE "anonymous_sessions" CASCADE;
  DROP TABLE "session_contexts" CASCADE;
  DROP TABLE "route_snapshots" CASCADE;
  DROP TABLE "route_cache" CASCADE;
  DROP TABLE "provider_usage" CASCADE;
  DROP TABLE "provider_blocks" CASCADE;
  DROP TABLE "provider_events" CASCADE;
  DROP TABLE "idempotency_records" CASCADE;
  DROP TABLE "hazard_reports" CASCADE;
  DROP TABLE "personal_avoidances" CASCADE;
  DROP TABLE "report_events" CASCADE;
  DROP INDEX "payload_locked_documents_rels_regions_id_idx";
  DROP INDEX "payload_locked_documents_rels_preset_passages_id_idx";
  DROP INDEX "payload_locked_documents_rels_anonymous_sessions_id_idx";
  DROP INDEX "payload_locked_documents_rels_session_contexts_id_idx";
  DROP INDEX "payload_locked_documents_rels_route_snapshots_id_idx";
  DROP INDEX "payload_locked_documents_rels_route_cache_id_idx";
  DROP INDEX "payload_locked_documents_rels_provider_usage_id_idx";
  DROP INDEX "payload_locked_documents_rels_provider_blocks_id_idx";
  DROP INDEX "payload_locked_documents_rels_provider_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_idempotency_records_id_idx";
  DROP INDEX "payload_locked_documents_rels_hazard_reports_id_idx";
  DROP INDEX "payload_locked_documents_rels_personal_avoidances_id_idx";
  DROP INDEX "payload_locked_documents_rels_report_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "regions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "preset_passages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "anonymous_sessions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "session_contexts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "route_snapshots_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "route_cache_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "provider_usage_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "provider_blocks_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "provider_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "idempotency_records_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "hazard_reports_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "personal_avoidances_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "report_events_id";
  DROP TYPE "public"."enum_provider_usage_service";
  DROP TYPE "public"."enum_provider_usage_outcome";
  DROP TYPE "public"."enum_provider_blocks_service";
  DROP TYPE "public"."enum_provider_events_service";
  DROP TYPE "public"."enum_provider_events_kind";
  DROP TYPE "public"."enum_hazard_reports_status";
  DROP TYPE "public"."enum_personal_avoidances_decision_source";`)
}
