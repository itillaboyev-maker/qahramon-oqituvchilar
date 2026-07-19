import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { users } from "../schema";
import type {
  UserRepositoryPort,
  UpsertUserInput,
} from "../../../application/ports/repositories/user.repository.port";
import type { User } from "../../../domain/entities/user.entity";

export class UserRepository implements UserRepositoryPort {
  constructor(private readonly db: Database) {}

  async findByTelegramId(telegramId: number): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
    return row ? (row as User) : null;
  }

  async upsertByTelegramId(input: UpsertUserInput): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        telegramId: input.telegramId,
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
      })
      .onConflictDoUpdate({
        target: users.telegramId,
        set: {
          username: input.username ?? null,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
        },
      })
      .returning();

    if (!row) throw new Error("Failed to upsert user");
    return row as User;
  }

  async isModeratorOrAbove(userId: string): Promise<boolean> {
    const [row] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!row) return false;
    return row.role === "moderator" || row.role === "editor" || row.role === "admin";
  }
}
