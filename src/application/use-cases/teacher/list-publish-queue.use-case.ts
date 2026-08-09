import type { TeacherRepositoryPort, TeacherPublishQueueItem } from "../../ports/repositories/teacher.repository.port";
import type { RecommendationRepositoryPort } from "../../ports/repositories/recommendation.repository.port";
import type { UserRepositoryPort } from "../../ports/repositories/user.repository.port";
import { UnauthorizedActionError } from "../../../domain/errors/domain-errors";

export interface PublishQueueEntry {
  teacher: TeacherPublishQueueItem;
  independentRecommendationCount: number;
}

export interface ListPublishQueueInput {
  moderatorUserId: string;
  page: number;
}

export interface ListPublishQueueResult {
  items: PublishQueueEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 10;

/**
 * Lists teachers currently at publishStatus "ready_for_publish", oldest first, paginated.
 * Deliberately does not use TeacherRepositoryPort.search() — search() is
 * unordered/filter-driven for moderator lookup, this is a stable ordered queue.
 * Recommendation counts are fetched in a single grouped query (see
 * RecommendationRepositoryPort.countIndependentByTeacherIds) to avoid N+1.
 */
export class ListPublishQueueUseCase {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly teacherRepo: TeacherRepositoryPort,
    private readonly recommendationRepo: RecommendationRepositoryPort,
  ) {}

  async execute(input: ListPublishQueueInput): Promise<ListPublishQueueResult> {
    const isModerator = await this.userRepo.isModeratorOrAbove(input.moderatorUserId);
    if (!isModerator) {
      throw new UnauthorizedActionError("Only moderators can view the publish queue");
    }

    const page = Math.max(0, input.page);
    const offset = page * PAGE_SIZE;

    const [teachers, total] = await Promise.all([
      this.teacherRepo.listPublishQueue("ready_for_publish", PAGE_SIZE, offset),
      this.teacherRepo.countByPublishStatus("ready_for_publish"),
    ]);

    const counts = await this.recommendationRepo.countIndependentByTeacherIds(
      teachers.map((teacher) => teacher.id),
    );

    const items: PublishQueueEntry[] = teachers.map((teacher) => ({
      teacher,
      independentRecommendationCount: counts[teacher.id] ?? 0,
    }));

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return { items, page, pageSize: PAGE_SIZE, total, totalPages };
  }
}