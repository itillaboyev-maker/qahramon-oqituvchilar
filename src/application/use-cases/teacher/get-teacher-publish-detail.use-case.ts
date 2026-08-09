import type { TeacherRepositoryPort, TeacherPublishQueueItem } from "../../ports/repositories/teacher.repository.port";
import type { RecommendationRepositoryPort } from "../../ports/repositories/recommendation.repository.port";
import type { MediaRepositoryPort } from "../../ports/repositories/media.repository.port";
import type { UserRepositoryPort } from "../../ports/repositories/user.repository.port";
import type { Recommendation } from "../../../domain/entities/recommendation.entity";
import type { MediaType } from "../../../domain/enums";
import { UnauthorizedActionError } from "../../../domain/errors/domain-errors";

export interface PublicRecommendationPreview {
  recommendationId: string;
  relationship: Recommendation["relationship"] | null;
  recommendationText: string | null;
}

export interface RecommendationWithMediaPreview {
  recommendation: PublicRecommendationPreview;
  mediaSummary: string;
}

export interface TeacherPublishDetail {
  teacher: TeacherPublishQueueItem;
  independentRecommendationCount: number;
  recommendations: RecommendationWithMediaPreview[];
}

export interface GetTeacherPublishDetailInput {
  teacherId: string;
  moderatorUserId: string;
}

function summarizeMedia(counts: Record<MediaType, number>): string {
  const parts: string[] = [];
  if (counts.photo > 0) parts.push(`${counts.photo} photo${counts.photo > 1 ? "s" : ""}`);
  if (counts.video > 0) parts.push(`${counts.video} video${counts.video > 1 ? "s" : ""}`);
  if (counts.document > 0) parts.push(`${counts.document} file${counts.document > 1 ? "s" : ""}`);
  return parts.length > 0 ? parts.join(", ") : "No media";
}

/**
 * Assembles the publish-queue detail screen for a single teacher: profile
 * fields, independent recommendation count, and every recommendation with a
 * per-recommendation media preview. Fetches all recommendations and all their
 * media in exactly two queries total — see the single listByTeacherId +
 * single listByRecommendationIds calls below, not one per recommendation.
 */
export class GetTeacherPublishDetailUseCase {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly teacherRepo: TeacherRepositoryPort,
    private readonly recommendationRepo: RecommendationRepositoryPort,
    private readonly mediaRepo: MediaRepositoryPort,
  ) {}

  async execute(input: GetTeacherPublishDetailInput): Promise<TeacherPublishDetail | null> {
    const isModerator = await this.userRepo.isModeratorOrAbove(input.moderatorUserId);
    if (!isModerator) {
      throw new UnauthorizedActionError("Only moderators can view teacher publish details");
    }

    const teacher = await this.teacherRepo.findPublishQueueDetailById(input.teacherId);
    if (!teacher) return null;

    const [independentRecommendationCount, recommendations] = await Promise.all([
      this.recommendationRepo.countIndependentByTeacherId(teacher.id),
      this.recommendationRepo.listByTeacherId(teacher.id),
    ]);

    const recommendationIds = recommendations.map((r) => r.id);
    const media =
      recommendationIds.length > 0
        ? await this.mediaRepo.listByRecommendationIds(recommendationIds)
        : [];

    const mediaCountsByRecommendation = new Map<string, Record<MediaType, number>>();
    for (const item of media) {
      const bucket =
        mediaCountsByRecommendation.get(item.recommendationId) ??
        { photo: 0, video: 0, document: 0 };
      bucket[item.mediaType] += 1;
      mediaCountsByRecommendation.set(item.recommendationId, bucket);
    }

    const recommendationsWithMedia: RecommendationWithMediaPreview[] = recommendations.map(
      (recommendation) => ({
        recommendation: {
          recommendationId: recommendation.id,
          relationship: recommendation.relationship,
          recommendationText: recommendation.recommendationText,
        },
        mediaSummary: summarizeMedia(
          mediaCountsByRecommendation.get(recommendation.id) ?? { photo: 0, video: 0, document: 0 },
        ),
      }),
    );

    return {
      teacher,
      independentRecommendationCount,
      recommendations: recommendationsWithMedia,
    };
  }
}