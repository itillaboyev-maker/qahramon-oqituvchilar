# Roadmap

## Current build plan (all stages complete)

| Stage | Scope | Status |
|---|---|---|
| 0 | Fix `@/` import-alias build bug | ✅ Done |
| 1 | "Kim haqida?" flow, default emphasis on "boshqa ustoz" | ✅ Done |
| 2 | Media attaches via recommendation only + bot photo/video step | ✅ Done |
| 3 | Teacher Identity Resolution MVP (deterministic, no AI/embeddings) | ✅ Done |
| 4 | Teacher aggregation view + community recommendation count (moderator-facing) | ✅ Done |
| 5 | Moderator review queue + Merge workflow (`duplicate_candidates` review) | ✅ Done |
| 6 | Approval workflow hardening + Self-submission flow | ✅ Done |
| 7 | Media pipeline hardening (limits, dedup, size validation — no R2 yet) | ✅ Done |
| 8 | Search & filtering (moderator-only, admin bot) | ✅ Done |
| 9 | Observability, logging, error handling, audit trail | ✅ Done |
| 10 | Production hardening (rate limiting, input validation) | ✅ Done |

**Next:** resume deployment (see `docs/DEPLOYMENT.md`), work through
`docs/PRODUCTION_CHECKLIST.md`, then run the full end-to-end test checklist against a
live environment before any real users are invited.

## Explicitly deferred to a later phase (not in Stages 0–7)

These were proposed at various points and deliberately pushed out — see
`DECISIONS.md` D006 for the fuller context on why scope discipline matters here.

- **AI embeddings + `pgvector`** for Identity Resolution (D010) — add as an additional
  signal once the deterministic approach's limits are visible from real data.
- **AI Moderation** (automated content flagging) — needs its own scoping conversation;
  involves a new external AI API call, which is new infrastructure surface.
- **AI Biography Generator** — synthesizes one profile bio from many submitted stories.
  Needs its own scoping conversation once there's enough real data per teacher to
  make this meaningful.
- **R2 media storage, virus scanning, EXIF stripping** — MVP uses Telegram `file_id`
  only. This was always the stated "Future" phase in the original architecture.
- **Cloudflare Queues, Terraform, CI/CD pipeline, OpenAPI spec, monitoring/observability
  beyond basic `wrangler tail`, Distributed Lock, Hybrid Cache, Feature Flags** — all
  proposed as part of the declined "enterprise merge" (D006). Revisit individually,
  each with its own scoped justification, once the MVP is live and real usage reveals
  which of these are actually needed.
- **Public web portal, mobile app, public API, AI search / vector search, national
  archive presentation layer** — the "future compatibility" goals from the original
  brief. The Clean Architecture (ports/use-cases independent of Telegram) is meant to
  make these additive later, not urgent now.
- **Community Score / Trust Score / Hero Teacher Discovery / any public ranking** —
  **not planned as public-facing features.** Recommendation counts remain an internal
  moderator signal only (D002). If a future request revives ranking/scoring language,
  it needs explicit re-confirmation against D002 before any code is written — this has
  already been a recurring point of scope drift in this project's history.
- **Rate limiting / anti-spam / encryption-at-rest specifics** — should land no later
  than Stage 7's production checklist, before real public launch. Not yet implemented.

## Guiding principle for anything not on this list

If a new request would add a genuinely new piece of infrastructure (a new Cloudflare
product, a new external API dependency, a new database extension) or would let
recommendation counts influence anything the public sees, treat that as a scope
decision requiring explicit confirmation — not something to build quietly inside an
unrelated stage. Log the decision in `DECISIONS.md` either way.
