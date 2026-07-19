# Qahramon O'qituvchilar — MVP

Recognition platform for outstanding teachers in Uzbekistan. Community recommends,
experts verify — no voting, no rankings.

## Stack
Cloudflare Workers + TypeScript, grammY (Telegram), Drizzle ORM, Supabase Postgres.

## Setup

1. Create a Supabase project, then run the migrations (see `docs/DATABASE.md`).
2. Create two Telegram bots via @BotFather: one public-facing, one for moderators.
3. Copy `.env.example` to `.env` and fill in real values.
4. Set secrets on Cloudflare:
   ```bash
   wrangler secret put DATABASE_URL
   wrangler secret put PUBLIC_BOT_TOKEN
   wrangler secret put ADMIN_BOT_TOKEN
   wrangler secret put PUBLIC_BOT_WEBHOOK_SECRET
   wrangler secret put ADMIN_BOT_WEBHOOK_SECRET
   ```
5. Deploy: `npm run deploy`
6. Register each bot's webhook (Telegram API `setWebhook`), pointing at
   `https://<your-worker>.workers.dev/webhook/public` and `/webhook/admin`,
   each with its own `secret_token` matching the env vars above.
7. In Supabase, manually set your own `users.role` to `admin` so you can use the admin bot.

## What's implemented in this build step

- Full MVP database schema + migration (`migrations/0000_init.sql`, seeded with
  Uzbekistan's 14 regions).
- Clean Architecture skeleton: domain entities, application use cases + ports,
  Drizzle repository implementations.
- Public bot: `/start` → mandatory channel subscription check → main menu →
  fast nomination flow (recommendation-first: auto-creates a draft teacher profile,
  phone optional, under-2-minute essential path with an optional "add more" branch).
- Admin bot: role-gated, `/queue` shows the oldest pending recommendation with
  review/approve/reject buttons implementing `NEW → UNDER_REVIEW → APPROVED/REJECTED`.

## Deliberately not yet built (next steps)

- Self-submission flow (`menu:self_submit` currently replies "coming soon") — same
  pattern as nomination, `submissionType: "self"`.
- Editor action to promote a teacher `review → published`.
- Media (photo/video) capture in the nomination flow.
- Rate limiting / anti-spam middleware.
- R2 storage adapter, AI duplicate detection, AI content generation — ports already
  exist (`application/ports/services/`), only no-op/real implementations are missing.

See `docs/DATABASE.md` for schema details and the moderation state machine.
