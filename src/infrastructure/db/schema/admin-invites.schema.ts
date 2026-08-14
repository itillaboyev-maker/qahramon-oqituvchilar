import { pgTable, uuid, varchar, timestamp, uuid as uuidCol } from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums";
import { users } from "./users.schema";

export const adminInvites = pgTable("admin_invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 16 }).notNull().unique(),
  role: userRoleEnum("role").notNull(),
  createdBy: uuidCol("created_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: uuidCol("used_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});