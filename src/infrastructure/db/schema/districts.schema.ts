import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { regions } from "./regions.schema";

export const districts = pgTable(
  "districts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    regionId: uuid("region_id").notNull().references(() => regions.id),
    code: varchar("code", { length: 10 }),
    nameUzLatn: varchar("name_uz_latn", { length: 100 }).notNull(),
    nameUzCyrl: varchar("name_uz_cyrl", { length: 100 }),
    nameRu: varchar("name_ru", { length: 100 }),
    nameEn: varchar("name_en", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    regionIdx: index("districts_region_idx").on(table.regionId),
  }),
);
