import { eq, and, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { botSessions } from "../db/schema";
import type {
  SessionStorePort,
  BotSessionState,
} from "../../application/ports/session/session-store.port";

/**
 * MVP choice: session state lives in Postgres, not Cloudflare Durable Objects.
 * One extra round-trip per bot step is a non-issue at current scale, and this class
 * is the only place that would need to change if we later swap to Durable Objects.
 */
export class PostgresSessionStore implements SessionStorePort {
  constructor(private readonly db: Database) {}

  async get(userId: string, botType: "public" | "admin"): Promise<BotSessionState | null> {
    const [row] = await this.db
      .select()
      .from(botSessions)
      .where(and(eq(botSessions.userId, userId), eq(botSessions.botType, botType)))
      .limit(1);

    if (!row) return null;
    // If the session expired, remove it and return null so callers start fresh.
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      await this.db.delete(botSessions).where(eq(botSessions.id, row.id));
      return null;
    }
    return {
      id: row.id,
      userId: row.userId,
      botType: row.botType,
      flowType: row.flowType,
      currentStep: row.currentStep,
      collectedData: row.collectedData as Record<string, unknown>,
    };
  }

  async start(
    userId: string,
    botType: "public" | "admin",
    flowType: BotSessionState["flowType"],
  ): Promise<BotSessionState> {
    // Clear any stale session for this user+bot first (one active flow at a time).
    await this.db
      .delete(botSessions)
      .where(and(eq(botSessions.userId, userId), eq(botSessions.botType, botType)));

    const [row] = await this.db
      .insert(botSessions)
      .values({
        userId,
        botType,
        flowType,
        currentStep: null,
        collectedData: {},
        expiresAt: sql`now() + interval '1 day'`,
      })
      .returning();

    if (!row) throw new Error("Failed to start session");
    return {
      id: row.id,
      userId: row.userId,
      botType: row.botType,
      flowType: row.flowType,
      currentStep: row.currentStep,
      collectedData: row.collectedData as Record<string, unknown>,
    };
  }

  async update(
    id: string,
    patch: Partial<Pick<BotSessionState, "currentStep" | "collectedData">>,
  ): Promise<BotSessionState> {
    const [row] = await this.db
      .update(botSessions)
      .set({ ...patch, updatedAt: sql`now()`, expiresAt: sql`now() + interval '1 day'` })
      .where(eq(botSessions.id, id))
      .returning();

    if (!row) throw new Error(`Session not found: ${id}`);
    return {
      id: row.id,
      userId: row.userId,
      botType: row.botType,
      flowType: row.flowType,
      currentStep: row.currentStep,
      collectedData: row.collectedData as Record<string, unknown>,
    };
  }

  async clear(id: string): Promise<void> {
    await this.db.delete(botSessions).where(eq(botSessions.id, id));
  }
}
