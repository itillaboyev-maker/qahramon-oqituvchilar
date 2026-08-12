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
        objectKey: item.objectKey ?? null,
        storageProvider: item.storageProvider ?? null,
        telegramFileId: item.telegramFileId,
      })),
    };
  }
}