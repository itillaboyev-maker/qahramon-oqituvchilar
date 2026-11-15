import { eq, and, or, ilike, sql, asc, count, gte, lte, inArray, between } from "drizzle-orm";
import type { Database } from "../client";
import { teachers, regions, districts, recommendations } from "../schema";
import type {
  TeacherRepositoryPort,
  CandidatePrefilterInput,
  TeacherSearchFilters,
  TeacherPublishQueueItem,
  RegionWithPublishedCount,
  DistrictWithPublishedCount,
  PublishedTeachersPage,
  PublishedTeacherFilters,
} from "../../../application/ports/repositories/teacher.repository.port";
import type { Teacher, NewTeacherInput } from "../../../domain/entities/teacher.entity";
import { IDENTITY_RESOLUTION } from "../../../shared/constants/identity-resolution.constants";
import { CATALOG_VISIBLE_SINCE } from "../../../shared/constants/catalog.constants";

const PUBLISHED: Teacher["publishStatus"] = "published";

export class TeacherRepository implements TeacherRepositoryPort {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<Teacher | null> {
    const [row] = await this.db.select().from(teachers).where(eq(teachers.id, id)).limit(1);
    return row ? (row as Teacher) : null;
  }

  async findCandidatesByNameSimilarity(input: CandidatePrefilterInput): Promise<Teacher[]> {
    const { CANDIDATE_PREFILTER_LIMIT, CANDIDATE_PREFILTER_MIN_TRIGRAM_SIMILARITY } = IDENTITY_RESOLUTION;

    const rows = await this.db
      .select()
      .from(teachers)
      .where(
        sql`similarity(${teachers.normalizedName}, ${input.normalizedName}) > ${CANDIDATE_PREFILTER_MIN_TRIGRAM_SIMILARITY}`,
      )
      .orderBy(sql`similarity(${teachers.normalizedName}, ${input.normalizedName}) desc`)
      .limit(CANDIDATE_PREFILTER_LIMIT);

    return rows as Teacher[];
  }

  async create(input: NewTeacherInput): Promise<Teacher> {
    const [row] = await this.db
      .insert(teachers)
      .values({
        fullName: input.fullName,
        normalizedName: input.normalizedName,
        regionId: input.regionId ?? null,
        districtId: input.districtId ?? null,
        school: input.school ?? null,
        subject: input.subject ?? null,
        position: input.position ?? null,
      })
      .returning();

    if (!row) throw new Error("Failed to create teacher");
    return row as Teacher;
  }

  async updatePublishStatus(id: string, status: Teacher["publishStatus"]): Promise<Teacher> {
    const [row] = await this.db
      .update(teachers)
      .set({ publishStatus: status, updatedAt: sql`now()` })
      .where(eq(teachers.id, id))
      .returning();

    if (!row) throw new Error(`Teacher not found: ${id}`);
    return row as Teacher;
  }

  async updateBiography(id: string, biography: string): Promise<Teacher> {
    const [row] = await this.db
      .update(teachers)
      .set({ biography, updatedAt: sql`now()` })
      .where(eq(teachers.id, id))
      .returning();

    if (!row) throw new Error(`Teacher not found: ${id}`);
    return row as Teacher;
  }

  async updateModerationTrack(id: string, track: Teacher["moderationTrack"]): Promise<Teacher> {
    const [row] = await this.db
      .update(teachers)
      .set({ moderationTrack: track, updatedAt: sql`now()` })
      .where(eq(teachers.id, id))
      .returning();
    if (!row) throw new Error(`Teacher not found: ${id}`);
    return row as Teacher;
  }

  async listPublishQueueByTrack(
    status: Teacher["publishStatus"],
    track: Teacher["moderationTrack"],
    limit: number,
    offset: number,
  ): Promise<TeacherPublishQueueItem[]> {
    const rows = await this.db
      .select({ teacher: teachers, regionName: regions.nameUzLatn, districtName: districts.nameUzLatn })
      .from(teachers)
      .leftJoin(regions, eq(teachers.regionId, regions.id))
      .leftJoin(districts, eq(teachers.districtId, districts.id))
      .where(and(eq(teachers.publishStatus, status), eq(teachers.moderationTrack, track)))
      .orderBy(asc(teachers.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map((row) => this.toPublishQueueItem(row));
  }

  async countByPublishStatusAndTrack(status: Teacher["publishStatus"], track: Teacher["moderationTrack"]): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(teachers)
      .where(and(eq(teachers.publishStatus, status), eq(teachers.moderationTrack, track)));
    return row?.value ?? 0;
  }
  async markMerged(loserId: string, winnerId: string): Promise<Teacher> {
    const [row] = await this.db
      .update(teachers)
      .set({ mergedIntoTeacherId: winnerId, publishStatus: "archived", updatedAt: sql`now()` })
      .where(eq(teachers.id, loserId))
      .returning();

    if (!row) throw new Error(`Teacher not found: ${loserId}`);
    return row as Teacher;
  }

  async search(filters: TeacherSearchFilters, limit = 10): Promise<Teacher[]> {
    const conditions = [];

    if (filters.nameOrSchoolQuery) {
      const pattern = `%${filters.nameOrSchoolQuery}%`;
      conditions.push(or(ilike(teachers.fullName, pattern), ilike(teachers.school, pattern)));
    }
    if (filters.regionId) conditions.push(eq(teachers.regionId, filters.regionId));
    if (filters.subject) conditions.push(ilike(teachers.subject, `%${filters.subject}%`));

    const rows = await this.db
      .select()
      .from(teachers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit);

    return rows as Teacher[];
  }

  private toPublishQueueItem(row: {
    teacher: unknown;
    regionName: string | null;
    districtName: string | null;
  }): TeacherPublishQueueItem {
    return {
      ...(row.teacher as Teacher),
      regionName: row.regionName ?? null,
      districtName: row.districtName ?? null,
    };
  }

    private async teacherIdsByApplicationDateRange(from: Date, to: Date): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ teacherId: recommendations.teacherId })
      .from(recommendations)
      .where(between(recommendations.createdAt, from, to));
    return rows.map((r) => r.teacherId);
  }

  private async buildPublishedFilterConditions(
    status: Teacher["publishStatus"],
    filters?: PublishedTeacherFilters,
  ) {
    const conditions = [eq(teachers.publishStatus, status)];

    if (filters?.districtNameQuery) {
      conditions.push(ilike(districts.nameUzLatn, `%${filters.districtNameQuery}%`));
    }
    if (filters?.subject) {
      conditions.push(eq(teachers.subject, filters.subject));
    }
    if (filters?.minExperience !== undefined) {
      conditions.push(gte(teachers.yearsOfExperience, filters.minExperience));
    }
    if (filters?.maxExperience !== undefined) {
      conditions.push(lte(teachers.yearsOfExperience, filters.maxExperience));
    }
    if (filters?.applicationDateFrom && filters?.applicationDateTo) {
      const ids = await this.teacherIdsByApplicationDateRange(
        filters.applicationDateFrom,
        filters.applicationDateTo,
      );
      conditions.push(inArray(teachers.id, ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]));
    }

    return and(...conditions);
  }

  async listPublishQueue(
    status: Teacher["publishStatus"],
    limit: number,
    offset: number,
    filters?: PublishedTeacherFilters,
  ): Promise<TeacherPublishQueueItem[]> {
    const where = await this.buildPublishedFilterConditions(status, filters);

    const rows = await this.db
      .select({
        teacher: teachers,
        regionName: regions.nameUzLatn,
        districtName: districts.nameUzLatn,
      })
      .from(teachers)
      .leftJoin(regions, eq(teachers.regionId, regions.id))
      .leftJoin(districts, eq(teachers.districtId, districts.id))
      .where(where)
      .orderBy(asc(teachers.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => this.toPublishQueueItem(row));
  }

  async countByPublishStatus(
    status: Teacher["publishStatus"],
    filters?: PublishedTeacherFilters,
  ): Promise<number> {
    const where = await this.buildPublishedFilterConditions(status, filters);

    const [row] = await this.db
      .select({ value: count() })
      .from(teachers)
      .leftJoin(districts, eq(teachers.districtId, districts.id))
      .where(where);
    return row?.value ?? 0;
  }

  async listDistinctPublishedSubjects(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ subject: teachers.subject })
      .from(teachers)
      .where(and(eq(teachers.publishStatus, "published"), sql`${teachers.subject} is not null`))
      .orderBy(asc(teachers.subject));
    return rows.map((r) => r.subject).filter((s): s is string => Boolean(s));
  }

    private pendingChannelPostWhere(sinceIso: string) {
    return and(
      eq(teachers.publishStatus, "published"),
      sql`${teachers.channelPostedAt} is null`,
      sql`${teachers.id} in (select entity_id from audit_logs where action = 'teacher.published' and created_at >= ${sinceIso}::timestamptz)`,
    );
  }

  async countPendingChannelPosts(sinceIso: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(teachers)
      .where(this.pendingChannelPostWhere(sinceIso));
    return row?.value ?? 0;
  }

  async listPendingChannelPostIds(sinceIso: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(this.pendingChannelPostWhere(sinceIso))
      .orderBy(asc(teachers.createdAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  private firstRowOf(result: unknown): Record<string, unknown> {
    const arr = Array.isArray(result) ? result : ((result as { rows?: unknown[] } | null)?.rows ?? []);
    return (arr[0] ?? {}) as Record<string, unknown>;
  }

  async countForCleanup(sinceIso: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(teachers)
      .where(sql`${teachers.createdAt} >= ${sinceIso}::timestamptz`);
    return row?.value ?? 0;
  }

  async listForCleanup(sinceIso: string, limit: number, offset: number) {
    return this.db
      .select({
        id: teachers.id,
        fullName: teachers.fullName,
        publishStatus: teachers.publishStatus,
        createdAt: teachers.createdAt,
        subject: teachers.subject,
        channelPostedAt: teachers.channelPostedAt,
      })
      .from(teachers)
      .where(sql`${teachers.createdAt} >= ${sinceIso}::timestamptz`)
      .orderBy(sql`${teachers.createdAt} desc`)
      .limit(limit)
      .offset(offset);
  }

  async findCleanupItem(id: string) {
    const [row] = await this.db
      .select({
        id: teachers.id,
        fullName: teachers.fullName,
        publishStatus: teachers.publishStatus,
        createdAt: teachers.createdAt,
        subject: teachers.subject,
        channelPostedAt: teachers.channelPostedAt,
      })
      .from(teachers)
      .where(eq(teachers.id, id))
      .limit(1);
    return row ?? null;
  }

  async countTeacherDependents(id: string): Promise<{ recommendations: number; media: number }> {
    const result = await this.db.execute(sql`
      select
        (select count(*) from recommendations where teacher_id = ${id}::uuid) as recommendations,
        (select count(*) from media where recommendation_id in (select id from recommendations where teacher_id = ${id}::uuid)) as media
    `);
    const row = this.firstRowOf(result);
    return { recommendations: Number(row.recommendations ?? 0), media: Number(row.media ?? 0) };
  }

  async deleteTeacherCascade(
    id: string,
  ): Promise<{ teachers: number; recommendations: number; media: number; duplicates: number }> {
    const result = await this.db.execute(sql`
      with r as (select id from recommendations where teacher_id = ${id}::uuid),
      m as (delete from media where recommendation_id in (select id from r) returning 1),
      rc as (delete from recommendations where id in (select id from r) returning 1),
      g as (delete from generated_content where teacher_id = ${id}::uuid returning 1),
      d as (delete from duplicate_candidates where teacher_id_a = ${id}::uuid or teacher_id_b = ${id}::uuid returning 1),
      x as (delete from teachers where id = ${id}::uuid returning 1)
      select
        (select count(*) from x) as teachers,
        (select count(*) from rc) as recommendations,
        (select count(*) from m) as media,
        (select count(*) from d) as duplicates
    `);
    const row = this.firstRowOf(result);
    return {
      teachers: Number(row.teachers ?? 0),
      recommendations: Number(row.recommendations ?? 0),
      media: Number(row.media ?? 0),
      duplicates: Number(row.duplicates ?? 0),
    };
  }

  async markChannelPosted(id: string): Promise<void> {
    await this.db.update(teachers).set({ channelPostedAt: new Date() }).where(eq(teachers.id, id));
  }

  async updateYearsOfExperience(id: string, years: number): Promise<Teacher> {
    const [row] = await this.db
      .update(teachers)
      .set({ yearsOfExperience: years })
      .where(eq(teachers.id, id))
      .returning();
    if (!row) throw new Error("Teacher not found");
    return row as Teacher;
  }

  async updateAchievements(id: string, achievements: string): Promise<Teacher> {
    const [row] = await this.db
      .update(teachers)
      .set({ achievements })
      .where(eq(teachers.id, id))
      .returning();
    if (!row) throw new Error("Teacher not found");
    return row as Teacher;
  }

  async updateEducationalPhilosophy(id: string, educationalPhilosophy: string): Promise<Teacher> {
    const [row] = await this.db
      .update(teachers)
      .set({ educationalPhilosophy })
      .where(eq(teachers.id, id))
      .returning();
    if (!row) throw new Error("Teacher not found");
    return row as Teacher;
  }

  async updateImpactStories(id: string, impactStories: string): Promise<Teacher> {
    const [row] = await this.db
      .update(teachers)
      .set({ impactStories })
      .where(eq(teachers.id, id))
      .returning();
    if (!row) throw new Error("Teacher not found");
    return row as Teacher;
  }

  async findPublishQueueDetailById(id: string): Promise<TeacherPublishQueueItem | null> {
    const [row] = await this.db
      .select({
        teacher: teachers,
        regionName: regions.nameUzLatn,
        districtName: districts.nameUzLatn,
      })
      .from(teachers)
      .leftJoin(regions, eq(teachers.regionId, regions.id))
      .leftJoin(districts, eq(teachers.districtId, districts.id))
      .where(eq(teachers.id, id))
      .limit(1);

    if (!row) return null;
    return this.toPublishQueueItem(row);
  }

  // ---------------------------------------------------------------------
  // PUBLIC catalog (Viloyat > Tuman > Ustoz > Profil). Read-only, no auth.
  // Inner-joins to teachers so only branches with published teachers appear.
  // ---------------------------------------------------------------------

  async listPublishedRegionsWithCounts(): Promise<RegionWithPublishedCount[]> {
    const rows = await this.db
      .select({
        id: regions.id,
        nameUzLatn: regions.nameUzLatn,
        publishedCount: count(teachers.id),
      })
      .from(regions)
      .innerJoin(teachers, and(eq(teachers.regionId, regions.id), eq(teachers.publishStatus, PUBLISHED)))
      .groupBy(regions.id, regions.nameUzLatn)
      .orderBy(asc(regions.nameUzLatn));

    return rows.map((row) => ({
      id: row.id,
      nameUzLatn: row.nameUzLatn,
      publishedCount: Number(row.publishedCount),
    }));
  }

  async listPublishedDistrictsByRegion(regionId: string): Promise<DistrictWithPublishedCount[]> {
    const rows = await this.db
      .select({
        id: districts.id,
        nameUzLatn: districts.nameUzLatn,
        publishedCount: count(teachers.id),
      })
      .from(districts)
      .innerJoin(
        teachers,
        and(eq(teachers.districtId, districts.id), eq(teachers.publishStatus, PUBLISHED)),
      )
      .where(eq(districts.regionId, regionId))
      .groupBy(districts.id, districts.nameUzLatn)
      .orderBy(asc(districts.nameUzLatn));

    return rows.map((row) => ({
      id: row.id,
      nameUzLatn: row.nameUzLatn,
      publishedCount: Number(row.publishedCount),
    }));
  }

  async listPublishedTeachersByDistrict(
    districtId: string,
    limit: number,
    offset: number,
  ): Promise<PublishedTeachersPage> {
    const whereClause = and(
      eq(teachers.districtId, districtId),
      eq(teachers.publishStatus, PUBLISHED),
      gte(teachers.createdAt, sql`${CATALOG_VISIBLE_SINCE}::timestamptz`),
    );

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({
          id: teachers.id,
          fullName: teachers.fullName,
          school: teachers.school,
          subject: teachers.subject,
        })
        .from(teachers)
        .where(whereClause)
        .orderBy(asc(teachers.fullName))
        .limit(limit)
        .offset(offset),
      this.db.select({ value: count() }).from(teachers).where(whereClause),
    ]);

    return { items: rows, total: totalRow?.value ?? 0 };
  }
}
