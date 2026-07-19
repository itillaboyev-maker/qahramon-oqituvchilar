import type { Teacher, NewTeacherInput } from "../../../domain/entities/teacher.entity";

export interface CandidatePrefilterInput {
  normalizedName: string;
}

export interface TeacherSearchFilters {
  nameOrSchoolQuery?: string;
  regionId?: string;
  subject?: string;
}

export interface TeacherRepositoryPort {
  findById(id: string): Promise<Teacher | null>;
  /**
   * Identity Resolution prefilter (business rule D): returns candidate teachers whose
   * normalized_name is at least loosely similar (pg_trgm `%` operator, backed by
   * teachers_normalized_name_trgm_idx), ordered by trigram similarity, capped at a
   * small limit. This is a cheap DB-side filter only — the actual confidence scoring
   * (name + district + school + subject + experience) happens in
   * TeacherIdentityResolver, in application code, not in SQL.
   */
  findCandidatesByNameSimilarity(input: CandidatePrefilterInput): Promise<Teacher[]>;
  create(input: NewTeacherInput): Promise<Teacher>;
  updatePublishStatus(id: string, status: Teacher["publishStatus"]): Promise<Teacher>;
  /**
   * Merge workflow (business rule F): marks the LOSING profile as archived and points
   * it at the winner. Never deletes the row — every field on the loser stays queryable
   * forever, satisfying "hech qanday ma'lumot o'chirilmasin."
   */
  markMerged(loserId: string, winnerId: string): Promise<Teacher>;
  /**
   * Stage 8 — moderator-facing search/filter, deliberately NOT public. A future public
   * search (web portal) would need its own query shaped around only-published teachers
   * and different pagination; this one is for the admin bot's internal use.
   */
  search(filters: TeacherSearchFilters, limit?: number): Promise<Teacher[]>;
}
