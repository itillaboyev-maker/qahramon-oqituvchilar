import type { TeacherRepositoryPort, TeacherPublishQueueItem } from "../../ports/repositories/teacher.repository.port";
import type { UserRepositoryPort } from "../../ports/repositories/user.repository.port";
import { UnauthorizedActionError } from "../../../domain/errors/domain-errors";

export interface ListPublishedTeachersInput {
  moderatorUserId: string;
  page: number;
}

export interface ListPublishedTeachersResult {
  items: TeacherPublishQueueItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 10;

export class ListPublishedTeachersUseCase {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly teacherRepo: TeacherRepositoryPort,
  ) {}

  async execute(input: ListPublishedTeachersInput): Promise<ListPublishedTeachersResult> {
    const isModerator = await this.userRepo.isModeratorOrAbove(input.moderatorUserId);
    if (!isModerator) {
      throw new UnauthorizedActionError("Only moderators can view published teachers");
    }

    const page = Math.max(0, input.page);
    const offset = page * PAGE_SIZE;

    const [teachers, total] = await Promise.all([
      this.teacherRepo.listPublishQueue("published", PAGE_SIZE, offset),
      this.teacherRepo.countByPublishStatus("published"),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return {
      items: teachers,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
    };
  }
}
