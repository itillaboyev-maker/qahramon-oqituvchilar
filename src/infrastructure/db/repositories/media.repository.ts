import { inArray } from "drizzle-orm";
import type { Database } from "../client";
import { media } from "../schema";
import type {
  MediaRepositoryPort,
  CreateMediaInput,
} from "../../../application/ports/repositories/media.repository.port";
import type { Media } from "../../../domain/entities/media.entity";

export class MediaRepository implements MediaRepositoryPort {
  constructor(private readonly db: Database) {}

  async attachToRecommendation(input: CreateMediaInput): Promise<Media> {
    const [row] = await this.db
      .insert(media)
      .values({
        recommendationId: input.recommendationId,
        mediaType: input.mediaType,
        storageProvider: "telegram",
        telegramFileId: input.telegramFileId,
        telegramFileUniqueId: input.telegramFileUniqueId ?? null,
        uploadedBy: input.uploadedBy ?? null,
      })
      .returning();

    if (!row) throw new Error("Failed to attach media");
    return row as Media;
  }

  async listByRecommendationIds(recommendationIds: string[]): Promise<Media[]> {
    if (recommendationIds.length === 0) return [];
    const rows = await this.db.select().from(media).where(inArray(media.recommendationId, recommendationIds));
    return rows as Media[];
  }
}
