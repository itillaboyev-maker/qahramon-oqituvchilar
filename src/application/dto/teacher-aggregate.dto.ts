import type { Teacher } from "../../domain/entities/teacher.entity";
import type { Recommendation } from "../../domain/entities/recommendation.entity";
import type { Media } from "../../domain/entities/media.entity";

export interface TimelineYearGroup {
  year: number;
  recommendations: Recommendation[];
}

/**
 * Read-model for "everything about teacher X" (business rule E — aggregation).
 * Nothing here is stored — it's assembled on read from recommendations + media,
 * which is what guarantees it can never go stale or lose data: there's no separate
 * aggregate row to forget to update.
 *
 * `timeline` (business rule G) is the same recommendations list grouped by year —
 * a computed view, not a stored table (see DECISIONS.md D012).
 */
export interface TeacherAggregate {
  teacher: Teacher;
  recommendations: Recommendation[];
  media: Media[];
  communityCount: number; // business rule B — internal signal only, never public ranking
  timeline: TimelineYearGroup[];
}
