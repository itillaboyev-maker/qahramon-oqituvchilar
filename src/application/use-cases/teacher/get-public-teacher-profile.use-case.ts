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
 *   2. maps to PublicTeacherProfile, an explicit allow-list DTO - no
 *      recommender/teacher phone, no user IDs, no moderation metadata, no
 *      other nominator's data ever leaves this method.
 */

/** Joins non-empty texts with a blank line; returns null (never "") when nothing to show. */
function joinTexts(texts: (string | null)[]): string | null {
  const cleaned = texts.map((t) => t?.trim()).filter((t): t is string => Boolean(t));
  return cleaned.length > 0 ? cleaned.join("\n\n") : null;
}

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

    const allRecommendations = await this.recommendationRepo.listByTeacherId(teacher.id);
    // Only APPROVED recommendations are "approved public content". A teacher can be
    // published as soon as ONE recommendation is approved (see
    // ModerateRecommendationUseCase), so other recommendations attached to the same
    // teacher may still be new/under_review/rejected - that content, and its media,
    // must never reach the public bot.
    const approvedRecommendations = allRecommendations.filter((r) => r.status === "approved");
    const recommendationIds = approvedRecommendations.map((r) => r.id);
    const media =
      recommendationIds.length > 0
        ? await this.mediaRepo.listByRecommendationIds(recommendationIds)
        : [];

    const recommendationReasons = joinTexts(approvedRecommendations.map((r) => r.recommendationText));
    const impactStoriesFromRecommendations = joinTexts(
      approvedRecommendations.map((r) => r.studentImpactText),
    );
    const achievementsFromRecommendations = joinTexts([
      ...approvedRecommendations.map((r) => r.achievementsText),
      ...approvedRecommendations.map((r) => r.teachingMethodsText),
    ]);
    const additionalInfo = joinTexts(approvedRecommendations.map((r) => r.additionalInfo));

    return {
      id: teacher.id,
      fullName: teacher.fullName,
      regionName: teacher.regionName,
      districtName: teacher.districtName,
      school: teacher.school,
      subject: teacher.subject,
      position: teacher.position,
      yearsOfExperience: teacher.yearsOfExperience,
      // teacher.* - moderator/editor tomonidan tahrirlangan "published content".
      // Admin buni keyinchalik tahrirlasa, public bot aynan shu tahrirlangan
      // holatni ko'rsatishi kerak, shuning uchun bu maydonlar mavjud bo'lsa,
      // ular ustun turadi. Hali tahrirlanmagan bo'lsa (teacher.* = null),
      // approved recommendation(lar)dagi xom matnga qaytiladi - shu orqali
      // approved content hech qachon bo'sh ko'rinmaydi. recommendationText va
      // additionalInfo uchun teacher darajasida overraydable ustun yo'q - ular
      // doim recommendation'lardan olinadi. Original `recommendations` jadvali
      // bu yerda hech qachon yozilmaydi, faqat o'qiladi.
      biography: teacher.biography,
      achievements: teacher.achievements ?? achievementsFromRecommendations,
      educationalPhilosophy: teacher.educationalPhilosophy,
      impactStories: teacher.impactStories ?? impactStoriesFromRecommendations,
      recommendationReasons,
      additionalInfo,
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