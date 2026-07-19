/**
 * Stage 10 production hardening. Postgres-backed rate limiting (no new Cloudflare
 * bindings — consistent with the project's "no new infrastructure" constraint) plus
 * text-length caps to bound storage/abuse. Tune with real usage data once live.
 */
export const RATE_LIMIT = {
  MAX_SUBMISSIONS_PER_WINDOW: 5,
  WINDOW_MINUTES: 60,
} as const;

export const TEXT_LIMITS = {
  RECOMMENDATION_TEXT_MAX: 4000,
  ACHIEVEMENTS_TEXT_MAX: 4000,
  PHONE_MIN: 7,
  PHONE_MAX: 20,
} as const;
