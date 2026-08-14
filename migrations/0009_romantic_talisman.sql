CREATE TYPE "public"."moderation_track" AS ENUM('general', 'top');--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "moderation_track" "moderation_track" DEFAULT 'general' NOT NULL;