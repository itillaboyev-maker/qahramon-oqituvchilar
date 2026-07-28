import { pgTable, uuid, varchar, boolean, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
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
      .references(() => recommendations.id, { onDelete: "cascade" }),
    
    mediaType: mediaTypeEnum("media_type").notNull(),
    
    // R2 saqlash ombori uchun yangilangan default qiymat
    storageProvider: storageProviderEnum("storage_provider").default("r2").notNull(),
    
    // Cloudflare R2 fayl ma'lumotlari
    objectKey: varchar("object_key", { length: 512 }), // R2 fayl manzili
    bucketName: varchar("bucket_name", { length: 63 }), // R2 bucket nomi
    mimeType: varchar("mime_type", { length: 128 }),    // masalan: image/jpeg
    sizeBytes: integer("size_bytes"),                  // fayl hajmi (baytlarda)
    checksumSha256: varchar("checksum_sha256", { length: 64 }), // takroriy fayllarni aniqlash uchun
    
    // Telegram integratsiyasi va eski ma'lumotlar uchun (Ixtiyoriy)
    r2Key: varchar("r2_key", { length: 512 }),
    telegramFileId: varchar("telegram_file_id", { length: 255 }),
    telegramFileUniqueId: varchar("telegram_file_unique_id", { length: 255 }),
    
    isPublic: boolean("is_public").default(false).notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    recommendationIdx: index("media_recommendation_idx").on(table.recommendationId),
    checksumIdx: index("media_checksum_idx").on(table.checksumSha256),
  }),
);