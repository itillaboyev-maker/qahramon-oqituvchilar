# Database — MVP

Run against Supabase Postgres, in order:

```bash
psql "$DATABASE_URL" -f migrations/0000_init.sql
psql "$DATABASE_URL" -f migrations/0001_seed_regions.sql
```

(Or paste both files into the Supabase SQL editor.)

## Core tables

| Table | Purpose |
|---|---|
| `regions`, `districts` | Reference data, seeded once. i18n-ready (extra `name_*` columns), only `name_uz_latn` filled for MVP. |
| `users` | One row per Telegram user. `role` gates access to the admin bot. |
| `teachers` | One row per real teacher. Never inserted directly — always via `find-or-create-teacher.use-case.ts`. |
| `recommendations` | One row per submission (nomination or self). `status` drives the moderator queue. |
| `media` | Telegram `file_id` references for MVP; `storage_provider`/`r2_key` are the seam for a future R2 migration. Attaches **only** to `recommendation_id` (never `teacher_id`) — a teacher's full media set is derived by joining across all of its recommendations, so nothing is ever overwritten. |
| `bot_sessions` | Multi-step conversation state, since Cloudflare Workers are stateless per-request. |
| `audit_logs` | Every moderation action, for accountability. |
| `generated_content`, `duplicate_candidates` | Empty in MVP — reserved for the future AI layer. |

## Moderation state machine

```
recommendations.status:  NEW -> UNDER_REVIEW -> APPROVED / REJECTED
teachers.publish_status:  DRAFT -> REVIEW -> PUBLISHED -> ARCHIVED
```

Approving a recommendation nudges the teacher from `draft` to `review` — it does **not**
auto-publish. Promoting `review -> published` is a distinct editorial action, deliberately
not built into the MVP bot (add as an admin command when the first cohort of teachers is
ready to go public).

## Teacher aggregation & community signal (business rules E, B, G)

`GetTeacherAggregateUseCase` assembles everything about a teacher on read — all
recommendations, all media (joined through those recommendations), the community
count, and a timeline (recommendations grouped by year, per DECISIONS.md D012). Nothing
is stored separately, so there's no aggregate row that can drift out of sync.

**Community count** (`RecommendationRepositoryPort.countIndependentByTeacherId`) counts
every non-rejected recommendation for a teacher. It is surfaced to moderators in the
`/queue` view as "📊 Community signal" — **internal only**. It is never exposed to end
users and never used to rank or sort teachers publicly (DECISIONS.md D002).

Business rule D, implemented without AI/embeddings (deferred per decision #2 to a
future `pgvector` stage). Pipeline for every new submission:

1. **Normalize + transliterate** (`shared/utils/transliteration.ts`,
   `normalize-name.ts`) — Cyrillic input converts to Latin *before* comparison, so
   "Ҳакимов Отабек" and "Hakimov Otabek" compare correctly regardless of script.
2. **Prefilter** (`TeacherRepository.findCandidatesByNameSimilarity`) — pg_trgm
   `similarity()` pulls up to 8 loosely-similar candidates by name, cheaply, before any
   precise scoring happens.
3. **Score** (`TeacherIdentityResolver`, pure domain service) — combines order-invariant,
   initial-aware name similarity (Levenshtein + Jaro-Winkler) with district (exact),
   school (fuzzy), subject (fuzzy), and years-of-experience (closeness) into one 0-100
   confidence score. Weights and thresholds live in
   `shared/constants/identity-resolution.constants.ts`.
4. **Decide** (`FindOrCreateTeacherUseCase`):
   - confidence ≥ 88 → auto-attach to the existing teacher
   - confidence ≥ 55 → create a new teacher, but log a row in `duplicate_candidates`
     for a moderator to review (merge UI is Stage 5 — not built yet, so these just
     accumulate for now)
   - below 55 → create a new teacher, nothing logged

**Never merges on name alone** — the weights cap name at 45%, so even a perfect name
match with a contradicting district/school can't reach the auto-attach threshold alone.

**Known scaling tradeoff (documented, not fixed):** the prefilter query uses
`similarity(normalized_name, $1) > threshold` directly rather than pg_trgm's `%`
operator, because `%` depends on a session-level `set_limit()` GUC that isn't reliable
under Supabase's transaction-mode connection pooler (a query can land on a different
backend connection than the one that set the limit). This is correct and safe, but it
means the GIN trigram index isn't used for this filter — every query does a sequential
scan computing similarity per row. Fine at hundreds/low-thousands of teachers; revisit
(e.g. a dedicated non-pooled connection for this query, or `SET LOCAL` inside an
explicit transaction) before the archive grows past that.

**Known gap:** years-of-experience isn't collected by the current fast nomination flow,
so that attribute always scores neutral (0.5) for now — architecturally ready, just
unused until a flow step collects it.

## Merge workflow (business rule F, Stage 5)

`teachers.merged_into_teacher_id` is a self-referencing FK. When a moderator confirms
two profiles are the same person (`MergeTeachersUseCase`), the **older** profile (by
`created_at`) is kept as canonical; the newer one is marked `publish_status='archived'`
and pointed at the winner via `merged_into_teacher_id`. It is **never deleted** — every
field on it stays queryable forever. All of its recommendations are reassigned to the
winner via `RecommendationRepository.reassignTeacher` (bulk `UPDATE`, not copy+delete).
`FindOrCreateTeacherUseCase` follows this pointer automatically if a future submission
matches an already-merged (archived) profile, redirecting to the canonical winner.

## Rate limiting & validation (Stage 10)

`RecommendationRepository.countRecentBySubmitter` backs a simple Postgres-based rate
limit (`shared/constants/security.constants.ts`: 5 submissions per 60 minutes per user)
enforced in `SubmitNominationUseCase` before any writes happen. Text fields are capped
(4000 chars) and phone numbers get a loose format check — all deliberately without any
new Cloudflare binding (no KV, no Durable Object), consistent with the project's
no-new-infrastructure constraint.

## Audit logging (Stage 9)

`audit_logs` existed in the schema since the initial migration but was never written to
until Stage 9. `AuditLogRepository` now records every moderation action (`ModerateRecommendationUseCase`)
and every merge/dismiss decision (`MergeTeachersUseCase`), including before/after state.
Audit-write failures are logged but never block the moderator action itself.
