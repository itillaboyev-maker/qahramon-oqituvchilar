import type { Relationship, MediaType, SubmissionType } from "../../domain/enums";

export interface NominationMediaItem {
  mediaType: MediaType;
  telegramFileId: string;
  telegramFileUniqueId?: string;
  // R2 metadata (populated when uploaded to R2)
  objectKey?: string | null;
  bucketName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  checksumSha256?: string | null;
}

/**
 * Fast-path nomination — this is ALL the bot asks for on first submission
 * (product decision #5: under 2 minutes). Everything else is optional and collected
 * only if the person chooses "add more" at the end of the flow.
 */
export interface NominationDto {
  // about the teacher — essential
teacherFullName: string;

regionId: string;
districtId: string;
school: string;


  // about the recommendation — essential
  relationship: Relationship;
  recommendationText: string; // "why do you recommend this teacher" — one free-text answer

  // about the recommender — optional (product decision #3)
  recommenderName?: string;
  recommenderPhone?: string;
  teacherPhone?: string | null;

  // extended / optional — only present if the user added more
  subject?: string;
  achievementsText?: string;
  teachingMethodsText?: string;
  studentImpactText?: string;
  additionalInfo?: string;

  // optional media, collected as Telegram file_id references (MVP storage strategy)
  media?: NominationMediaItem[];

  // Defaults to "nominated" in SubmitNominationUseCase — self-submission flow (Stage 6)
  // passes "self" through this same field rather than duplicating recommendation-
  // creation logic in a parallel use case.
  submissionType?: SubmissionType;

  submittedByUserId: string;
  consentGiven: boolean;
}
