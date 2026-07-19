/**
 * Tuning knobs for Teacher Identity Resolution MVP (business rule D). These are
 * starting values based on the name-similarity test above (true variants scored
 * 0.91-1.0; different people scored 0.55-0.63 on name alone) — expect to tune these
 * with real submission data once the bot is live. Not a feature flag system (that's
 * explicitly deferred) — just exported constants, one place to adjust.
 */
export const IDENTITY_RESOLUTION = {
  // Confidence (0-100) at or above which a new submission auto-attaches to an
  // existing teacher instead of creating a new profile. Deliberately high — this
  // is the "hech qachon faqat ism bo'yicha merge qilinmasin" safety margin.
  AUTO_ATTACH_THRESHOLD: 88,

  // Confidence at or above which — but below AUTO_ATTACH_THRESHOLD — a duplicate
  // candidate is logged for a moderator to review in the merge panel (Stage 5),
  // while still safely creating a separate teacher profile for now.
  CANDIDATE_LOG_THRESHOLD: 55,

  // How many candidates to pull from the DB (via pg_trgm prefilter) before scoring
  // them precisely in application code. Keeps the query cheap regardless of table size.
  CANDIDATE_PREFILTER_LIMIT: 8,
  CANDIDATE_PREFILTER_MIN_TRIGRAM_SIMILARITY: 0.15,

  // Weights must sum to 1. Name carries the most weight but is capped well below 1.0
  // on its own so a strong name match with contradicting attributes can't reach
  // AUTO_ATTACH_THRESHOLD alone.
  WEIGHTS: {
    name: 0.45,
    district: 0.2,
    school: 0.2,
    subject: 0.1,
    experience: 0.05,
  },
} as const;
