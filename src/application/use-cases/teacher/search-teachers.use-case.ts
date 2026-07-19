import type { TeacherRepositoryPort, TeacherSearchFilters } from "../../ports/repositories/teacher.repository.port";
import type { UserRepositoryPort } from "../../ports/repositories/user.repository.port";
import type { Teacher } from "../../../domain/entities/teacher.entity";
import { UnauthorizedActionError } from "../../../domain/errors/domain-errors";

export interface SearchTeachersInput extends TeacherSearchFilters {
  moderatorUserId: string;
}

/**
 * Stage 8 — moderator-only search (admin bot `/search`). Deliberately not a public
 * feature: a future public teacher directory would need its own use case scoped to
 * only-published teachers with different pagination/rate-limit concerns.
 */
export class SearchTeachersUseCase {
  constructor(
    private readonly teacherRepo: TeacherRepositoryPort,
    private readonly userRepo: UserRepositoryPort,
  ) {}

  async execute(input: SearchTeachersInput): Promise<Teacher[]> {
    const isModerator = await this.userRepo.isModeratorOrAbove(input.moderatorUserId);
    if (!isModerator) throw new UnauthorizedActionError("Only moderators can search teachers");

    return this.teacherRepo.search({
      nameOrSchoolQuery: input.nameOrSchoolQuery,
      regionId: input.regionId,
      subject: input.subject,
    });
  }
}
