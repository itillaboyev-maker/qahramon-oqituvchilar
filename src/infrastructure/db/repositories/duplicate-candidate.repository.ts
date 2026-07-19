import { and, or, eq, asc, sql } from "drizzle-orm";
import type { Database } from "../client";
import { duplicateCandidates } from "../schema";
import type {
  DuplicateCandidateRepositoryPort,
  DuplicateCandidate,
} from "../../../application/ports/repositories/duplicate-candidate.repository.port";

export class DuplicateCandidateRepository implements DuplicateCandidateRepositoryPort {
  constructor(private readonly db: Database) {}

  async logIfNew(teacherIdA: string, teacherIdB: string, similarityScore: number): Promise<void> {
    const existing = await this.db
      .select({ id: duplicateCandidates.id })
      .from(duplicateCandidates)
      .where(
        and(
          eq(duplicateCandidates.status, "pending"),
          or(
            and(eq(duplicateCandidates.teacherIdA, teacherIdA), eq(duplicateCandidates.teacherIdB, teacherIdB)),
            and(eq(duplicateCandidates.teacherIdA, teacherIdB), eq(duplicateCandidates.teacherIdB, teacherIdA)),
          ),
        ),
      )
      .limit(1);

    if (existing.length > 0) return;

    await this.db.insert(duplicateCandidates).values({
      teacherIdA,
      teacherIdB,
      similarityScore: similarityScore.toFixed(2),
    });
  }

  async listPending(limit = 10): Promise<DuplicateCandidate[]> {
    const rows = await this.db
      .select()
      .from(duplicateCandidates)
      .where(eq(duplicateCandidates.status, "pending"))
      .orderBy(asc(duplicateCandidates.createdAt))
      .limit(limit);
    return rows as unknown as DuplicateCandidate[];
  }

  async findById(id: string): Promise<DuplicateCandidate | null> {
    const [row] = await this.db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, id)).limit(1);
    return row ? (row as unknown as DuplicateCandidate) : null;
  }

  async updateStatus(
    id: string,
    status: "confirmed_duplicate" | "not_duplicate",
    reviewedBy: string,
  ): Promise<DuplicateCandidate> {
    const [row] = await this.db
      .update(duplicateCandidates)
      .set({ status, reviewedBy, reviewedAt: sql`now()` })
      .where(eq(duplicateCandidates.id, id))
      .returning();
    if (!row) throw new Error(`Duplicate candidate not found: ${id}`);
    return row as unknown as DuplicateCandidate;
  }
}
