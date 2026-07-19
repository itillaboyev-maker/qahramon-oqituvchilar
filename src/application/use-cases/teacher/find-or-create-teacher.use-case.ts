import type { TeacherRepositoryPort } from "../../ports/repositories/teacher.repository.port";
import type { DuplicateCandidateRepositoryPort } from "../../ports/repositories/duplicate-candidate.repository.port";
import type { Teacher } from "../../../domain/entities/teacher.entity";
import { TeacherIdentityResolver } from "../../../domain/services/teacher-identity-resolver.service";
import { normalizeName } from "../../../shared/utils/normalize-name";
import { IDENTITY_RESOLUTION } from "../../../shared/constants/identity-resolution.constants";

export interface FindOrCreateTeacherInput {
  fullName: string;
  regionId?: string | null;
  districtId?: string | null;
  school?: string | null;
  subject?: string | null;
  position?: string | null;
  // Not collected by the fast nomination flow yet (kept optional) — Identity
  // Resolution degrades gracefully to a neutral score for this attribute until a
  // future flow step collects it. See Stage 3 report for why this wasn't added now.
  yearsOfExperience?: number | null;
}

/**
 * Core of the recommendation-first flow (product decision #2) AND Teacher Identity
 * Resolution (business rule D): the bot never asks "does this teacher already have
 * a profile?" — it always tries to find one first, using a multi-attribute confidence
 * score (name + district + school + subject + experience), and only creates a new
 * draft if nothing matches with high confidence.
 *
 * Three-way outcome, never a binary "duplicate or not":
 *   - confidence >= AUTO_ATTACH_THRESHOLD  -> attach to the existing teacher directly
 *   - confidence >= CANDIDATE_LOG_THRESHOLD -> create a new teacher, but log a
 *     duplicate candidate for a moderator to review/merge later (Stage 5)
 *   - below that -> create a new teacher, no candidate logged (not similar enough
 *     to be worth a moderator's time)
 * Never merges on name alone — see TeacherIdentityResolver for the scoring itself.
 */
export class FindOrCreateTeacherUseCase {
  private readonly resolver = new TeacherIdentityResolver();

  constructor(
    private readonly teacherRepo: TeacherRepositoryPort,
    private readonly duplicateCandidateRepo: DuplicateCandidateRepositoryPort,
  ) {}

  async execute(input: FindOrCreateTeacherInput): Promise<{ teacher: Teacher; wasCreated: boolean }> {
    const normalizedName = normalizeName(input.fullName);

    const candidates = await this.teacherRepo.findCandidatesByNameSimilarity({ normalizedName });

    if (candidates.length > 0) {
      const { best } = this.resolver.resolveBest(
        {
          normalizedName,
          districtId: input.districtId ?? null,
          school: input.school ?? null,
          subject: input.subject ?? null,
          yearsOfExperience: input.yearsOfExperience ?? null,
        },
        candidates.map((c) => ({
          id: c.id,
          normalizedName: c.normalizedName,
          districtId: c.districtId,
          school: c.school,
          subject: c.subject,
          yearsOfExperience: c.yearsOfExperience,
        })),
      );

      if (best && best.confidence >= IDENTITY_RESOLUTION.AUTO_ATTACH_THRESHOLD) {
        const matched = candidates.find((c) => c.id === best.candidateId)!;
        // Merge workflow safety (business rule F): if this candidate was already merged
        // into another profile, attach to the canonical winner instead of the archived
        // loser — otherwise new recommendations would keep landing on a dead-end profile.
        if (matched.mergedIntoTeacherId) {
          const canonical = await this.teacherRepo.findById(matched.mergedIntoTeacherId);
          if (canonical) return { teacher: canonical, wasCreated: false };
        }
        return { teacher: matched, wasCreated: false };
      }

      // Not confident enough to auto-attach — create a new profile, but if it's
      // similar enough to be worth a look, flag it for the moderator merge queue
      // instead of silently letting a possible duplicate slip by unnoticed.
      const created = await this.teacherRepo.create({
        fullName: input.fullName.trim(),
        normalizedName,
        regionId: input.regionId ?? null,
        districtId: input.districtId ?? null,
        school: input.school ?? null,
        subject: input.subject ?? null,
        position: input.position ?? null,
      });

      if (best && best.confidence >= IDENTITY_RESOLUTION.CANDIDATE_LOG_THRESHOLD) {
        await this.duplicateCandidateRepo.logIfNew(created.id, best.candidateId, best.confidence);
      }

      return { teacher: created, wasCreated: true };
    }

    const created = await this.teacherRepo.create({
      fullName: input.fullName.trim(),
      normalizedName,
      regionId: input.regionId ?? null,
      districtId: input.districtId ?? null,
      school: input.school ?? null,
      subject: input.subject ?? null,
      position: input.position ?? null,
    });

    return { teacher: created, wasCreated: true };
  }
}
