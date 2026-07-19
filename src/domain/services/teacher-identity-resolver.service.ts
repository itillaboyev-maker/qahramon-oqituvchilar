import { fullNameSimilarity } from "../../shared/utils/normalize-name";
import { jaroWinklerSimilarity } from "../../shared/utils/string-similarity";
import { IDENTITY_RESOLUTION } from "../../shared/constants/identity-resolution.constants";

/**
 * Teacher Identity Resolution (business rule D) — pure domain logic, no DB or
 * framework dependency, fully unit-testable in isolation.
 *
 * Deliberately NEVER decides "same person" by name alone: confidence combines name
 * similarity with district, school, subject, and years-of-experience closeness,
 * each weighted (see IDENTITY_RESOLUTION.WEIGHTS). The output is a 0-100 confidence
 * score, not a boolean — callers decide what to do with it (auto-attach only above
 * a high threshold; log a candidate for moderator review in a middle band; ignore
 * below that). The moderator always has final say on any actual merge (Stage 5).
 */

export interface IdentityResolutionInput {
  normalizedName: string;
  districtId?: string | null;
  school?: string | null;
  subject?: string | null;
  yearsOfExperience?: number | null;
}

export interface IdentityCandidate {
  id: string;
  normalizedName: string;
  districtId: string | null;
  school: string | null;
  subject: string | null;
  yearsOfExperience: number | null;
}

export interface IdentityMatchResult {
  candidateId: string;
  confidence: number; // 0-100
  breakdown: {
    nameScore: number;
    districtScore: number;
    schoolScore: number;
    subjectScore: number;
    experienceScore: number;
  };
}

function scoreAttribute(a: string | null | undefined, b: string | null | undefined): number {
  // Missing data on either side is neutral — it should neither reward nor punish
  // the match, since "we don't know" isn't evidence of sameness or difference.
  if (!a || !b) return 0.5;
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (normA === normB) return 1;
  return jaroWinklerSimilarity(normA, normB);
}

function scoreExactAttribute(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0.5;
  return a === b ? 1 : 0;
}

function scoreExperience(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null || b == null) return 0.5;
  // Experience drifts upward year over year and is often self-reported/approximate —
  // treat anything within ~15 years apart as a soft signal rather than a hard mismatch.
  const diff = Math.abs(a - b);
  return Math.max(0, 1 - diff / 15);
}

export class TeacherIdentityResolver {
  scoreCandidate(input: IdentityResolutionInput, candidate: IdentityCandidate): IdentityMatchResult {
    const nameScore = fullNameSimilarity(input.normalizedName, candidate.normalizedName);
    const districtScore = scoreExactAttribute(input.districtId, candidate.districtId);
    const schoolScore = scoreAttribute(input.school, candidate.school);
    const subjectScore = scoreAttribute(input.subject, candidate.subject);
    const experienceScore = scoreExperience(input.yearsOfExperience, candidate.yearsOfExperience);

    const { WEIGHTS } = IDENTITY_RESOLUTION;
    const confidence =
      (nameScore * WEIGHTS.name +
        districtScore * WEIGHTS.district +
        schoolScore * WEIGHTS.school +
        subjectScore * WEIGHTS.subject +
        experienceScore * WEIGHTS.experience) *
      100;

    return {
      candidateId: candidate.id,
      confidence: Math.round(confidence * 100) / 100,
      breakdown: { nameScore, districtScore, schoolScore, subjectScore, experienceScore },
    };
  }

  /** Scores every candidate and returns them sorted by confidence, highest first. */
  resolveBest(
    input: IdentityResolutionInput,
    candidates: IdentityCandidate[],
  ): { best: IdentityMatchResult | null; all: IdentityMatchResult[] } {
    const all = candidates
      .map((c) => this.scoreCandidate(input, c))
      .sort((a, b) => b.confidence - a.confidence);

    return { best: all[0] ?? null, all };
  }
}
