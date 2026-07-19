import type { TeacherRepositoryPort } from "../../ports/repositories/teacher.repository.port";
import type { RecommendationRepositoryPort } from "../../ports/repositories/recommendation.repository.port";
import type { DuplicateCandidateRepositoryPort } from "../../ports/repositories/duplicate-candidate.repository.port";
import type { UserRepositoryPort } from "../../ports/repositories/user.repository.port";
import type { AuditLogRepositoryPort } from "../../ports/repositories/audit-log.repository.port";
import { UnauthorizedActionError, ValidationError } from "../../../domain/errors/domain-errors";

export type MergeDecision = "confirm" | "dismiss";

export interface MergeTeachersInput {
  duplicateCandidateId: string;
  moderatorUserId: string;
  decision: MergeDecision;
}

/**
 * Moderator merge workflow (business rule F). The moderator is always the final
 * decision-maker — this use case never runs automatically, only from an explicit
 * admin bot action against a `duplicate_candidates` row logged by
 * FindOrCreateTeacherUseCase (Stage 3).
 *
 * On confirm: the OLDER of the two teacher profiles is kept as the canonical winner
 * (it's had more time to accumulate history); the newer one is marked merged via
 * TeacherRepositoryPort.markMerged (archived + pointer, never deleted), and every one
 * of its recommendations (with their media, transitively) is reassigned to the winner.
 * Zero rows are ever deleted — this satisfies "hech qanday ma'lumot o'chirilmasin."
 */
export class MergeTeachersUseCase {
  constructor(
    private readonly duplicateCandidateRepo: DuplicateCandidateRepositoryPort,
    private readonly teacherRepo: TeacherRepositoryPort,
    private readonly recommendationRepo: RecommendationRepositoryPort,
    private readonly userRepo: UserRepositoryPort,
    private readonly auditLogRepo: AuditLogRepositoryPort,
  ) {}

  async execute(input: MergeTeachersInput): Promise<{ winnerId: string; loserId: string; reassignedCount: number } | { dismissed: true }> {
    const isModerator = await this.userRepo.isModeratorOrAbove(input.moderatorUserId);
    if (!isModerator) {
      throw new UnauthorizedActionError("Only moderators can review merge candidates");
    }

    const candidate = await this.duplicateCandidateRepo.findById(input.duplicateCandidateId);
    if (!candidate) throw new ValidationError("Duplicate candidate not found");
    if (candidate.status !== "pending") {
      throw new ValidationError(`Duplicate candidate already reviewed (status: ${candidate.status})`);
    }

    if (input.decision === "dismiss") {
      await this.duplicateCandidateRepo.updateStatus(candidate.id, "not_duplicate", input.moderatorUserId);
      await this.auditLogRepo.record({
        actorUserId: input.moderatorUserId,
        action: "duplicate_candidate.dismissed",
        entityType: "duplicate_candidate",
        entityId: candidate.id,
      });
      return { dismissed: true };
    }

    const [teacherA, teacherB] = await Promise.all([
      this.teacherRepo.findById(candidate.teacherIdA),
      this.teacherRepo.findById(candidate.teacherIdB),
    ]);
    if (!teacherA || !teacherB) throw new ValidationError("One or both teachers no longer exist");

    const [winner, loser] = teacherA.createdAt <= teacherB.createdAt ? [teacherA, teacherB] : [teacherB, teacherA];

    const reassignedCount = await this.recommendationRepo.reassignTeacher(loser.id, winner.id);
    await this.teacherRepo.markMerged(loser.id, winner.id);
    await this.duplicateCandidateRepo.updateStatus(candidate.id, "confirmed_duplicate", input.moderatorUserId);
    await this.auditLogRepo.record({
      actorUserId: input.moderatorUserId,
      action: "teacher.merged",
      entityType: "teacher",
      entityId: loser.id,
      beforeState: { mergedIntoTeacherId: null },
      afterState: { mergedIntoTeacherId: winner.id, reassignedRecommendations: reassignedCount },
    });

    return { winnerId: winner.id, loserId: loser.id, reassignedCount };
  }
}
