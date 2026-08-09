import type { Recommendation } from "../../../domain/entities/recommendation.entity";

export interface CreateRecommendationInput {
  teacherId: string;
  submittedByUserId?: string | null;
  recommenderName?: string | null;
  recommenderPhone?: string | null;
  teacherPhone?: string | null;
  relationship?: Recommendation["relationship"];
  submissionType: Recommendation["submissionType"];
  recommendationText?: string | null;
  achievementsText?: string | null;
  teachingMethodsText?: string | null;
  studentImpactText?: string | null;
  evidenceText?: string | null;
  additionalInfo?: string | null;
  consentGiven: boolean;
}

export interface RecommendationRepositoryPort {
  create(input: CreateRecommendationInput): Promise<Recommendation>;
  findById(id: string): Promise<Recommendation | null>;
  /** Moderator queue: oldest NEW items first. */
  listByStatus(status: Recommendation["status"], limit?: number): Promise<Recommendation[]>;
  countByStatus(status: Recommendation["status"]): Promise<number>;
  updateStatus(
    id: string,
    status: Recommendation["status"],
    moderatedBy: string,
    moderationNotes?: string | null,
  ): Promise<Recommendation>;
  /** All recommendations for one teacher, oldest first — backs aggregation + timeline (business rules E, G). */
  listByTeacherId(teacherId: string): Promise<Recommendation[]>;
  /**
   * Community signal (business rule B): count of INDEPENDENT recommendations for a
   * teacher. "Independent" excludes rejected submissions (moderator determined they
   * weren't credible) — this is an internal moderator signal only, never shown publicly
   * or used as a ranking/voting mechanism (see DECISIONS.md D002).
   */
  countIndependentByTeacherId(teacherId: string): Promise<number>;
  /**
 * Batch version of countIndependentByTeacherId for list screens (e.g. the publish
 * queue) that render N teachers per page — one grouped query instead of N queries.
 * Returns 0 for any teacherId with no independent recommendations.
 */
countIndependentByTeacherIds(
  teacherIds: string[],
): Promise<Record<string, number>>;
  /** Bulk-reassigns every recommendation from one teacher to another (merge workflow, business rule F). Returns rows affected. */
  reassignTeacher(fromTeacherId: string, toTeacherId: string): Promise<number>;
  /** Stage 10 rate limiting: how many recommendations this user submitted in the last N minutes. */
  countRecentBySubmitter(submittedByUserId: string, sinceMinutesAgo: number): Promise<number>;
}
