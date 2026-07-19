# Project State — Single Source of Truth

**Last updated:** Stages 0–10 complete (see `/CHANGELOG.md` for full history).

**Read this file, `DECISIONS.md`, and `CHANGELOG.md` before writing any code.**

---

## Where we are right now

- **Deployment status: NOT deployed.** Still deliberately paused (see `DECISIONS.md`
  D006). `docs/DEPLOYMENT.md` has full deploy steps; `docs/PRODUCTION_CHECKLIST.md` has
  the pre-launch checklist. Both are ready for when deployment resumes.
- **Build status: verified working.** `npx tsc --noEmit` and
  `npx wrangler deploy --dry-run` both pass as of the end of Stage 10 (561.55 KiB
  bundle). Re-verify both after every future change — mandatory, not optional (D013).
- **Stage plan — all complete:**

| Stage | Content | Status |
|---|---|---|
| 0 | Fix `@/` import-alias build bug | ✅ Done |
| 1 | "Kim haqida?" flow, default emphasis on "boshqa ustoz" | ✅ Done |
| 2 | Media attaches via recommendation only + bot photo/video step | ✅ Done |
| 3 | Teacher Identity Resolution MVP | ✅ Done |
| 4 | Teacher aggregation view + community recommendation count | ✅ Done |
| 5 | Moderator review queue + Merge workflow (folded in, D016) | ✅ Done |
| 6 | Approval workflow hardening + Self-submission flow (folded in, D016) | ✅ Done |
| 7 | Media pipeline hardening (limits, dedup, size validation) | ✅ Done |
| 8 | Search & filtering (moderator-only, admin bot) | ✅ Done |
| 9 | Observability: structured logging, global error handling, audit logging | ✅ Done |
| 10 | Production hardening: rate limiting, input validation | ✅ Done |

**Next milestone:** resume deployment (`docs/DEPLOYMENT.md`), work through
`docs/PRODUCTION_CHECKLIST.md`, then run the end-to-end test checklist against a live
environment before inviting real users.

## What's implemented and working

- **Database:** Full schema + migration (`migrations/0000_init.sql`, seeded regions),
  including `merged_into_teacher_id` (lossless merge tracking) and full `audit_logs`
  usage. See `docs/DATABASE.md`.
- **Public bot:** subscription gate → "Kim haqida?" (default: boshqa ustoz) → fast
  nomination flow OR self-submission flow, both sharing `SubmitNominationUseCase`.
  Media (photo/video) collection with limits/dedup/size checks. Rate-limited and
  input-validated.
- **Admin bot:** `/queue` (moderation, shows community count), `/merge_queue`
  (Identity-Resolution-flagged duplicate review), `/search` (moderator-only teacher
  lookup). All actions RBAC-gated and audit-logged.
- **Teacher Identity Resolution:** transliteration + fuzzy name matching + weighted
  multi-attribute scoring → auto-attach / log-candidate / plain-create three-way
  decision. Never merges on name alone.
- **Merge workflow:** moderator-confirmed only; older profile wins; loser archived
  (never deleted), all recommendations reassigned.
- **Observability:** structured JSON logging, global error handlers on both bots and
  the Worker entrypoint, full audit trail for moderation/merge actions.

## What's deliberately NOT built (see ROADMAP.md for the full list)

AI embeddings/pgvector, AI moderation, AI biography generation, R2 storage + virus
scanning + EXIF stripping, public web portal/API/search, Community/Trust/Hero
scoring (explicitly not planned — would conflict with D002), automated test suite.

## Known technical debt

- Identity Resolution's candidate prefilter does a sequential scan (not index-backed) —
  see DATABASE.md for why, and the scale at which to revisit.
- `years_of_experience` not collected by either bot flow yet.
- No automated tests exist. `TeacherIdentityResolver`/`fullNameSimilarity` are pure
  functions and would be the highest-value first tests.
- Wrangler on v3.x; v4.x available, not upgraded (deliberate, avoid unrelated risk).

## Environment / secrets

Not yet provisioned (deployment paused). Full list in `docs/DEPLOYMENT.md`.
