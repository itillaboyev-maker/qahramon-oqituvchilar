# Qahramon O'qituvchilar - Ustozlar Catalog Auto-Deploy
# Repo root papkasida ishga tushiring: .\deploy-catalog.ps1
$ErrorActionPreference = 'Stop'

if (-not (Test-Path .\src)) {
    Write-Host 'XATO: src papkasi topilmadi. Repo root papkasida ekanligingizni tekshiring.' -ForegroundColor Red
    exit 1
}

$changed = @()

# ---- src/application/ports/repositories/teacher.repository.port.ts ----
$content_6021124905092662646 = @'
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
'@
$targetPath = 'src\application\ports\repositories\teacher.repository.port.ts'
$dir = Split-Path $targetPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $targetPath)
Set-Content -Path $targetPath -Value $content_6021124905092662646 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI]  $targetPath" } else { $changed += "[YANGILANDI] $targetPath" }

# ---- src/infrastructure/db/repositories/teacher.repository.ts ----
$content_403649588009653077 = @'
import { eq, and, or, ilike, sql, asc, count } from "drizzle-orm";
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
    const whereClause = and(eq(teachers.districtId, districtId), eq(teachers.publishStatus, PUBLISHED));

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
$targetPath = 'src\infrastructure\db\repositories\teacher.repository.ts'
$dir = Split-Path $targetPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $targetPath)
Set-Content -Path $targetPath -Value $content_403649588009653077 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI]  $targetPath" } else { $changed += "[YANGILANDI] $targetPath" }

# ---- src/application/dto/public-teacher-catalog.dto.ts ----
$content_5672352596363965330 = @'
/**
 * PUBLIC catalog DTOs (Viloyat → Tuman → Ustoz → Profil).
 *
 * Deliberately separate from TeacherPublishQueueItem / TeacherPublishDetail
 * (moderator-facing types) — those carry internal/moderation fields that must
 * never reach an unauthenticated public bot user. These DTOs are an explicit
 * allow-list: only fields listed here can ever be sent to the public bot.
 *
 * NEVER add: recommenderPhone, teacherPhone, userId, moderator/internal
 * fields, moderation metadata, internal storage metadata, or any other
 * nominator's data.
 */

export interface PublicRegionSummary {
  id: string;
  name: string;
  publishedTeacherCount: number;
}

export interface PublicDistrictSummary {
  id: string;
  name: string;
  publishedTeacherCount: number;
}

export interface PublicTeacherListItem {
  id: string;
  fullName: string;
  school: string | null;
  subject: string | null;
}

export interface PublicTeacherListPage {
  items: PublicTeacherListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PublicMediaItem {
  id: string;
  mediaType: "photo" | "video" | "document";
  objectKey: string | null;
  storageProvider: string | null;
  telegramFileId: string | null;
}

export interface PublicTeacherProfile {
  id: string;
  fullName: string;
  regionName: string | null;
  districtName: string | null;
  school: string | null;
  subject: string | null;
  position: string | null;
  yearsOfExperience: number | null;
  biography: string | null;
  achievements: string | null;
  educationalPhilosophy: string | null;
  impactStories: string | null;
  media: PublicMediaItem[];
}
'@
$targetPath = 'src\application\dto\public-teacher-catalog.dto.ts'
$dir = Split-Path $targetPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $targetPath)
Set-Content -Path $targetPath -Value $content_5672352596363965330 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI]  $targetPath" } else { $changed += "[YANGILANDI] $targetPath" }

# ---- src/application/use-cases/teacher/get-public-teacher-catalog.use-case.ts ----
$content_6099205689577578066 = @'
import type { TeacherRepositoryPort } from "../../ports/repositories/teacher.repository.port";
import type {
  PublicRegionSummary,
  PublicDistrictSummary,
  PublicTeacherListPage,
} from "../../dto/public-teacher-catalog.dto";

const PAGE_SIZE = 10;

/**
 * Public "👨‍🏫 Ustozlar" catalog: Viloyat → Tuman/Shahar → Ustozlar ro'yxati.
 * No auth (public bot, unauthenticated users) — every query is scoped to
 * publishStatus="published" at the repository level (see TeacherRepository's
 * listPublished* methods), so pending/rejected/ready_for_publish teachers can
 * never surface here regardless of how this use case is called.
 */
export class GetPublicTeacherCatalogUseCase {
  constructor(private readonly teacherRepo: TeacherRepositoryPort) {}

  async listRegions(): Promise<PublicRegionSummary[]> {
    const regions = await this.teacherRepo.listPublishedRegionsWithCounts();
    return regions.map((region) => ({
      id: region.id,
      name: region.nameUzLatn,
      publishedTeacherCount: region.publishedCount,
    }));
  }

  async listDistricts(regionId: string): Promise<PublicDistrictSummary[]> {
    const districts = await this.teacherRepo.listPublishedDistrictsByRegion(regionId);
    return districts.map((district) => ({
      id: district.id,
      name: district.nameUzLatn,
      publishedTeacherCount: district.publishedCount,
    }));
  }

  async listTeachers(districtId: string, page: number): Promise<PublicTeacherListPage> {
    const safePage = Math.max(0, page);
    const offset = safePage * PAGE_SIZE;

    const { items, total } = await this.teacherRepo.listPublishedTeachersByDistrict(
      districtId,
      PAGE_SIZE,
      offset,
    );

    return {
      items,
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }
}
'@
$targetPath = 'src\application\use-cases\teacher\get-public-teacher-catalog.use-case.ts'
$dir = Split-Path $targetPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $targetPath)
Set-Content -Path $targetPath -Value $content_6099205689577578066 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI]  $targetPath" } else { $changed += "[YANGILANDI] $targetPath" }

# ---- src/application/use-cases/teacher/get-public-teacher-profile.use-case.ts ----
$content_2990574654594249773 = @'
import type { TeacherRepositoryPort } from "../../ports/repositories/teacher.repository.port";
import type { RecommendationRepositoryPort } from "../../ports/repositories/recommendation.repository.port";
import type { MediaRepositoryPort } from "../../ports/repositories/media.repository.port";
import type { PublicTeacherProfile } from "../../dto/public-teacher-catalog.dto";

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
        objectKey: item.objectKey,
        storageProvider: item.storageProvider,
        telegramFileId: item.telegramFileId,
      })),
    };
  }
}
'@
$targetPath = 'src\application\use-cases\teacher\get-public-teacher-profile.use-case.ts'
$dir = Split-Path $targetPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $targetPath)
Set-Content -Path $targetPath -Value $content_2990574654594249773 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI]  $targetPath" } else { $changed += "[YANGILANDI] $targetPath" }

# ---- src/infrastructure/telegram/public-bot/handlers/catalog.handler.ts ----
$content_2005426900297896344 = @'
import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { GetPublicTeacherCatalogUseCase } from "../../../../application/use-cases/teacher/get-public-teacher-catalog.use-case";
import type { GetPublicTeacherProfileUseCase } from "../../../../application/use-cases/teacher/get-public-teacher-profile.use-case";
import type { Env } from "../../../config/env";
import { logger } from "../../../logging/logger";

/**
 * Public "👨‍🏫 Ustozlar" catalog. Unauthenticated — every list here is already
 * scoped to publishStatus="published" inside GetPublicTeacherCatalogUseCase /
 * GetPublicTeacherProfileUseCase, so this handler only needs to render.
 *
 * Callback data stays short and ID-only (Telegram's 64-byte limit):
 *   catalog:regions
 *   catalog:region:<regionId>
 *   catalog:district:<districtId>:<page>
 *   catalog:teacher:<teacherId>
 */
export function registerCatalog(
  getCatalog: GetPublicTeacherCatalogUseCase,
  getProfile: GetPublicTeacherProfileUseCase,
  env: Env,
) {
  async function safeReply(ctx: Context, text: string, extra?: Parameters<Context["reply"]>[1]) {
    try {
      await ctx.reply(text, extra);
    } catch (err) {
      logger.error("catalog.reply_failed", { err: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    async showRegions(ctx: Context) {
      let regions;
      try {
        regions = await getCatalog.listRegions();
      } catch (err) {
        logger.error("catalog.list_regions_failed", { err: err instanceof Error ? err.message : String(err) });
        await safeReply(ctx, "⚠️ Ustozlar ro'yxati yuklanmadi. Birozdan so'ng qayta urinib ko'ring.");
        return;
      }

      if (regions.length === 0) {
        await safeReply(ctx, "🗂 Hozircha nashr qilingan ustozlar mavjud emas.");
        return;
      }

      const kb = new InlineKeyboard();
      regions.forEach((region) => {
        kb.text(`${region.name} (${region.publishedTeacherCount})`, `catalog:region:${region.id}`).row();
      });

      await safeReply(ctx, "👨‍🏫 Ustozlar\n\nViloyatni tanlang:", { reply_markup: kb });
    },

    async showDistricts(ctx: Context, regionId: string) {
      let districts;
      try {
        districts = await getCatalog.listDistricts(regionId);
      } catch (err) {
        logger.error("catalog.list_districts_failed", {
          regionId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "⚠️ Tumanlar ro'yxati yuklanmadi.");
        return;
      }

      if (districts.length === 0) {
        await safeReply(ctx, "🗂 Bu viloyatda hozircha nashr qilingan ustozlar mavjud emas.");
        return;
      }

      const kb = new InlineKeyboard();
      districts.forEach((district) => {
        kb.text(`${district.name} (${district.publishedTeacherCount})`, `catalog:district:${district.id}:0`).row();
      });
      kb.text("⬅️ Viloyatlar", "catalog:regions");

      await safeReply(ctx, "Tuman/Shaharni tanlang:", { reply_markup: kb });
    },

    async showTeachers(ctx: Context, districtId: string, page: number) {
      let result;
      try {
        result = await getCatalog.listTeachers(districtId, page);
      } catch (err) {
        logger.error("catalog.list_teachers_failed", {
          districtId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "⚠️ Ustozlar ro'yxati yuklanmadi.");
        return;
      }

      if (result.total === 0) {
        await safeReply(ctx, "🗂 Bu tumanda hozircha nashr qilingan ustozlar mavjud emas.", {
          reply_markup: new InlineKeyboard().text("⬅️ Viloyatlar", "catalog:regions"),
        });
        return;
      }

      const kb = new InlineKeyboard();
      result.items.forEach((teacher) => {
        kb.text(teacher.fullName, `catalog:teacher:${teacher.id}`).row();
      });

      if (result.totalPages > 1) {
        kb.text("⬅️", `catalog:district:${districtId}:${Math.max(0, result.page - 1)}`)
          .text(`${result.page + 1}/${result.totalPages}`, "catalog:noop")
          .text("➡️", `catalog:district:${districtId}:${Math.min(result.totalPages - 1, result.page + 1)}`)
          .row();
      }
      kb.text("⬅️ Viloyatlar", "catalog:regions");

      await safeReply(ctx, `👨‍🏫 Ustozlar (${result.total} ta):`, { reply_markup: kb });
    },

    async showProfile(ctx: Context, teacherId: string) {
      let profile;
      try {
        profile = await getProfile.execute({ teacherId });
      } catch (err) {
        logger.error("catalog.get_profile_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "⚠️ Ustoz profili yuklanmadi.");
        return;
      }

      if (!profile) {
        await safeReply(ctx, "⚠️ Ustoz topilmadi yoki hali nashr qilinmagan.", {
          reply_markup: new InlineKeyboard().text("⬅️ Viloyatlar", "catalog:regions"),
        });
        return;
      }

      const lines: string[] = [`👤 ${profile.fullName}`];
      if (profile.regionName || profile.districtName) {
        lines.push(`📍 ${profile.regionName ?? "-"} / ${profile.districtName ?? "-"}`);
      }
      if (profile.school) lines.push(`🏫 ${profile.school}`);
      if (profile.subject) lines.push(`📘 Fan: ${profile.subject}`);
      if (profile.position) lines.push(`💼 Lavozim: ${profile.position}`);
      if (profile.yearsOfExperience != null) lines.push(`⏳ Tajriba: ${profile.yearsOfExperience} yil`);
      if (profile.biography) lines.push(`\n${profile.biography}`);
      if (profile.achievements) lines.push(`\n🏆 Yutuqlari:\n${profile.achievements}`);
      if (profile.educationalPhilosophy) lines.push(`\n💡 Ta'lim falsafasi:\n${profile.educationalPhilosophy}`);
      if (profile.impactStories) lines.push(`\n✨ Hikoyalar:\n${profile.impactStories}`);

      const kb = new InlineKeyboard().text("⬅️ Viloyatlar", "catalog:regions");
      await safeReply(ctx, lines.join("\n"), { reply_markup: kb });

      await this.sendProfileMedia(ctx, profile.media);
    },

    async sendProfileMedia(ctx: Context, media: { id: string; mediaType: string; objectKey: string | null; telegramFileId: string | null }[]) {
      if (media.length === 0) return;

      const r2Bucket = (env as { R2_BUCKET?: R2Bucket }).R2_BUCKET;

      for (const item of media) {
        try {
          let sent = false;

          if (r2Bucket && item.objectKey) {
            const object = await r2Bucket.get(item.objectKey);
            if (object) {
              const bytes = new Uint8Array(await object.arrayBuffer());
              const filename = item.objectKey.split("/").pop() ?? "media";
              if (item.mediaType === "photo") {
                await ctx.replyWithPhoto(new InputFile(bytes, filename));
                sent = true;
              } else if (item.mediaType === "video") {
                await ctx.replyWithVideo(new InputFile(bytes, filename));
                sent = true;
              }
            }
          }

          if (!sent && item.telegramFileId) {
            const publicBotToken = (env as { PUBLIC_BOT_TOKEN?: string }).PUBLIC_BOT_TOKEN;
            if (publicBotToken) {
              const fileRes = await fetch(
                `https://api.telegram.org/bot${publicBotToken}/getFile?file_id=${item.telegramFileId}`,
              );
              const fileData = (await fileRes.json()) as any;
              if (fileData.ok && fileData.result?.file_path) {
                const downloadUrl = `https://api.telegram.org/file/bot${publicBotToken}/${fileData.result.file_path}`;
                const binaryRes = await fetch(downloadUrl);
                if (binaryRes.ok) {
                  const bytes = new Uint8Array(await binaryRes.arrayBuffer());
                  const filename = fileData.result.file_path.split("/").pop() ?? "media";
                  if (item.mediaType === "photo") {
                    await ctx.replyWithPhoto(new InputFile(bytes, filename));
                  } else if (item.mediaType === "video") {
                    await ctx.replyWithVideo(new InputFile(bytes, filename));
                  }
                }
              }
            }
          }
        } catch (err) {
          logger.error("catalog.media_send_failed", {
            mediaId: item.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
  };
}
'@
$targetPath = 'src\infrastructure\telegram\public-bot\handlers\catalog.handler.ts'
$dir = Split-Path $targetPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $targetPath)
Set-Content -Path $targetPath -Value $content_2005426900297896344 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI]  $targetPath" } else { $changed += "[YANGILANDI] $targetPath" }

# ---- src/infrastructure/telegram/public-bot/keyboards/main-menu.keyboard.ts ----
$content_8216400761655943961 = @'
import { InlineKeyboard } from "grammy";
import { t } from "../../../../i18n/translate";

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(t("menu.submit_info"), "menu:submit_info").row()
    .text("👨‍🏫 Ustozlar", "catalog:regions").row()
    .text(t("menu.about"), "menu:about").row()
    .text(t("menu.contact"), "menu:contact");
}

/**
 * Business rule A: the bot must always ask "who is this about" before starting any
 * submission, with "another teacher" visually emphasized as the encouraged default —
 * listed first, with a star, versus a plain circle for self-submission. Telegram
 * buttons can't be "pre-selected," so emphasis is carried by order + iconography + copy.
 */
export function whoIsThisAboutKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(t("who.btn_teacher"), "who:teacher").row()
    .text(t("who.btn_self"), "who:self");
}

export function joinChannelKeyboard(channelUsername: string): InlineKeyboard {
  const channelUrl = `https://t.me/${channelUsername.replace(/^@/, "")}`;
  return new InlineKeyboard()
    .url(t("start.btn_join_channel"), channelUrl).row()
    .text(t("start.btn_check_subscription"), "check_subscription");
}
'@
$targetPath = 'src\infrastructure\telegram\public-bot\keyboards\main-menu.keyboard.ts'
$dir = Split-Path $targetPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $targetPath)
Set-Content -Path $targetPath -Value $content_8216400761655943961 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI]  $targetPath" } else { $changed += "[YANGILANDI] $targetPath" }

# ---- src/infrastructure/telegram/public-bot/router.ts ----
$content_660747348064249053 = @'
import { Bot, InlineKeyboard } from "grammy";
import type { Container } from "../../config/di-container";
import { subscriptionGuard } from "./middleware/subscription-guard.middleware";
import { startHandler, checkSubscriptionHandler } from "./handlers/start.handler";
import { registerNominationFlow } from "./handlers/nomination-flow.handler";
import { registerSelfSubmissionFlow } from "./handlers/self-submission-flow.handler";
import { registerCatalog } from "./handlers/catalog.handler";
import { GetPublicTeacherCatalogUseCase } from "../../../application/use-cases/teacher/get-public-teacher-catalog.use-case";
import { GetPublicTeacherProfileUseCase } from "../../../application/use-cases/teacher/get-public-teacher-profile.use-case";
import { mainMenuKeyboard, whoIsThisAboutKeyboard } from "./keyboards/main-menu.keyboard";
import { t } from "../../../i18n/translate";
import { logger } from "../../logging/logger";

export function buildPublicBot(botToken: string, requiredChannelId: string, container: Container) {
  const bot = new Bot(botToken);
  const { publicTelegramClient } = container.telegramClients;
  const { registerUser, submitNomination } = container.useCases;

  // Stage 9: never let an unhandled error silently drop a user's update — log it with
  // context and show a friendly message instead of leaving them stuck mid-flow.
  bot.catch((err) => {
    logger.error("public_bot_unhandled_error", {
      error: err.error instanceof Error ? err.error.message : String(err.error),
      updateId: err.ctx.update.update_id,
    });
    void err.ctx.reply("Kechirasiz, xatolik yuz berdi. Iltimos /start buyrug'ini qayta yuboring.").catch(() => {});
  });

  const nomination = registerNominationFlow(
    container.db,
    container.sessionStore,
    submitNomination,
    container.r2StorageService,
    botToken,
  );
  const selfSubmission = registerSelfSubmissionFlow(
    container.db,
    container.sessionStore,
    submitNomination,
  );

  // NOTE: constructed directly from existing repos — no DI container changes made.
  // If container.repos already exposes named getPublicTeacherCatalog/getPublicTeacherProfile
  // use-cases elsewhere in the container, prefer wiring those instead of this local
  // construction to avoid two instances existing side by side.
  const getPublicTeacherCatalog = new GetPublicTeacherCatalogUseCase(container.repos.teacherRepo);
  const getPublicTeacherProfile = new GetPublicTeacherProfileUseCase(
    container.repos.teacherRepo,
    container.repos.recommendationRepo,
    container.repos.mediaRepo,
  );
  const catalog = registerCatalog(getPublicTeacherCatalog, getPublicTeacherProfile, container.env);

   bot.command("start", startHandler(registerUser));

  bot.callbackQuery(
    "check_subscription",
    checkSubscriptionHandler(publicTelegramClient, requiredChannelId),
  );

  bot.use(subscriptionGuard(publicTelegramClient, requiredChannelId));
  // Business rule A: always ask "who is this about" before any submission starts.
  // "Boshqa ustoz" is the encouraged default — emphasized in the keyboard itself
  // (see whoIsThisAboutKeyboard), not by skipping the question.
  bot.callbackQuery("menu:submit_info", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(t("who.question"), { reply_markup: whoIsThisAboutKeyboard() });
  });
bot.callbackQuery("recommender_phone:skip", async (ctx) => {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id;
  if (!userId) return;

  const user = await container.repos.userRepo.findByTelegramId(userId);
  if (!user) return;

  const session = await container.sessionStore.get(user.id, "public");
  if (!session) return;

  const data = { ...session.collectedData } as Record<string, unknown>;

  data.recommenderPhone = null;

  await container.sessionStore.update(session.id, {
    currentStep: "consent",
    collectedData: data,
  });

  await ctx.reply(t("nomination.consent_question"), {
    reply_markup: new InlineKeyboard()
      .text(t("nomination.btn_consent_yes"), "consent:yes")
      .row()
      .text(t("nomination.btn_consent_no"), "consent:no"),
  });
});
  bot.callbackQuery("who:teacher", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    await ctx.answerCallbackQuery();
    await nomination.start(ctx, user.id);
  });

  bot.callbackQuery("who:self", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    await ctx.answerCallbackQuery();
    await selfSubmission.start(ctx, user.id);
  });

  bot.callbackQuery("menu:about", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "\"Qahramon o'qituvchilar\" — fidoyi o'qituvchilarni tan olish va ularning tajribasini kelajak avlodlar uchun saqlab qolish milliy loyihasi.",
    );
  });

  bot.callbackQuery("menu:contact", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Savol va takliflar uchun: @qahramon_oqituvchilar_support");
  });

  // Public "👨‍🏫 Ustozlar" catalog — unauthenticated, published-only (see catalog.handler.ts).
  // Registered before the generic callback_query:data dispatcher below so it never
  // falls through to nomination/self-submission handling or the "unknown button" reply.
  bot.callbackQuery("catalog:regions", async (ctx) => {
    await ctx.answerCallbackQuery();
    await catalog.showRegions(ctx);
  });
  bot.callbackQuery("catalog:noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });
  bot.callbackQuery(/^catalog:region:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await catalog.showDistricts(ctx, ctx.match![1]);
  });
  bot.callbackQuery(/^catalog:district:(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await catalog.showTeachers(ctx, ctx.match![1], Number(ctx.match![2]));
  });
  bot.callbackQuery(/^catalog:teacher:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await catalog.showProfile(ctx, ctx.match![1]);
  });

  // Both flows share these dispatch points — each handler checks bot_sessions.flowType
  // internally and no-ops (returns false) if the session isn't in its own flow, so
  // trying both in sequence is safe and never double-processes an update.
  bot.on("callback_query:data", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    const data = ctx.callbackQuery.data;
    const handled = (await nomination.handleCallback(ctx, user.id, data)) || (await selfSubmission.handleCallback(ctx, user.id, data));
    if (!handled) {
      await ctx.answerCallbackQuery();
      await ctx.reply(t("menu.unknown_button"));
    }
  });

  bot.on("message:text", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    const text = ctx.message.text;
    const handled = (await nomination.handleText(ctx, user.id, text)) || (await selfSubmission.handleText(ctx, user.id, text));
    if (!handled) {
      const session = await container.sessionStore.get(user.id, "public");
      if (session && session.flowType !== "none" && session.currentStep) {
        // User is mid-flow but message wasn't expected here.
        await ctx.reply(t("menu.unknown_input_in_flow"));
        return;
      }
      // Fallback: show main menu
      await ctx.reply(t("menu.title"), { reply_markup: mainMenuKeyboard() });
    }
  });

  // Media (business rule H): stored as Telegram file_id references for MVP, always
  // attached to the recommendation being submitted — never directly to a teacher.
  bot.on("message:contact", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    await nomination.handleContact(ctx, user.id, ctx.message.contact);
  });

  bot.on("message:photo", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    const largest = ctx.message.photo[ctx.message.photo.length - 1]!;
    console.log("PUBLIC BOT FILE_ID:", largest.file_id);
console.log("PUBLIC BOT BOT_ID:", ctx.me.id);
    (await nomination.handleMedia(ctx, user.id, "photo", largest.file_id, largest.file_unique_id, largest.file_size)) ||
      (await selfSubmission.handleMedia(ctx, user.id, "photo", largest.file_id, largest.file_unique_id, largest.file_size));
  });

  bot.on("message:video", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    const video = ctx.message.video;
    (await nomination.handleMedia(ctx, user.id, "video", video.file_id, video.file_unique_id, video.file_size)) ||
      (await selfSubmission.handleMedia(ctx, user.id, "video", video.file_id, video.file_unique_id, video.file_size));
  });

  return bot;
}
'@
$targetPath = 'src\infrastructure\telegram\public-bot\router.ts'
$dir = Split-Path $targetPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$isNew = -not (Test-Path $targetPath)
Set-Content -Path $targetPath -Value $content_660747348064249053 -Encoding UTF8 -NoNewline
if ($isNew) { $changed += "[YANGI]  $targetPath" } else { $changed += "[YANGILANDI] $targetPath" }

Write-Host ''
Write-Host '===== Ozgargan fayllar =====' -ForegroundColor Cyan
$changed | ForEach-Object { Write-Host $_ }
Write-Host ''
Write-Host 'Endi validatsiya qiling:' -ForegroundColor Yellow
Write-Host '  npx tsc --noEmit --pretty false'
Write-Host '  git diff --check'
Write-Host '  git status'
