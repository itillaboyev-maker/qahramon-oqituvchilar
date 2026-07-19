import type { RecommendationRepositoryPort } from "../../ports/repositories/recommendation.repository.port";
import type { Recommendation } from "../../../domain/entities/recommendation.entity";

/** Powers the admin bot's "🗂 Navbat" (queue) button — oldest NEW items first. */
export class ListPendingRecommendationsUseCase {
  constructor(private readonly recommendationRepo: RecommendationRepositoryPort) {}

  async execute(limit = 10): Promise<{ items: Recommendation[]; totalPending: number }> {
    const [items, totalPending] = await Promise.all([
      this.recommendationRepo.listByStatus("new", limit),
      this.recommendationRepo.countByStatus("new"),
    ]);
    return { items, totalPending };
  }
}
