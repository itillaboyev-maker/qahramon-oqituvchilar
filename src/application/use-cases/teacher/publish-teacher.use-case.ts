import type { TeacherRepositoryPort } from "../../ports/repositories/teacher.repository.port";
import type { UserRepositoryPort } from "../../ports/repositories/user.repository.port";
import type { AuditLogRepositoryPort } from "../../ports/repositories/audit-log.repository.port";
import type { Teacher } from "../../../domain/entities/teacher.entity";
import { UnauthorizedActionError, ValidationError, NotFoundError } from "../../../domain/errors/domain-errors";

export interface PublishTeacherInput {
  teacherId: string;
  moderatorUserId: string;
}

/**
 * Editorial publish step. Separate from ModerateRecommendationUseCase's approve
 * action (Product decision #4: approve only bumps draft -> review). This is the
 * review -> published hop, triggered explicitly by a moderator/editor from the
 * publish queue — never automatically.
 */
export class PublishTeacherUseCase {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly teacherRepo: TeacherRepositoryPort,
    private readonly auditLogRepo: AuditLogRepositoryPort,
  ) {}

  async execute(input: PublishTeacherInput): Promise<Teacher> {
    const isModerator = await this.userRepo.isModeratorOrAbove(input.moderatorUserId);
    if (!isModerator) {
      throw new UnauthorizedActionError("Only moderators/editors can publish a teacher profile");
    }

    const teacher = await this.teacherRepo.findById(input.teacherId);
    if (!teacher) {
      throw new NotFoundError("Teacher", input.teacherId);
    }

    if (teacher.publishStatus === "published") {
      return teacher; // idempotent no-op
    }

    if (teacher.publishStatus !== "ready_for_publish") {
      throw new ValidationError(
        `Cannot publish teacher from status "${teacher.publishStatus}" — must be "ready_for_publish"`,
      );
    }

    const updated = await this.teacherRepo.updatePublishStatus(teacher.id, "published");

    await this.auditLogRepo.record({
      actorUserId: input.moderatorUserId,
      action: "teacher.published",
      entityType: "teacher",
      entityId: updated.id,
      beforeState: { publishStatus: "ready_for_publish" },
      afterState: { publishStatus: "published" },
    });

    return updated;
  }
}