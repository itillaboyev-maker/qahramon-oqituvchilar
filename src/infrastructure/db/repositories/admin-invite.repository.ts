import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { adminInvites } from "../schema";

export interface AdminInvite {
  id: string;
  code: string;
  role: "user" | "moderator" | "editor" | "admin";
  createdBy: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedByUserId: string | null;
}

export class AdminInviteRepository {
  constructor(private readonly db: Database) {}

  async create(input: { code: string; role: AdminInvite["role"]; createdBy: string; expiresAt: Date }): Promise<AdminInvite> {
    const [row] = await this.db.insert(adminInvites).values(input).returning();
    if (!row) throw new Error("Failed to create invite");
    return row as AdminInvite;
  }

  async findByCode(code: string): Promise<AdminInvite | null> {
    const [row] = await this.db.select().from(adminInvites).where(eq(adminInvites.code, code)).limit(1);
    return row ? (row as AdminInvite) : null;
  }

  async markUsed(id: string, usedByUserId: string): Promise<void> {
    await this.db.update(adminInvites).set({ usedAt: new Date(), usedByUserId }).where(eq(adminInvites.id, id));
  }
}