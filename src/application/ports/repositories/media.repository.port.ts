import type { Media } from "../../../domain/entities/media.entity";
import type { MediaType } from "../../../domain/enums";

export interface CreateMediaInput {
  recommendationId: string;
  mediaType: MediaType;
  telegramFileId: string;
  telegramFileUniqueId?: string | null;
  uploadedBy?: string | null;
}

export interface MediaRepositoryPort {
  attachToRecommendation(input: CreateMediaInput): Promise<Media>;
  /** Powers teacher aggregation (Stage 4): all media across all of a teacher's recommendations. */
  listByRecommendationIds(recommendationIds: string[]): Promise<Media[]>;
}
