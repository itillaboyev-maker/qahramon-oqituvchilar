# Architecture

See `DECISIONS.md` for the reasoning behind each choice below — this file describes
the *current shape*, `DECISIONS.md` explains *why*.

## Stack
Cloudflare Workers (TypeScript) · grammY (Telegram, two bot instances) · Supabase
Postgres · Drizzle ORM. Clean Architecture: `domain` → `application` → `infrastructure`,
dependencies point inward only (infrastructure depends on application/domain via
interfaces — "ports" — never the other way around).

## Two bots, one codebase
- **Public bot** (`infrastructure/telegram/public-bot/`) — recommendation submission.
- **Admin bot** (`infrastructure/telegram/admin-bot/`) — moderation, role-gated.
- Different tokens, different webhook paths (`/webhook/public`, `/webhook/admin`),
  different secret validation. A compromised public bot can never reach moderation
  actions. Both share the same `application` layer use cases via one DI container
  (`infrastructure/config/di-container.ts`).

## Folder structure

```
src/
├── domain/                    # Framework-free business rules
│   ├── entities/               # Teacher, Recommendation, User, Media
│   ├── enums/                  # UserRole, PublishStatus, RecommendationStatus, etc.
│   ├── errors/                 # DomainError, NotFoundError, ValidationError, ...
│   └── services/
│       └── teacher-identity-resolver.service.ts   # pure confidence-scoring logic
│
├── application/                # Use cases — "what the system does"
│   ├── use-cases/
│   │   ├── teacher/            # find-or-create-teacher (Identity Resolution lives here)
│   │   ├── recommendation/     # submit-nomination, moderate-recommendation, list-pending
│   │   └── user/                # register-user
│   ├── ports/                   # Interfaces — dependency inversion boundary
│   │   ├── repositories/        # teacher/recommendation/user/media/duplicate-candidate
│   │   ├── services/            # telegram-client, duplicate-detector (future AI seam)
│   │   └── session/             # session-store
│   └── dto/                     # NominationDto, etc.
│
├── infrastructure/              # Framework-specific implementations
│   ├── db/
│   │   ├── schema/               # Drizzle table definitions (source of truth for migrations)
│   │   └── repositories/         # Drizzle implementations of the ports above
│   ├── telegram/
│   │   ├── public-bot/           # handlers, keyboards, middleware, router
│   │   └── admin-bot/            # handlers, middleware, router
│   ├── session/
│   │   └── postgres-session-store.ts
│   └── config/
│       ├── env.ts
│       └── di-container.ts       # wires every port to its implementation — the one
│                                   # file to touch when swapping any adapter
│
├── i18n/                         # uz-latn populated; uz-cyrl/ru/en are typed stubs
├── shared/
│   ├── utils/                     # normalize-name, transliteration, string-similarity
│   └── constants/                 # identity-resolution.constants.ts
└── index.ts                      # Worker entrypoint — routes both webhook paths
```

## Key architectural rules (enforced by structure, not just convention)

- **Use cases never import Drizzle or grammY directly** — only ports. This is what
  makes the Identity Resolution domain service (`teacher-identity-resolver.service.ts`)
  fully unit-testable with no database, and what would let a future web/mobile client
  reuse the same use cases through a REST or GraphQL layer without touching bot code.
- **No teacher is ever created directly** — every path goes through
  `FindOrCreateTeacherUseCase`. There is no "create teacher" bot command.
- **No media row is ever linked to a teacher directly** — always via a recommendation.
- **Bot session state lives in Postgres** (`bot_sessions` table), not in Worker memory
  or Durable Objects — Workers are stateless per-request.
- **The DI container (`di-container.ts`) is the only file that constructs concrete
  implementations.** Everywhere else depends on interfaces. Swapping Telegram
  `file_id` storage for R2, or adding a real AI duplicate-detector, means changing
  this file plus one new adapter file — not touching use cases.

## Data flow: a nomination, end to end

1. Telegram → `/webhook/public` → `buildPublicBot` router (grammY).
2. Router resolves the internal `User` row (`UserRepository.findByTelegramId`), then
   dispatches to `nomination-flow.handler.ts`, which reads/writes `bot_sessions` via
   `SessionStorePort` as the conversation progresses.
3. On consent confirmation, the handler calls `SubmitNominationUseCase.execute(dto)`.
4. That use case calls `FindOrCreateTeacherUseCase` — pg_trgm prefilter →
   `TeacherIdentityResolver` scoring → auto-attach / log-candidate / create decision.
5. `RecommendationRepository.create(...)` persists the recommendation; any collected
   media is attached via `MediaRepository.attachToRecommendation(...)`.
6. Later, the admin bot's `/queue` command reads pending recommendations
   (`ListPendingRecommendationsUseCase`) and moderator actions flow through
   `ModerateRecommendationUseCase`, which also nudges `teachers.publish_status` from
   `draft` to `review` on first approval (never straight to `published` — that's a
   distinct future editorial action).

See `docs/DATABASE.md` for the schema itself and `docs/API.md` for the full bot
command/callback surface and internal port contracts.
