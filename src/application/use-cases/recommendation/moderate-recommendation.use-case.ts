import type {
  RecommendationRepositoryPort,
} from "../../ports/repositories/recommendation.repository.port";
import type { UserRepositoryPort } from "../../ports/repositories/user.repository.port";
import type { TeacherRepositoryPort } from "../../ports/repositories/teacher.repository.port";
import type { AuditLogRepositoryPort } from "../../ports/repositories/audit-log.repository.port";
import type { Recommendation } from "../../../domain/entities/recommendation.entity";
import { UnauthorizedActionError, ValidationError } from "../../../domain/errors/domain-errors";

export type ModerationAction = "start_review" | "approve" | "reject";

export interface ModerateRecommendationInput {
  recommendationId: string;
  moderatorUserId: string;
  action: ModerationAction;
  notes?: string;
}

/**
 * Product decision #4: the explicit queue workflow.
 *   NEW --start_review--> UNDER_REVIEW --approve--> APPROVED
 *                                       --reject--> REJECTED
 * Approving a recommendation does NOT automatically publish the teacher profile —
 * that stays a separate editorial decision (teacher.publishStatus), matching
 * "Qahramonni jamiyat tanlaydi, ekspertiza tasdiqlaydi": one recommendation being
 * approved bumps the teacher from draft -> review, signalling "ready for an editor look",
 * never straight to published.
 */
export class ModerateRecommendationUseCase {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly recommendationRepo: RecommendationRepositoryPort,
    private readonly teacherRepo: TeacherRepositoryPort,
    private readonly auditLogRepo: AuditLogRepositoryPort,
  ) {}

  async execute(input: ModerateRecommendationInput): Promise<Recommendation> {
    const isModerator = await this.userRepo.isModeratorOrAbove(input.moderatorUserId);
    if (!isModerator) {
      throw new UnauthorizedActionError("Only moderators can review recommendations");
    }

    const current = await this.recommendationRepo.findById(input.recommendationId);
    if (!current) {
      throw new ValidationError("Recommendation not found");
    }

    const nextStatus = this.resolveNextStatus(current.status, input.action);
console.log("CURRENT STATUS:", current.status);
console.log("ACTION:", input.action);
console.log("NEXT STATUS:", nextStatus);
    const updated = await this.recommendationRepo.updateStatus(
  input.recommendationId,
  nextStatus,
  input.moderatorUserId,
  input.notes ?? null,
);

console.log("UPDATED STATUS:", updated.status);

    await this.auditLogRepo.record({
      actorUserId: input.moderatorUserId,
      action: `recommendation.${input.action}`,
      entityType: "recommendation",
      entityId: updated.id,
      beforeState: { status: current.status },
      afterState: { status: updated.status },
    });

    if (nextStatus === "approved") {
      const teacher = await this.teacherRepo.findById(updated.teacherId);
      if (teacher && teacher.publishStatus === "draft") {
        await this.teacherRepo.updatePublishStatus(teacher.id, "review");
        await this.auditLogRepo.record({
          actorUserId: input.moderatorUserId,
          action: "teacher.publish_status_advanced",
          entityType: "teacher",
          entityId: teacher.id,
          beforeState: { publishStatus: "draft" },
          afterState: { publishStatus: "review" },
        });
      }
    }

    return updated;
  }

  private resolveNextStatus(
    current: Recommendation["status"],
    action: ModerationAction,
  ): Recommendation["status"] {
    if (action === "start_review") {
      if (current !== "new") {
        throw new ValidationError(`Cannot start review from status "${current}"`);
      }
      return "under_review";
    }
    if (action === "approve") {
      if (current !== "under_review" && current !== "new") {
        throw new ValidationError(`Cannot approve from status "${current}"`);
      }
      return "approved";
    }
    if (action === "reject") {
      if (current !== "under_review" && current !== "new") {
        throw new ValidationError(`Cannot reject from status "${current}"`);
      }
      return "rejected";
    }
    throw new ValidationError(`Unknown moderation action: ${action}`);
  }
}
