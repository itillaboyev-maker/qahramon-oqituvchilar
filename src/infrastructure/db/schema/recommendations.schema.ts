import { pgTable, uuid, varchar, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { teachers } from "./teachers.schema";
import { users } from "./users.schema";
import { relationshipEnum, submissionTypeEnum, recommendationStatusEnum } from "./enums";

// MVP simplification: consent is tracked as two columns here instead of a separate
// `consents` table. Same guarantee (no publishing without explicit consent), one less
// join. Promote to a full table later if per-field consent granularity is needed.
export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teacherId: uuid("teacher_id").notNull().references(() => teachers.id),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id),

    // Essential fields — collected in the fast (<2 min) submission flow
    recommenderName: varchar("recommender_name", { length: 255 }),
    recommenderPhone: varchar("recommender_phone", { length: 20 }), // optional, never required
    relationship: relationshipEnum("relationship"),
    submissionType: submissionTypeEnum("submission_type").notNull(),
    recommendationText: text("recommendation_text"), // "why do you recommend this teacher"

    // Extended fields — optional, collected only if the user chooses to add more
    achievementsText: text("achievements_text"),
    teachingMethodsText: text("teaching_methods_text"),
    studentImpactText: text("student_impact_text"),
    evidenceText: text("evidence_text"),
    additionalInfo: text("additional_info"),

    status: recommendationStatusEnum("status").default("new").notNull(),
    moderationNotes: text("moderation_notes"),
    moderatedBy: uuid("moderated_by").references(() => users.id),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),

    consentGiven: boolean("consent_given").default(false).notNull(),
    consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    teacherIdx: index("recommendations_teacher_idx").on(table.teacherId),
    statusIdx: index("recommendations_status_idx").on(table.status),
  }),
);
