export interface DuplicateCandidate {
  id: string;
  teacherIdA: string;
  teacherIdB: string;
  similarityScore: number;
  status: "pending" | "confirmed_duplicate" | "not_duplicate";
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface DuplicateCandidateRepositoryPort {
  /**
   * Logs a possible-duplicate pair for moderator review (business rule D/F). Idempotent
   * in spirit: skips inserting if a pending pair already links these two teacher ids
   * (in either order) so repeated similar submissions don't spam the merge queue.
   */
  logIfNew(teacherIdA: string, teacherIdB: string, similarityScore: number): Promise<void>;
  listPending(limit?: number): Promise<DuplicateCandidate[]>;
  findById(id: string): Promise<DuplicateCandidate | null>;
  updateStatus(
    id: string,
    status: "confirmed_duplicate" | "not_duplicate",
    reviewedBy: string,
  ): Promise<DuplicateCandidate>;
}
