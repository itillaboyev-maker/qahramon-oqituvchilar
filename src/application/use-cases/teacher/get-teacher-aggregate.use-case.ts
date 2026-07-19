import type { TeacherRepositoryPort } from "../../ports/repositories/teacher.repository.port";
import type { RecommendationRepositoryPort } from "../../ports/repositories/recommendation.repository.port";
import type { MediaRepositoryPort } from "../../ports/repositories/media.repository.port";
import type { Recommendation } from "../../../domain/entities/recommendation.entity";
import type { TeacherAggregate, TimelineYearGroup } from "../../dto/teacher-aggregate.dto";
import { NotFoundError } from "../../../domain/errors/domain-errors";

function groupByYear(recommendations: Recommendation[]): TimelineYearGroup[] {
  const byYear = new Map<number, Recommendation[]>();
  for (const rec of recommendations) {
    const year = rec.createdAt.getFullYear();
    const bucket = byYear.get(year) ?? [];
    bucket.push(rec);
    byYear.set(year, bucket);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, recs]) => ({ year, recommendations: recs }));
}

/**
 * Business rule E (aggregation) + G (timeline, as a computed view per DECISIONS.md
 * D012). Assembles everything known about a teacher from its recommendations and
 * their media — nothing is stored separately, so nothing can go stale or be
 * accidentally overwritten. Read-only; used by the moderator queue/merge panel today,
 * and is the natural seam a future public teacher profile page would read from.
 */
export class GetTeacherAggregateUseCase {
  constructor(
    private readonly teacherRepo: TeacherRepositoryPort,
    private readonly recommendationRepo: RecommendationRepositoryPort,
    private readonly mediaRepo: MediaRepositoryPort,
  ) {}

  async execute(teacherId: string): Promise<TeacherAggregate> {
    const teacher = await this.teacherRepo.findById(teacherId);
    if (!teacher) throw new NotFoundError("Teacher", teacherId);

    const recommendations = await this.recommendationRepo.listByTeacherId(teacherId);
    const media = await this.mediaRepo.listByRecommendationIds(recommendations.map((r) => r.id));
    const communityCount = await this.recommendationRepo.countIndependentByTeacherId(teacherId);

    return {
      teacher,
      recommendations,
      media,
      communityCount,
      timeline: groupByYear(recommendations),
    };
  }
}
