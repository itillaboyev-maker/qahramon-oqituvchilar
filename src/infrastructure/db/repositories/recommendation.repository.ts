import { eq, asc, and, ne, count, sql } from "drizzle-orm";
import type { Database } from "../client";
import { recommendations } from "../schema";
import type {
  RecommendationRepositoryPort,
  CreateRecommendationInput,
} from "../../../application/ports/repositories/recommendation.repository.port";
import type { Recommendation } from "../../../domain/entities/recommendation.entity";

export class RecommendationRepository implements RecommendationRepositoryPort {
  constructor(private readonly db: Database) {}

  async create(input: CreateRecommendationInput): Promise<Recommendation> {
    const [row] = await this.db
      .insert(recommendations)
      .values({
        teacherId: input.teacherId,
        submittedByUserId: input.submittedByUserId ?? null,
        recommenderName: input.recommenderName ?? null,
        recommenderPhone: input.teacherPhone ?? input.recommenderPhone ?? null,
        relationship: input.relationship ?? null,
        submissionType: input.submissionType,
        recommendationText: input.recommendationText ?? null,
        achievementsText: input.achievementsText ?? null,
        teachingMethodsText: input.teachingMethodsText ?? null,
        studentImpactText: input.studentImpactText ?? null,
        evidenceText: input.evidenceText ?? null,
        additionalInfo: input.additionalInfo ?? null,
        consentGiven: input.consentGiven,
        consentGivenAt: input.consentGiven ? sql`now()` : null,
      })
      .returning();

    if (!row) throw new Error("Failed to create recommendation");
    return { ...row, teacherPhone: input.teacherPhone ?? null } as Recommendation;
  }

  async findById(id: string): Promise<Recommendation | null> {
    const [row] = await this.db
      .select()
      .from(recommendations)
      .where(eq(recommendations.id, id))
      .limit(1);
    return row ? (row as Recommendation) : null;
  }

  async listByStatus(status: Recommendation["status"], limit = 10): Promise<Recommendation[]> {
    const rows = await this.db
      .select()
      .from(recommendations)
      .where(eq(recommendations.status, status))
      .orderBy(asc(recommendations.createdAt))
      .limit(limit);
    return rows as Recommendation[];
  }

  async countByStatus(status: Recommendation["status"]): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(recommendations)
      .where(eq(recommendations.status, status));
    return row?.value ?? 0;
  }

 async updateStatus(
  id: string,
  status: Recommendation["status"],
  moderatedBy: string,
  moderationNotes?: string | null,
): Promise<Recommendation> {

  console.log("========== UPDATE STATUS ==========");
  console.log("Recommendation ID:", id);
  console.log("New status:", status);

  const [row] = await this.db
    .update(recommendations)
    .set({
      status,
      moderatedBy,
      moderatedAt: sql`now()`,
      moderationNotes: moderationNotes ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(recommendations.id, id))
    .returning();

  console.log("Returned row:", row);
  console.log("==================================");

  if (!row) {
    throw new Error(`Recommendation not found: ${id}`);
  }

  return row as Recommendation;
}
  async listByTeacherId(teacherId: string): Promise<Recommendation[]> {
    const rows = await this.db
      .select()
      .from(recommendations)
      .where(eq(recommendations.teacherId, teacherId))
      .orderBy(asc(recommendations.createdAt));
    return rows as Recommendation[];
  }

  async countIndependentByTeacherId(teacherId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(recommendations)
      .where(and(eq(recommendations.teacherId, teacherId), ne(recommendations.status, "rejected")));
    return row?.value ?? 0;
  }

  async reassignTeacher(fromTeacherId: string, toTeacherId: string): Promise<number> {
    const rows = await this.db
      .update(recommendations)
      .set({ teacherId: toTeacherId, updatedAt: sql`now()` })
      .where(eq(recommendations.teacherId, fromTeacherId))
      .returning({ id: recommendations.id });
    return rows.length;
  }

  async countRecentBySubmitter(submittedByUserId: string, sinceMinutesAgo: number): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(recommendations)
      .where(
        and(
          eq(recommendations.submittedByUserId, submittedByUserId),
          sql`${recommendations.createdAt} > now() - (${sinceMinutesAgo} || ' minutes')::interval`,
        ),
      );
    return row?.value ?? 0;
  }
}
