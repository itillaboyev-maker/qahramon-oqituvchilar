ALTER TYPE "public"."flow_type" ADD VALUE IF NOT EXISTS 'admin_input';--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "channel_posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN IF NOT EXISTS "experience_years_text" varchar(100);
