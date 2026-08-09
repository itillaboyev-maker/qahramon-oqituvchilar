import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "moderator", "editor", "admin"]);

export const localeEnum = pgEnum("locale", ["uz-latn", "uz-cyrl", "ru", "en"]);

export const publishStatusEnum = pgEnum("publish_status", [
  "draft",
  "ready_for_publish",
  "published",
  "archived",
]);

export const relationshipEnum = pgEnum("relationship", [
  "student",
  "former_student",
  "parent",
  "colleague",
  "school_leader",
  "community_member",
  "self",
]);

export const submissionTypeEnum = pgEnum("submission_type", ["self", "nominated"]);

// MVP moderation state machine: NEW -> UNDER_REVIEW -> APPROVED / REJECTED
// PUBLISHED is reserved for once the teacher profile itself is promoted by an editor.
export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "new",
  "under_review",
  "approved",
  "rejected",
  "published",
]);

export const mediaTypeEnum = pgEnum("media_type", ["photo", "video", "document"]);

export const storageProviderEnum = pgEnum("storage_provider", ["telegram", "r2"]);

export const botTypeEnum = pgEnum("bot_type", ["public", "admin"]);

export const flowTypeEnum = pgEnum("flow_type", [
  "none",
  "nomination",
  "self_submission",
  "moderation_review",
]);

// Future-ready, not populated by MVP logic:
export const contentTypeEnum = pgEnum("content_type", [
  "telegram_post",
  "instagram_reel_script",
  "article",
  "documentary_script",
]);
export const contentStatusEnum = pgEnum("content_status", ["draft", "approved", "published"]);
export const duplicateStatusEnum = pgEnum("duplicate_status", [
  "pending",
  "confirmed_duplicate",
  "not_duplicate",
]);
