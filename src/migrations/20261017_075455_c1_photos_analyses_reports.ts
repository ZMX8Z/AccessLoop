import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_photo_upload_operations_state" AS ENUM('pending', 'complete', 'failed');
  CREATE TYPE "public"."enum_external_operations_status" AS ENUM('pending', 'completed');
  CREATE TYPE "public"."enum_photos_purpose" AS ENUM('report', 'review_evidence');
  CREATE TYPE "public"."enum_photos_upload_state" AS ENUM('staging', 'ready');
  CREATE TABLE "photo_upload_operations" (
    "id" varchar PRIMARY KEY NOT NULL,
    "request_fingerprint" varchar NOT NULL,
    "photo_id" varchar NOT NULL,
    "filename" varchar NOT NULL,
    "state" "enum_photo_upload_operations_state" NOT NULL,
    "lease_token" varchar NOT NULL,
    "lease_expires_at" timestamp(3) with time zone NOT NULL,
    "result" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "external_operations" (
    "id" varchar PRIMARY KEY NOT NULL,
    "region_id" varchar NOT NULL,
    "owner_session_hash" varchar NOT NULL,
    "request_fingerprint" varchar NOT NULL,
    "status" "enum_external_operations_status" NOT NULL,
    "lease_token" varchar,
    "lease_expires_at" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "result" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "ai_analyses" (
    "id" varchar PRIMARY KEY NOT NULL,
    "region_id" varchar NOT NULL,
    "owner_session_hash" varchar NOT NULL,
    "photo_id" varchar NOT NULL,
    "image_hash" varchar NOT NULL,
    "cache_key" varchar NOT NULL,
    "analysis" jsonb NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "photos" (
    "id" varchar PRIMARY KEY NOT NULL,
    "region_id" varchar NOT NULL,
    "purpose" "enum_photos_purpose" NOT NULL,
    "owner_session_hash" varchar,
    "owner_admin_id" varchar,
    "image_hash" varchar NOT NULL,
    "upload_state" "enum_photos_upload_state" DEFAULT 'staging' NOT NULL,
    "prefix" varchar DEFAULT 'accessloop/photos',
    "_objectkey" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "url" varchar,
    "thumbnail_u_r_l" varchar,
    "filename" varchar,
    "mime_type" varchar,
    "filesize" numeric,
    "width" numeric,
    "height" numeric,
    "focal_x" numeric,
    "focal_y" numeric
  );

  ALTER TABLE "hazard_reports" ADD COLUMN "facts" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "photo_upload_operations_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "external_operations_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ai_analyses_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "photos_id" varchar;
  CREATE INDEX "photo_upload_operations_lease_expires_at_idx" ON "photo_upload_operations" USING btree ("lease_expires_at");
  CREATE INDEX "photo_upload_operations_updated_at_idx" ON "photo_upload_operations" USING btree ("updated_at");
  CREATE INDEX "photo_upload_operations_created_at_idx" ON "photo_upload_operations" USING btree ("created_at");
  CREATE INDEX "external_operations_region_id_idx" ON "external_operations" USING btree ("region_id");
  CREATE INDEX "external_operations_owner_session_hash_idx" ON "external_operations" USING btree ("owner_session_hash");
  CREATE INDEX "external_operations_expires_at_idx" ON "external_operations" USING btree ("expires_at");
  CREATE INDEX "external_operations_updated_at_idx" ON "external_operations" USING btree ("updated_at");
  CREATE INDEX "external_operations_created_at_idx" ON "external_operations" USING btree ("created_at");
  CREATE INDEX "ai_analyses_region_id_idx" ON "ai_analyses" USING btree ("region_id");
  CREATE INDEX "ai_analyses_owner_session_hash_idx" ON "ai_analyses" USING btree ("owner_session_hash");
  CREATE INDEX "ai_analyses_photo_id_idx" ON "ai_analyses" USING btree ("photo_id");
  CREATE INDEX "ai_analyses_cache_key_idx" ON "ai_analyses" USING btree ("cache_key");
  CREATE INDEX "ai_analyses_updated_at_idx" ON "ai_analyses" USING btree ("updated_at");
  CREATE INDEX "ai_analyses_created_at_idx" ON "ai_analyses" USING btree ("created_at");
  CREATE INDEX "photos_region_id_idx" ON "photos" USING btree ("region_id");
  CREATE INDEX "photos_owner_session_hash_idx" ON "photos" USING btree ("owner_session_hash");
  CREATE INDEX "photos_owner_admin_id_idx" ON "photos" USING btree ("owner_admin_id");
  CREATE INDEX "photos_image_hash_idx" ON "photos" USING btree ("image_hash");
  CREATE INDEX "photos_updated_at_idx" ON "photos" USING btree ("updated_at");
  CREATE INDEX "photos_created_at_idx" ON "photos" USING btree ("created_at");
  CREATE UNIQUE INDEX "photos_filename_idx" ON "photos" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_photo_upload_operations_fk" FOREIGN KEY ("photo_upload_operations_id") REFERENCES "public"."photo_upload_operations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_external_operations_fk" FOREIGN KEY ("external_operations_id") REFERENCES "public"."external_operations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_analyses_fk" FOREIGN KEY ("ai_analyses_id") REFERENCES "public"."ai_analyses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_photos_fk" FOREIGN KEY ("photos_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_photo_upload_operations_id_idx" ON "payload_locked_documents_rels" USING btree ("photo_upload_operations_id");
  CREATE INDEX "payload_locked_documents_rels_external_operations_id_idx" ON "payload_locked_documents_rels" USING btree ("external_operations_id");
  CREATE INDEX "payload_locked_documents_rels_ai_analyses_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_analyses_id");
  CREATE INDEX "payload_locked_documents_rels_photos_id_idx" ON "payload_locked_documents_rels" USING btree ("photos_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "photo_upload_operations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "external_operations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ai_analyses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "photos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_photo_upload_operations_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_external_operations_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ai_analyses_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_photos_fk";
  DROP TABLE "photo_upload_operations" CASCADE;
  DROP TABLE "external_operations" CASCADE;
  DROP TABLE "ai_analyses" CASCADE;
  DROP TABLE "photos" CASCADE;

  DROP INDEX "payload_locked_documents_rels_photo_upload_operations_id_idx";
  DROP INDEX "payload_locked_documents_rels_external_operations_id_idx";
  DROP INDEX "payload_locked_documents_rels_ai_analyses_id_idx";
  DROP INDEX "payload_locked_documents_rels_photos_id_idx";
  ALTER TABLE "hazard_reports" DROP COLUMN "facts";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "photo_upload_operations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "external_operations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ai_analyses_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "photos_id";
  DROP TYPE "public"."enum_photo_upload_operations_state";
  DROP TYPE "public"."enum_external_operations_status";
  DROP TYPE "public"."enum_photos_purpose";
  DROP TYPE "public"."enum_photos_upload_state";`)
}
