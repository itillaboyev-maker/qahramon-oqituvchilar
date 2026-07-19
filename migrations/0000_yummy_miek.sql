CREATE TYPE "public"."bot_type" AS ENUM('public', 'admin');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'approved', 'published');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('telegram_post', 'instagram_reel_script', 'article', 'documentary_script');--> statement-breakpoint
CREATE TYPE "public"."duplicate_status" AS ENUM('pending', 'confirmed_duplicate', 'not_duplicate');--> statement-breakpoint
CREATE TYPE "public"."flow_type" AS ENUM('none', 'nomination', 'self_submission', 'moderation_review');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('uz-latn', 'uz-cyrl', 'ru', 'en');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('photo', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('draft', 'review', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('new', 'under_review', 'approved', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('student', 'former_student', 'parent', 'colleague', 'school_leader', 'community_member', 'self');--> statement-breakpoint
CREATE TYPE "public"."storage_provider" AS ENUM('telegram', 'r2');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('self', 'nominated');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'moderator', 'editor', 'admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"name_uz_latn" varchar(100) NOT NULL,
	"name_uz_cyrl" varchar(100),
	"name_ru" varchar(100),
	"name_en" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region_id" uuid NOT NULL,
	"code" varchar(10),
	"name_uz_latn" varchar(100) NOT NULL,
	"name_uz_cyrl" varchar(100),
	"name_ru" varchar(100),
	"name_en" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" varchar(64),
	"first_name" varchar(128),
	"last_name" varchar(128),
	"phone" varchar(20),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"locale" "locale" DEFAULT 'uz-latn' NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"normalized_name" varchar(255) NOT NULL,
	"region_id" uuid,
	"district_id" uuid,
	"school" varchar(255),
	"subject" varchar(128),
	"position" varchar(128),
	"years_of_experience" integer,
	"biography" text,
	"achievements" text,
	"educational_philosophy" text,
	"impact_stories" text,
	"publish_status" "publish_status" DEFAULT 'draft' NOT NULL,
	"merged_into_teacher_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"recommender_name" varchar(255),
	"recommender_phone" varchar(20),
	"relationship" "relationship",
	"submission_type" "submission_type" NOT NULL,
	"recommendation_text" text,
	"achievements_text" text,
	"teaching_methods_text" text,
	"student_impact_text" text,
	"evidence_text" text,
	"additional_info" text,
	"status" "recommendation_status" DEFAULT 'new' NOT NULL,
	"moderation_notes" text,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"consent_given" boolean DEFAULT false NOT NULL,
	"consent_given_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"media_type" "media_type" NOT NULL,
	"storage_provider" "storage_provider" DEFAULT 'telegram' NOT NULL,
	"telegram_file_id" varchar(255),
	"telegram_file_unique_id" varchar(255),
	"r2_key" varchar(512),
	"is_public" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(128) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bot_type" "bot_type" NOT NULL,
	"flow_type" "flow_type" DEFAULT 'none' NOT NULL,
	"current_step" varchar(64),
	"collected_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generated_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"content_type" "content_type" NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"ai_model" varchar(64),
	"prompt_version" varchar(32),
	"content_text" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id_a" uuid NOT NULL,
	"teacher_id_b" uuid NOT NULL,
	"similarity_score" numeric(5, 2),
	"status" "duplicate_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "districts" ADD CONSTRAINT "districts_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teachers" ADD CONSTRAINT "teachers_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teachers" ADD CONSTRAINT "teachers_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teachers" ADD CONSTRAINT "teachers_merged_into_teacher_id_teachers_id_fk" FOREIGN KEY ("merged_into_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media" ADD CONSTRAINT "media_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_content" ADD CONSTRAINT "generated_content_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_content" ADD CONSTRAINT "generated_content_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_teacher_id_a_teachers_id_fk" FOREIGN KEY ("teacher_id_a") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_teacher_id_b_teachers_id_fk" FOREIGN KEY ("teacher_id_b") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "districts_region_idx" ON "districts" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_normalized_name_idx" ON "teachers" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_region_district_idx" ON "teachers" USING btree ("region_id","district_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_publish_status_idx" ON "teachers" USING btree ("publish_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_merged_into_idx" ON "teachers" USING btree ("merged_into_teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recommendations_teacher_idx" ON "recommendations" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recommendations_status_idx" ON "recommendations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_recommendation_idx" ON "media" USING btree ("recommendation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");