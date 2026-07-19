# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). This project isn't versioned/released
yet (pre-deployment), so entries are grouped by build stage instead of version number.

## [Unreleased]

### Stage 10 — Production hardening
- Added: Postgres-backed rate limiting (`countRecentBySubmitter`, 5 submissions/60min
  per user), enforced in `SubmitNominationUseCase` before any writes.
- Added: text-length validation (recommendation/achievements text caps) and loose
  phone-format validation, same use case.
- Added: `RateLimitExceededError` domain error; both bot flows now catch submission
  errors and show a friendly message instead of falling through to the global handler.
- Added: `docs/PRODUCTION_CHECKLIST.md`.
- Verified: `tsc --noEmit` and `wrangler deploy --dry-run` pass (561.55 KiB).

### Stage 9 — Observability, logging, error handling
- Added: `infrastructure/logging/logger.ts` — structured JSON logging via `console.*`
  (no new external service; visible via `wrangler tail`).
- Added: `AuditLogRepositoryPort` + implementation — `audit_logs` existed in the schema
  since the first migration but was never written to until now.
- Changed: `ModerateRecommendationUseCase` and `MergeTeachersUseCase` now record every
  action (approve/reject/review/merge/dismiss) with before/after state.
- Added: `bot.catch()` global error handlers on both bots; top-level try/catch in
  `index.ts` so an unhandled error never crashes the Worker silently.
- Verified: `tsc --noEmit` and `wrangler deploy --dry-run` pass (559.50 KiB).

### Stage 8 — Search & filtering
- Added: `TeacherRepositoryPort.search` (name/school `ilike`, region, subject filters).
- Added: `SearchTeachersUseCase`, moderator-only (`isModeratorOrAbove` check).
- Added: admin bot `/search <query>` command.
- Decision: scoped to admin bot only — public search remains a future web-portal item
  (DECISIONS.md D018).
- Verified: `tsc --noEmit` and `wrangler deploy --dry-run` pass.

### Stage 7 — Media pipeline hardening
- Added: `shared/constants/media.constants.ts` — max 10 media items per recommendation,
  20MB video size cap (Telegram's own `getFile` limit).
- Changed: both nomination and self-submission `handleMedia` now enforce the limit,
  reject oversized videos, and skip exact re-uploads (`telegramFileUniqueId` dedup).
- Decision: R2/virus-scan/EXIF-strip remain deferred — this stage hardens the existing
  Telegram `file_id` pipeline only, per the "no new infrastructure" constraint.
- Verified: `tsc --noEmit` and `wrangler deploy --dry-run` pass.

### Stage 6 — Approval workflow + Self-submission
- Changed: `NominationDto`/`SubmitNominationUseCase` accept an optional
  `submissionType` (defaults to `"nominated"`) instead of hardcoding it — lets
  self-submission reuse the same recommendation-creation logic without duplicating it.
- Added: `self-submission-flow.handler.ts` — shorter flow (no relationship question,
  always `"self"`), wired into the public bot's `who:self` callback (previously a stub).
- Noted: approval workflow itself needed no new code — it's already status-based and
  handles both submission types generically.
- Decision: self-submission was dropped from a later stage renumbering but preserved
  here since it's a hard requirement from business rule A (DECISIONS.md D016).
- Verified: `tsc --noEmit` and `wrangler deploy --dry-run` pass.

### Stage 5 — Moderator review queue + Merge workflow
- Added: `teachers.merged_into_teacher_id` (self-referencing FK) — losing profile in a
  merge is archived and pointed at the winner, never deleted.
- Added: `TeacherRepositoryPort.markMerged`; `DuplicateCandidateRepositoryPort.findById`
  / `updateStatus`; `RecommendationRepositoryPort.reassignTeacher`.
- Added: `MergeTeachersUseCase` — moderator-confirmed only, older profile wins by
  `created_at`, all recommendations reassigned to the winner.
- Changed: `FindOrCreateTeacherUseCase` now redirects auto-attach to the canonical
  winner if the matched candidate was already merged.
- Added: admin bot `/merge_queue` command + confirm/dismiss buttons.
- Decision: merge workflow was dropped from a later stage renumbering but preserved
  here since `duplicate_candidates` rows were already being logged and needed a
  moderator-facing consumer (DECISIONS.md D016).
- Verified: `tsc --noEmit` and `wrangler deploy --dry-run` pass.

### Stage 4 — Teacher aggregation + community recommendation counter
- Added: `GetTeacherAggregateUseCase` — assembles all recommendations + media (joined
  through recommendations) + a computed timeline (grouped by year, per DECISIONS.md
  D012) for one teacher, read-only, nothing stored separately.
- Added: `RecommendationRepositoryPort.listByTeacherId` / `countIndependentByTeacherId`.
- Changed: admin bot `/queue` now shows "📊 Community signal: N ta mustaqil tavsiya" —
  internal to the moderator only, never public (DECISIONS.md D002).
- Verified: `tsc --noEmit` and `wrangler deploy --dry-run` pass (537.81 KiB).

### Stage 3 — Teacher Identity Resolution MVP
- Added: Uzbek Cyrillic→Latin transliteration (`shared/utils/transliteration.ts`).
- Added: Pure Levenshtein + Jaro-Winkler similarity primitives (`shared/utils/string-similarity.ts`).
- Changed: `normalize-name.ts` now transliterates before normalizing; added `tokenizeName`
  and order-invariant, initial-aware `fullNameSimilarity`.
- Added: `TeacherIdentityResolver` domain service — weighted multi-attribute confidence
  scoring (name/district/school/subject/experience).
- Added: `shared/constants/identity-resolution.constants.ts` — thresholds and weights.
- Changed: `TeacherRepositoryPort`/`TeacherRepository` — replaced `findPotentialMatch`
  (exact match only) with `findCandidatesByNameSimilarity` (pg_trgm-backed prefilter).
- Added: `DuplicateCandidateRepositoryPort` + Drizzle implementation (schema existed
  since the original migration but was completely unused until now).
- Changed: `FindOrCreateTeacherUseCase` — three-tier outcome (auto-attach / log
  candidate / plain create) instead of binary exact-match-or-create.
- Updated: `docs/DATABASE.md` with the full Identity Resolution pipeline description
  and two documented tradeoffs (trigram index not used by the prefilter query;
  years-of-experience not yet collected by the bot).
- Verified: `tsc --noEmit` and `wrangler deploy --dry-run` both pass (534.92 KiB bundle).

### Stage 2 — Media via recommendation only
- Changed: `media` schema — removed `teacher_id`, made `recommendation_id NOT NULL`
  (business rule H: media never attaches directly to a teacher).
- Added: `Media` domain entity, `MediaRepositoryPort`, `MediaRepository` (none of these
  existed before — the port/adapter was planned in the original architecture doc but
  never implemented).
- Added: media (photo/video) collection step in the nomination bot flow, optional,
  supports multiple items, "Tayyor" / "O'tkazib yuborish" buttons.
- Changed: `SubmitNominationUseCase` now attaches collected media to the recommendation
  after it's created.
- Changed: `NominationDto` — added `media?: NominationMediaItem[]`.
- Updated: `migrations/0000_init.sql` and `docs/DATABASE.md` to match (migration edited
  directly since the project was not yet deployed anywhere).
- Verified: `tsc --noEmit` and `wrangler deploy --dry-run` both pass.

### Stage 1 — "Kim haqida?" flow
- Changed: main menu — collapsed two separate submit buttons into one entry point
  ("📝 Ustoz haqida ma'lumot yuborish").
- Added: mandatory "Kim haqida ma'lumot yuboryapsiz?" question before any submission,
  "🌟 Menga katta ta'sir qilgan ustoz haqida" listed first/emphasized, "⚪ O'zim haqimda"
  second (business rule A — default emphasis on recommending others).
- Verified: `tsc --noEmit` and `wrangler deploy --dry-run` both pass.

### Stage 0 — Build bug fix
- Fixed: 24 files used `@/` tsconfig path aliases that Wrangler's esbuild bundler does
  not resolve — this would have broken `wrangler deploy` in production. Converted all
  imports to relative paths via a one-off codemod script (not manual editing, to avoid
  transcription errors).
- Changed: removed unused `baseUrl`/`paths` from `tsconfig.json`.
- Removed: stray empty directory left over from an earlier failed shell command.
- Verified: this was the first time `wrangler deploy --dry-run` was actually run against
  this codebase — confirmed the bundle builds (519.16 KiB) with zero import errors.

### Earlier (pre-stage-plan) — Initial MVP build
- Built full Clean Architecture MVP: database schema + migration, domain entities,
  application use cases/ports, Drizzle repository implementations, public bot
  (subscription gate, main menu, fast nomination flow), admin bot (role-gated,
  moderation queue with NEW → UNDER_REVIEW → APPROVED/REJECTED).
- Declined a proposal to merge in a separately-authored ("Gemini") enterprise codebase
  wholesale; this repository remained the single master branch (see `DECISIONS.md` D006).
- Prepared `docs/DEPLOYMENT.md` (Cloudflare/Supabase/Telegram setup, migrations,
  webhooks, env vars, end-to-end test checklist) — not yet executed, deployment paused
  pending business-logic completion.
