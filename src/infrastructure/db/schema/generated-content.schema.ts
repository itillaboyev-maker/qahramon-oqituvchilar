// Future-ready schema, not written to by any MVP use case. Exists now so the AI content
// module can persist output later without a breaking migration.
import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { teachers } from "./teachers.schema";
import { users } from "./users.schema";
import { contentTypeEnum, contentStatusEnum } from "./enums";

export const generatedContent = pgTable("generated_content", {
  id: uuid("id").defaultRandom().primaryKey(),
  teacherId: uuid("teacher_id").notNull().references(() => teachers.id),
  contentType: contentTypeEnum("content_type").notNull(),
  status: contentStatusEnum("status").default("draft").notNull(),
  aiModel: varchar("ai_model", { length: 64 }),
  promptVersion: varchar("prompt_version", { length: 32 }),
  contentText: text("content_text"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
