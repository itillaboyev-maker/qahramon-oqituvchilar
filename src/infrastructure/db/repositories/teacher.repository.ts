import { eq, and, or, ilike, sql, asc, count } from "drizzle-orm";
import type { Database } from "../client";
import { teachers, regions, districts } from "../schema";
import type {
  TeacherRepositoryPort,
  CandidatePrefilterInput,
  TeacherSearchFilters,
  TeacherPublishQueueItem,
} from "../../../application/ports/repositories/teacher.repository.port";
import type { Teacher, NewTeacherInput } from "../../../domain/entities/teacher.entity";
import { IDENTITY_RESOLUTION } from "../../../shared/constants/identity-resolution.constants";

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
}