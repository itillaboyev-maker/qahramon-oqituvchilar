import type { RecommendationRepositoryPort } from "../../ports/repositories/recommendation.repository.port";
import type { MediaRepositoryPort } from "../../ports/repositories/media.repository.port";
import type { NominationDto } from "../../dto/nomination.dto";
import type { Recommendation } from "../../../domain/entities/recommendation.entity";
import { FindOrCreateTeacherUseCase } from "../teacher/find-or-create-teacher.use-case";
import { ValidationError, RateLimitExceededError } from "../../../domain/errors/domain-errors";
import { RATE_LIMIT, TEXT_LIMITS } from "../../../shared/constants/security.constants";



/**
 * The single use case behind "🌟 Menga katta ta'sir qilgan ustoz haqida".
 * Always: find-or-create the teacher, then attach a NEW recommendation to it.
 * Never creates a duplicate teacher row, never blocks on phone number.
 * Media (business rule H) is attached to the recommendation, never to the teacher.
 */
export class SubmitNominationUseCase {
constructor(
  private readonly findOrCreateTeacher: FindOrCreateTeacherUseCase,
  private readonly recommendationRepo: RecommendationRepositoryPort,
  private readonly mediaRepo: MediaRepositoryPort,
) {}
  async execute(dto: NominationDto): Promise<{ recommendation: Recommendation; teacherWasCreated: boolean }> {
    if (!dto.teacherFullName?.trim()) {
      throw new ValidationError("Teacher full name is required");
    }
    if (!dto.recommendationText?.trim()) {
      throw new ValidationError("Recommendation text is required");
    }
    if (dto.recommendationText.length > TEXT_LIMITS.RECOMMENDATION_TEXT_MAX) {
      throw new ValidationError(`Recommendation text exceeds ${TEXT_LIMITS.RECOMMENDATION_TEXT_MAX} characters`);
    }
    if (dto.achievementsText && dto.achievementsText.length > TEXT_LIMITS.ACHIEVEMENTS_TEXT_MAX) {
      throw new ValidationError(`Achievements text exceeds ${TEXT_LIMITS.ACHIEVEMENTS_TEXT_MAX} characters`);
    }
    if (dto.recommenderPhone) {
      const digitsOnly = dto.recommenderPhone.replace(/[^0-9]/g, "");
      if (digitsOnly.length < TEXT_LIMITS.PHONE_MIN || dto.recommenderPhone.length > TEXT_LIMITS.PHONE_MAX) {
        throw new ValidationError("Phone number format looks invalid");
      }
    }
    if (dto.teacherPhone) {
      const digitsOnly = dto.teacherPhone.replace(/[^0-9]/g, "");
      if (digitsOnly.length < TEXT_LIMITS.PHONE_MIN || dto.teacherPhone.length > TEXT_LIMITS.PHONE_MAX) {
        throw new ValidationError("Phone number format looks invalid");
      }
    }

    // Stage 10 rate limiting — Postgres-backed, no new Cloudflare bindings. Checked
    // before any writes so an abusive submitter never even reaches Identity Resolution.
    const recentCount = await this.recommendationRepo.countRecentBySubmitter(
      dto.submittedByUserId,
      RATE_LIMIT.WINDOW_MINUTES,
    );
    if (recentCount >= RATE_LIMIT.MAX_SUBMISSIONS_PER_WINDOW) {
      throw new RateLimitExceededError();
    }

    const { teacher, wasCreated } = await this.findOrCreateTeacher.execute({
      fullName: dto.teacherFullName,
      regionId: dto.regionId,
      districtId: dto.districtId,
      school: dto.school,
      subject: dto.subject,
    });

    const recommendation = await this.recommendationRepo.create({
      teacherId: teacher.id,
      submittedByUserId: dto.submittedByUserId,
      recommenderName: dto.recommenderName ?? null,
      recommenderPhone: dto.teacherPhone ?? dto.recommenderPhone ?? null,
      teacherPhone: dto.teacherPhone ?? null,
      relationship: dto.relationship,
      submissionType: dto.submissionType ?? "nominated",
      recommendationText: dto.recommendationText,
      achievementsText: dto.achievementsText ?? null,
      teachingMethodsText: dto.teachingMethodsText ?? null,
      studentImpactText: dto.studentImpactText ?? null,
      additionalInfo: dto.additionalInfo ?? null,
      consentGiven: dto.consentGiven,
    });

    // Media is only ever attached via the recommendation it arrived with (rule H) —
    // never written onto the teacher row directly.
    if (dto.media && dto.media.length > 0) {
      for (const item of dto.media) {
        await this.mediaRepo.attachToRecommendation({
          recommendationId: recommendation.id,
          mediaType: item.mediaType,
          telegramFileId: item.telegramFileId,
          telegramFileUniqueId: item.telegramFileUniqueId ?? null,
          storageProvider: item.objectKey ? "r2" : "telegram",
          objectKey: item.objectKey ?? null,
          bucketName: item.bucketName ?? null,
          mimeType: item.mimeType ?? null,
          sizeBytes: item.sizeBytes ?? null,
          checksumSha256: item.checksumSha256 ?? null,
          uploadedBy: dto.submittedByUserId,
        });
      }
    }

    return { recommendation, teacherWasCreated: wasCreated };
  }
}
