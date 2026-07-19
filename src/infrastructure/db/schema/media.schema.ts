import { pgTable, uuid, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { recommendations } from "./recommendations.schema";
import { users } from "./users.schema";
import { mediaTypeEnum, storageProviderEnum } from "./enums";

// Business rule H: media attaches ONLY to a recommendation, never directly to a
// teacher. A teacher's full media set is always derived by joining through their
// recommendations — this is what makes "hech qanday media o'chirilmaydi, faqat
// qo'shiladi" true by construction: there is no teacher-level media row to overwrite.
export const media = pgTable(
  "media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => recommendations.id),
    mediaType: mediaTypeEnum("media_type").notNull(),
    storageProvider: storageProviderEnum("storage_provider").default("telegram").notNull(),
    telegramFileId: varchar("telegram_file_id", { length: 255 }),
    telegramFileUniqueId: varchar("telegram_file_unique_id", { length: 255 }),
    r2Key: varchar("r2_key", { length: 512 }), // populated only after a future R2 migration
    isPublic: boolean("is_public").default(false).notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    recommendationIdx: index("media_recommendation_idx").on(table.recommendationId),
  }),
);
