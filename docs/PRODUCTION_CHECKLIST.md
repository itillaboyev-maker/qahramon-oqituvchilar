# Production Checklist

Use this alongside `docs/DEPLOYMENT.md` (setup steps) before inviting real users.

## Code readiness (done)
- [x] `tsc --noEmit` passes
- [x] `wrangler deploy --dry-run` passes
- [x] Clean Architecture boundaries intact (use cases depend only on ports)
- [x] Audit logging wired for all moderator/editor actions
- [x] Rate limiting (5 submissions/hour/user, Postgres-backed)
- [x] Input validation (text length caps, loose phone format check)
- [x] Media upload limits (10 items/recommendation, 20MB video cap, dedup)
- [x] Global error handling (`bot.catch` on both bots, top-level try/catch in `index.ts`)
- [x] Structured logging (JSON lines via `console.*`, visible in `wrangler tail`)

## Not yet done — required before public launch
- [ ] Deploy to Cloudflare + Supabase (see `docs/DEPLOYMENT.md`) — currently paused
- [ ] Run the full end-to-end test checklist in `docs/DEPLOYMENT.md` section 7
- [ ] Set at least one real user's `users.role = 'admin'` so moderation is possible
- [ ] Confirm both bot webhooks registered with correct secrets (`getWebhookInfo`)
- [ ] Review Telegram channel admin permissions for the public bot
- [ ] Decide and communicate a moderator SLA (how often is `/queue` checked)

## Explicitly deferred (see ROADMAP.md for full list)
- R2 media migration, virus scanning, EXIF stripping
- AI embeddings for Identity Resolution (pgvector)
- AI moderation, AI biography generation
- Public web portal / public API / public search
- Wrangler v3 → v4 upgrade

## Security summary
- Two bot tokens, isolated by webhook path + secret token validation.
- RBAC via `users.role` (`user` / `moderator` / `editor` / `admin`), checked on every
  admin bot interaction (`adminRoleGuard`) and inside every use case that needs it
  (`isModeratorOrAbove`), not just at the bot layer — defense in depth.
- No public ranking/voting surface exists anywhere (D002) — recommendation counts are
  moderator-only.
- Consent required and recorded before any submission is stored as consented
  (`recommendations.consent_given`).
- Phone numbers are optional everywhere and never required for submission.
- All secrets via `wrangler secret put` — never committed, never in `wrangler.toml` vars.

## Known limitations to monitor after launch
- Identity Resolution's candidate prefilter is a sequential scan (not index-backed) —
  fine at current scale, revisit past a few thousand teachers.
- `years_of_experience` isn't collected by either bot flow yet, so that Identity
  Resolution signal is always neutral.
- No automated tests exist yet (unit tests for `TeacherIdentityResolver` and
  `fullNameSimilarity` would be the highest-value first tests, since they're pure
  functions with no DB dependency).
