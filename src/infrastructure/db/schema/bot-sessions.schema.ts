import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.schema";
import { botTypeEnum, flowTypeEnum } from "./enums";

// Holds multi-step conversation state. MVP choice: Postgres row, not Durable Objects —
// swapping later only requires a new implementation of session-store.port.ts.
export const botSessions = pgTable("bot_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  botType: botTypeEnum("bot_type").notNull(),
  flowType: flowTypeEnum("flow_type").default("none").notNull(),
  currentStep: varchar("current_step", { length: 64 }),
  collectedData: jsonb("collected_data").default({}).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
