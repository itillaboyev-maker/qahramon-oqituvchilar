# Qahramon O'qituvchilar - Catalog cutoff filter (faqat shu sekunddan keyingi published ustozlar ko'rinadi)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path .\src)) { Write-Host 'XATO: src topilmadi' -ForegroundColor Red; exit 1 }
$changed = @()

# ---- src/shared/constants/catalog.constants.ts ----
$c1875861189343864712 = @'
/**
 * Public "👨‍🏫 Ustozlar" catalog visibility cutoff.
 *
 * Teachers created BEFORE this timestamp (mostly QA/test entries accumulated
 * before the catalog feature went live) are excluded from the public teacher
 * list and public profile view, even if publishStatus === "published".
 *
 * Deliberately does NOT affect:
 *  - the admin bot's publish queue / published-teachers screens (moderators
 *    must still see and manage every teacher, test data included)
 *  - the public region/district counts (business decision: counts can stay
 *    inclusive of pre-cutoff data; only the drill-down list/profile hide it)
 *
 * No schema change: this is a code-level constant, not a DB column.
 */
export const CATALOG_VISIBLE_SINCE = "2026-08-12T05:01:37.000Z";
'@
$p = 'src\shared\constants\catalog.constants.ts'
$dir = Split-Path $p -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $p)
Set-Content -Path $p -Value $c1875861189343864712 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI] $p" } else { $changed += "[YANGILANDI] $p" }

# ---- src/infrastructure/db/repositories/teacher.repository.ts ----
$c2230492746963197247 = @'
import { eq, and, or, ilike, sql, asc, count, gte } from "drizzle-orm";
import type { Database } from "../client";
import { teachers, regions, districts } from "../schema";
import type {
  TeacherRepositoryPort,
  CandidatePrefilterInput,
  TeacherSearchFilters,
  TeacherPublishQueueItem,
  RegionWithPublishedCount,
  DistrictWithPublishedCount,
  PublishedTeachersPage,
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

  async listPublishQueue(
    status: Teacher["publishStatus"],
    limit: number,
    offset: number,
  ): Promise<TeacherPublishQueueItem[]> {
    const rows = await this.db
      .select({
        teacher: teachers,
        regionName: regions.nameUzLatn,
        districtName: districts.nameUzLatn,
      })
      .from(teachers)
      .leftJoin(regions, eq(teachers.regionId, regions.id))
      .leftJoin(districts, eq(teachers.districtId, districts.id))
      .where(eq(teachers.publishStatus, status))
      .orderBy(asc(teachers.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => this.toPublishQueueItem(row));
  }

  async countByPublishStatus(status: Teacher["publishStatus"]): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(teachers)
      .where(eq(teachers.publishStatus, status));
    return row?.value ?? 0;
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
  // PUBLIC catalog (Viloyat → Tuman → Ustoz → Profil). Read-only, no auth.
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
'@
$p = 'src\infrastructure\db\repositories\teacher.repository.ts'
$dir = Split-Path $p -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $p)
Set-Content -Path $p -Value $c2230492746963197247 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI] $p" } else { $changed += "[YANGILANDI] $p" }

# ---- src/application/use-cases/teacher/get-public-teacher-profile.use-case.ts ----
$c8518993110567472656 = @'
import type { TeacherRepositoryPort } from "../../ports/repositories/teacher.repository.port";
import type { RecommendationRepositoryPort } from "../../ports/repositories/recommendation.repository.port";
import type { MediaRepositoryPort } from "../../ports/repositories/media.repository.port";
import type { PublicTeacherProfile } from "../../dto/public-teacher-catalog.dto";
import { CATALOG_VISIBLE_SINCE } from "../../../shared/constants/catalog.constants";

export interface GetPublicTeacherProfileInput {
  teacherId: string;
}

/**
 * Public teacher profile (unauthenticated). Deliberately NOT a reuse of
 * GetTeacherPublishDetailUseCase: that use case is moderator-gated and
 * returns per-recommendation data (relationship, recommendation text) meant
 * for editorial review, not the public. This use case:
 *   1. requires publishStatus === "published" (any other status -> null,
 *      same as "not found" from the caller's point of view)
 *   2. maps to PublicTeacherProfile, an explicit allow-list DTO — no
 *      recommender/teacher phone, no user IDs, no moderation metadata, no
 *      other nominator's data ever leaves this method.
 */
export class GetPublicTeacherProfileUseCase {
  constructor(
    private readonly teacherRepo: TeacherRepositoryPort,
    private readonly recommendationRepo: RecommendationRepositoryPort,
    private readonly mediaRepo: MediaRepositoryPort,
  ) {}

  async execute(input: GetPublicTeacherProfileInput): Promise<PublicTeacherProfile | null> {
    const teacher = await this.teacherRepo.findPublishQueueDetailById(input.teacherId);
    if (!teacher || teacher.publishStatus !== "published") {
      return null;
    }
    if (new Date(teacher.createdAt) < new Date(CATALOG_VISIBLE_SINCE)) {
      return null;
    }

    const recommendations = await this.recommendationRepo.listByTeacherId(teacher.id);
    const recommendationIds = recommendations.map((r) => r.id);
    const media =
      recommendationIds.length > 0
        ? await this.mediaRepo.listByRecommendationIds(recommendationIds)
        : [];

    return {
      id: teacher.id,
      fullName: teacher.fullName,
      regionName: teacher.regionName,
      districtName: teacher.districtName,
      school: teacher.school,
      subject: teacher.subject,
      position: teacher.position,
      yearsOfExperience: teacher.yearsOfExperience,
      biography: teacher.biography,
      achievements: teacher.achievements,
      educationalPhilosophy: teacher.educationalPhilosophy,
      impactStories: teacher.impactStories,
      media: media.map((item) => ({
        id: item.id,
        mediaType: item.mediaType,
        objectKey: item.objectKey ?? null,
        storageProvider: item.storageProvider ?? null,
        telegramFileId: item.telegramFileId,
      })),
    };
  }
}
'@
$p = 'src\application\use-cases\teacher\get-public-teacher-profile.use-case.ts'
$dir = Split-Path $p -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $p)
Set-Content -Path $p -Value $c8518993110567472656 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI] $p" } else { $changed += "[YANGILANDI] $p" }

Write-Host ''
Write-Host '===== Ozgargan fayllar =====' -ForegroundColor Cyan
$changed | ForEach-Object { Write-Host $_ }
