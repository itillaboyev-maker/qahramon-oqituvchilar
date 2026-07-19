import { pgTable, uuid, varchar, integer, text, timestamp, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { regions } from "./regions.schema";
import { districts } from "./districts.schema";
import { publishStatusEnum } from "./enums";

// NOTE: recommendation-first flow — this table is never written to directly by the bot.
// find-or-create-teacher.use-case.ts either attaches to an existing row (matched via
// Teacher Identity Resolution — see teacher-identity-resolver.service.ts) or inserts a
// new draft row automatically.
export const teachers = pgTable(
  "teachers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    // lowercased + transliterated, used for fuzzy dedup matching (pg_trgm)
    normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
    regionId: uuid("region_id").references(() => regions.id),
    districtId: uuid("district_id").references(() => districts.id),
    school: varchar("school", { length: 255 }),
    subject: varchar("subject", { length: 128 }),
    position: varchar("position", { length: 128 }),
    yearsOfExperience: integer("years_of_experience"),
    // MVP: these start empty and are enriched over time as more recommendations arrive
    // or a moderator/editor fills them in — never required at first submission.
    biography: text("biography"),
    achievements: text("achievements"),
    educationalPhilosophy: text("educational_philosophy"),
    impactStories: text("impact_stories"),
    publishStatus: publishStatusEnum("publish_status").default("draft").notNull(),
    // Merge workflow (business rule F): when a moderator confirms two profiles are the
    // same person, the LOSING profile is never deleted — it's kept, marked 'archived',
    // and pointed here at the winner. All of its recommendations/media are reassigned
    // to the winner (see MergeTeachersUseCase). This guarantees zero data loss.
    mergedIntoTeacherId: uuid("merged_into_teacher_id").references((): AnyPgColumn => teachers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    normalizedNameIdx: index("teachers_normalized_name_idx").on(table.normalizedName),
    regionDistrictIdx: index("teachers_region_district_idx").on(table.regionId, table.districtId),
    publishStatusIdx: index("teachers_publish_status_idx").on(table.publishStatus),
    mergedIntoIdx: index("teachers_merged_into_idx").on(table.mergedIntoTeacherId),
  }),
);
