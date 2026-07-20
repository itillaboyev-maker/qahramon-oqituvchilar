# Architecture & Product Decisions Log

This file mirrors `docs/DECISIONS.md` to preserve the requested docs/decisions structure.
Keep both copies synchronized if either one is updated.

Append-only. Never delete or silently alter a past decision — if a decision changes,
add a new entry that supersedes it and say so explicitly. Any AI (Claude, ChatGPT,
Gemini) picking up this project reads this file before writing code.

Format: `ID | Decision | Rationale | Status`

---

### D001 — Core stack
**Decision:** Cloudflare Workers (TypeScript) + grammY (Telegram) + Supabase Postgres +
Drizzle ORM. Clean Architecture (domain / application / infrastructure layers).
**Rationale:** Serverless, cheap at low scale, scales to millions without a rewrite.
Clean Architecture keeps business logic independent of Telegram/Postgres specifics.
**Status:** Active.

### D002 — No public voting, ranking, or popularity mechanics
**Decision:** The platform never exposes vote counts, likes, or rankings to the public.
Recommendation counts are an **internal moderator signal only**.
**Rationale:** Core product philosophy — *"Qahramonni jamiyat tanlaydi, ekspertiza
tasdiqlaydi."* This is a recognition archive, not a competition.
**Status:** Active.

### D003 — Two separate Telegram bots
**Decision:** Public bot (recommendations) and Admin bot (moderation) use different
tokens, different webhook paths, different roles required.
**Rationale:** Security isolation — a compromised public bot token can never expose
moderation actions.
**Status:** Active.

### D004 — Bot conversation state lives in Postgres, not Durable Objects
**Decision:** `bot_sessions` table, one row per active conversation.
**Rationale:** Cloudflare Workers are stateless per-request. Durable Objects would work
too but add operational complexity not justified at MVP scale. Swappable later behind
`SessionStorePort`.
**Status:** Active.

### D005 — i18n structure now, translations later
**Decision:** Four locale JSON files exist (`uz-latn`, `uz-cyrl`, `ru`, `en`); only
`uz-latn` is populated for MVP.
**Rationale:** Adding a language later should mean "translate strings," not "restructure
the bot."
**Status:** Active.

### D006 — Gemini "enterprise merge" proposal declined; MVP-first scope
**Decision:** A separate proposal to merge in a large Gemini-authored codebase (Cloudflare
Queues, Terraform, CI/CD, OpenAPI, Feature Flags, Distributed Lock, Hybrid Cache,
Community/Trust/Hero scoring, etc.) was **not accepted**. This repository (built by
Claude in this conversation) is the single master branch. No competing codebase has been
merged in.
**Rationale:** Scope discipline — MVP must ship before enterprise-scale infrastructure
is justified. Several of the proposed modules (Hero Discovery ranking, Community/Trust
Score as ranking inputs) also directly conflicted with D002 and needed explicit
re-confirmation, not a silent adoption.
**Status:** Active. Revisit only with an explicit, scoped request.

### D007 — Recommendation-first flow (never manual teacher creation)
**Decision:** There is no bot flow for "create a teacher profile" directly. Every
submission goes through `FindOrCreateTeacherUseCase`, which either attaches to an
existing teacher or creates exactly one new draft.
**Rationale:** Business rule C — one profile per teacher, no matter how many people
recommend them.
**Status:** Active.

### D008 — Consent tracked as columns, not a separate table
**Decision:** `recommendations.consent_given` + `consent_given_at`, instead of a
dedicated `consents` table with per-field granularity.
**Rationale:** MVP simplification explicitly requested — same guarantee (no publishing
without consent), less schema/query overhead.
**Status:** Active. Revisit if per-field consent (e.g. separate consent for photo vs.
text publication) becomes a real requirement.

### D009 — Media attaches only to a recommendation, never to a teacher directly
**Decision:** `media.recommendation_id` is `NOT NULL`; there is no `media.teacher_id`.
**Rationale:** Business rule H. A teacher's full media set is the union of media across
its recommendations — this makes "nothing is ever deleted or overwritten" true by
construction, since there's no teacher-level media row to replace.
**Status:** Active.

### D010 — Teacher Identity Resolution: deterministic MVP, embeddings deferred
**Decision:** Identity Resolution v1 = transliteration (Cyrillic→Latin) + tokenized,
order-invariant name similarity (Levenshtein + Jaro-Winkler) + weighted multi-attribute
scoring (district/school/subject/experience). No AI embeddings, no `pgvector` yet.
**Rationale:** Explicit decision to avoid new infrastructure (`pgvector` extension,
external embedding calls) until the deterministic approach is proven insufficient.
Validated against the exact example name set requested — true variants scored
0.91–1.0, a genuinely different name scored 0.55–0.63 on name-only similarity (which is
also why name alone is never sufficient — see D011a).
**Status:** Active.

### D010a — Never merge/attach on name similarity alone
**Decision:** Name carries at most 45% of the confidence score. District/school/subject/
experience make up the rest.
**Rationale:** Business rule D, explicit requirement. Empirically justified — see D010.
**Status:** Active, hard constraint.

### D011 — Three-tier resolution outcome, with explicit thresholds
**Decision:** confidence ≥ 88 → auto-attach; 55–87 → create new teacher + log a
`duplicate_candidates` row for moderator review; < 55 → create new teacher, nothing
logged.
**Rationale:** A binary duplicate/not-duplicate decision is unsafe — the middle band
exists so ambiguous cases reach a human (Stage 5 merge panel) instead of silently
merging or silently creating an unflagged duplicate.
**Status:** Active. Thresholds are starting values (`shared/constants/identity-resolution.constants.ts`),
expected to be tuned against real submission data.

### D012 — Timeline: computed view, not a stored table
**Decision:** No `timeline_events` table. A teacher's timeline is `recommendations`
ordered/grouped by `created_at`.
**Rationale:** Recommendations are already append-only, so a computed view gives the
same "nothing overwritten" guarantee with zero new schema. Revisit only if editorial
curation of timeline entries independent of recommendations is required.
**Status:** Active (Stage 4 implements the read-side use case).

### D013 — Path aliases removed; relative imports only
**Decision:** `@/*` tsconfig path aliases were removed; all imports are relative.
**Rationale:** Wrangler's esbuild-based bundler does not resolve tsconfig `paths` —
this was a real, verified compile/deploy blocker (confirmed via `wrangler deploy
--dry-run` before and after the fix).
**Status:** Active. Do not reintroduce path aliases without also solving bundler
resolution (e.g. a custom esbuild alias plugin) and re-verifying with a real dry-run.

### D014 — "Kim haqida?" is a mandatory first question, not a menu item
**Decision:** Any submission flow starts with "Kim haqida ma'lumot yuboryapsiz?" —
"boshqa ustoz" listed first and visually emphasized (🌟 vs ⚪), "o'zim haqimda" second.
**Rationale:** Business rule A / product priority — the platform's primary purpose is
recommending others; self-submission is explicitly secondary.
**Status:** Active for the nomination path; self-submission flow itself is Stage 6 (not
yet built).

### D015 — This documentation protocol itself
**Decision:** `/docs/PROJECT_STATE.md`, `/docs/DECISIONS.md`, `/CHANGELOG.md`,
`/docs/ROADMAP.md`, `/docs/API.md`, `/docs/ARCHITECTURE.md`, `/docs/DATABASE.md` are the
single source of truth for project state across any AI tool working on this repo.
**Rationale:** Multiple AI tools (Claude, ChatGPT, Gemini) may work on this project
without shared memory between sessions/tools — these files must fully substitute for
that shared memory.
**Status:** Active, mandatory. Every change updates `PROJECT_STATE.md` and
`CHANGELOG.md` at minimum.

### D016 — Stage 5-10 stage renumbering reconciled, not silently overwritten
**Decision:** A later instruction renumbered stages (5=Review Queue, 6=Approval
Workflow, 7=Media Pipeline, 8=Search, 9=Observability, 10=Hardening), which collided
with the previously-confirmed plan (5=Merge Workflow, 6=Self-submission, 7=Production
checklist). Both were preserved: Merge Workflow was folded into the new Stage 5,
Self-submission into the new Stage 6, rather than dropped.
**Rationale:** Business rules A (self-submission must exist) and F (merge workflow)
were hard requirements from the original spec — silently dropping them because a later
stage list omitted them would have been an unauthorized scope reduction.
**Status:** Active.

### D017 — Merge winner selection: older profile wins
**Decision:** When merging two teacher profiles, the one with the earlier `created_at`
is kept as canonical; the newer one is archived and pointed at it.
**Rationale:** Simple, deterministic, no new fields needed. The older profile has had
more time to accumulate recommendations/history. Revisit if real usage shows a better
heuristic is needed (e.g. profile with more approved recommendations wins).
**Status:** Active, MVP heuristic.

### D018 — Search & Filtering scoped to moderator-only (Stage 8)
**Decision:** `/search` exists only in the admin bot, gated by the same
`isModeratorOrAbove` check as everything else there.
**Rationale:** A public teacher directory was always a "future web portal" item, not
MVP scope. Keeping search internal avoids building public-facing pagination/rate-limit
concerns prematurely, and avoids any risk of this becoming a de facto public ranking
surface (D002).
**Status:** Active.

### D019 — Rate limiting via Postgres, not a new Cloudflare binding
**Decision:** Rate limiting (Stage 10) counts recent rows in `recommendations` rather
than using Cloudflare KV, Durable Objects, or the Rate Limiting API product.
**Rationale:** No new infrastructure surface — consistent with the project's repeated
"don't add new infrastructure" constraint. Slightly less precise than a purpose-built
rate limiter (a query per submission attempt) but adequate at MVP scale.
**Status:** Active. Revisit if submission volume makes the per-attempt query a
measurable cost.
