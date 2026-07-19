# API Surface

There is no public REST/GraphQL API yet — the "API" today is the Telegram bot
command/callback surface plus the internal application ports that a future public API
would be built on top of (see `docs/ARCHITECTURE.md` for why the layering makes that
additive later).

## Worker HTTP routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /webhook/public` | `x-telegram-bot-api-secret-token` header must match `PUBLIC_BOT_WEBHOOK_SECRET` | Public bot updates |
| `POST /webhook/admin` | `x-telegram-bot-api-secret-token` header must match `ADMIN_BOT_WEBHOOK_SECRET` | Admin bot updates |
| `GET /` | none | Health/info text, no side effects |

## Public bot — commands & callback data

| Trigger | Handler | Notes |
|---|---|---|
| `/start` | `start.handler.ts` | Upserts the user, shows join-channel prompt if not subscribed |
| callback `check_subscription` | `checkSubscriptionHandler` | Re-checks channel membership, shows main menu on success |
| callback `menu:submit_info` | inline in `router.ts` | Shows the "Kim haqida?" question (business rule A) |
| callback `who:teacher` | inline in `router.ts` | Starts the nomination flow |
| callback `who:self` | inline in `router.ts` | Stub — self-submission is Stage 6 |
| callback `menu:about` / `menu:contact` | inline in `router.ts` | Static text replies |
| callback `region:<id>` / `district:<id>` / `rel:<key>` | `nomination-flow.handler.ts` | Nomination flow steps |
| callback `more:yes` / `more:no` | `nomination-flow.handler.ts` | Optional extra-info branch |
| callback `media:done` / `skip:media` | `nomination-flow.handler.ts` | Ends optional media collection |
| callback `skip:recommender_name` / `skip:recommender_phone` | `nomination-flow.handler.ts` | Both always skippable — phone is never required |
| callback `consent:yes` / `consent:no` | `nomination-flow.handler.ts` | Submits (via `SubmitNominationUseCase`) or discards |
| `message:text` / `message:photo` / `message:video` | `nomination-flow.handler.ts` | Routed by current `bot_sessions.current_step` |

## Admin bot — commands & callback data

| Trigger | Handler | Notes |
|---|---|---|
| `/start` | inline in `router.ts` | Static instructions |
| `/queue` | `moderation-queue.handler.ts` | Shows oldest `NEW` recommendation + count |
| callback `mod:review:<id>` | `moderation-queue.handler.ts` | `NEW → UNDER_REVIEW` |
| callback `mod:approve:<id>` | `moderation-queue.handler.ts` | `→ APPROVED`, may bump teacher `draft → review` |
| callback `mod:reject:<id>` | `moderation-queue.handler.ts` | `→ REJECTED` |

All admin bot messages pass through `adminRoleGuard` — non-moderator/editor/admin
users get a plain refusal message, no further processing.

## Internal application ports (the seam a future public API would use)

These interfaces are what any future web portal, mobile app, or public API would call
into — bot handlers are just one caller among potential others. Full signatures live in
`application/ports/`; summarized here:

- **`TeacherRepositoryPort`** — `findById`, `findCandidatesByNameSimilarity`, `create`,
  `updatePublishStatus`.
- **`RecommendationRepositoryPort`** — `create`, `findById`, `listByStatus`,
  `countByStatus`, `updateStatus`.
- **`MediaRepositoryPort`** — `attachToRecommendation`, `listByRecommendationIds`.
- **`DuplicateCandidateRepositoryPort`** — `logIfNew`, `listPending`.
- **`UserRepositoryPort`** — `findByTelegramId`, `upsertByTelegramId`, `isModeratorOrAbove`.
- **`SessionStorePort`** — bot-specific, unlikely to be reused outside Telegram.
- **`TelegramClientPort`** — bot-specific, unlikely to be reused outside Telegram.

Use cases built on these (`FindOrCreateTeacherUseCase`, `SubmitNominationUseCase`,
`ModerateRecommendationUseCase`, `ListPendingRecommendationsUseCase`,
`RegisterUserUseCase`) contain all real business logic and are framework-agnostic —
a future REST layer would call these directly rather than duplicating logic.

This file should gain a real "Public API" section once Stage 7+ work (post-MVP) adds
an actual HTTP API beyond the Telegram webhooks.
