/**
 * Media pipeline limits (Stage 7 hardening). MVP still stores Telegram file_id
 * references only (no R2 yet — see DECISIONS.md/ROADMAP.md), but these guards are
 * needed regardless of storage backend: they protect against abuse (unbounded upload
 * spam) and against a real Telegram Bot API constraint (files over 20MB cannot be
 * downloaded via getFile, which any future R2 migration will depend on).
 */
export const MEDIA_LIMITS = {
  MAX_ITEMS_PER_RECOMMENDATION: 10,
  MAX_VIDEO_SIZE_BYTES: 20 * 1024 * 1024, // Telegram Bot API getFile hard limit
} as const;
