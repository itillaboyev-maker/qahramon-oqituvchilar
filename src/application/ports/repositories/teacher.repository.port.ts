import type { Teacher, NewTeacherInput } from "../../../domain/entities/teacher.entity";

export interface CandidatePrefilterInput {
  normalizedName: string;
}

export interface TeacherSearchFilters {
  nameOrSchoolQuery?: string;
  regionId?: string;
  subject?: string;
}

/**
 * Read model for the moderator-facing publish queue/detail screens. Extends
 * Teacher with denormalized region/district display names (joined at the
 * repository level) since the bot renders human-readable names, not IDs.
 */
export interface TeacherPublishQueueItem extends Teacher {
  regionName: string | null;
  districtName: string | null;
}

/** Public catalog read models (business rule: published-only, no internal fields). */
export interface RegionWithPublishedCount {
  id: string;
  nameUzLatn: string;
  publishedCount: number;
}

export interface DistrictWithPublishedCount {
  id: string;
  nameUzLatn: string;
  publishedCount: number;
}

export interface PublishedTeacherListItem {
  id: string;
  fullName: string;
  school: string | null;
  subject: string | null;
}

export interface PublishedTeachersPage {
  items: PublishedTeacherListItem[];
  total: number;
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
  /** TOP moderation track � separate editorial queue, exclusive with "general". */
  updateModerationTrack(id: string, track: Teacher["moderationTrack"]): Promise<Teacher>;
  listPublishQueueByTrack(status: Teacher["publishStatus"], track: Teacher["moderationTrack"], limit: number, offset: number): Promise<TeacherPublishQueueItem[]>;
  countByPublishStatusAndTrack(status: Teacher["publishStatus"], track: Teacher["moderationTrack"]): Promise<number>;
  /** Moderator-edited public story text, applied before publish. */
  updateBiography(id: string, biography: string): Promise<Teacher>;
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
  /**
   * Publish queue listing: teachers at a given publishStatus, ordered by
   * createdAt ASC, paginated via limit/offset. Deliberately separate from
   * search() — search() is unordered/filter-driven and moderator-facing;
   * this is a stable, ordered queue with denormalized region/district names.
   */
  listPublishQueue(
    status: Teacher["publishStatus"],
    limit: number,
    offset: number,
  ): Promise<TeacherPublishQueueItem[]>;
  /** Total teachers at a given publishStatus — powers total/totalPages for the publish queue. */
  countByPublishStatus(status: Teacher["publishStatus"]): Promise<number>;
  /** Single-teacher detail lookup for the publish queue's "Open" screen, with region/district names joined in. */
  findPublishQueueDetailById(id: string): Promise<TeacherPublishQueueItem | null>;

  /**
   * PUBLIC catalog (Viloyat → Tuman → Ustoz → Profil). Only regions/districts that
   * have at least one publishStatus="published" teacher are returned (inner join),
   * so the public bot never shows an empty branch of the tree. Read-only, no auth.
   */
  listPublishedRegionsWithCounts(): Promise<RegionWithPublishedCount[]>;
  /** Districts within a region that have at least one published teacher, with counts. */
  listPublishedDistrictsByRegion(regionId: string): Promise<DistrictWithPublishedCount[]>;
  /** Paginated published-teacher list for a district (public bot list screen). */
  listPublishedTeachersByDistrict(
    districtId: string,
    limit: number,
    offset: number,
  ): Promise<PublishedTeachersPage>;
}