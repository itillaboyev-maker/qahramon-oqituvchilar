// Future-ready schema for AI-assisted duplicate detection. MVP dedup uses a simple
// normalizedName + district + school match in find-or-create-teacher.use-case.ts;
// this table is where a future fuzzy/AI matcher would log lower-confidence suggestions
// for a moderator to confirm or dismiss.
import { pgTable, uuid, numeric, timestamp } from "drizzle-orm/pg-core";
import { teachers } from "./teachers.schema";
import { users } from "./users.schema";
import { duplicateStatusEnum } from "./enums";

export const duplicateCandidates = pgTable("duplicate_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  teacherIdA: uuid("teacher_id_a").notNull().references(() => teachers.id),
  teacherIdB: uuid("teacher_id_b").notNull().references(() => teachers.id),
  similarityScore: numeric("similarity_score", { precision: 5, scale: 2 }),
  status: duplicateStatusEnum("status").default("pending").notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
