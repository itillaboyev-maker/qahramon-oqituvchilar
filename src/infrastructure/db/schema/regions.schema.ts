import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const regions = pgTable("regions", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  nameUzLatn: varchar("name_uz_latn", { length: 100 }).notNull(),
  nameUzCyrl: varchar("name_uz_cyrl", { length: 100 }),
  nameRu: varchar("name_ru", { length: 100 }),
  nameEn: varchar("name_en", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
