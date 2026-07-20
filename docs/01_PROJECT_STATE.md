# PROJECT STATE

**Project:** Qahramon O‘qituvchilar

**Repository:**
https://github.com/itillaboyev-maker/qahramon-oqituvchilar

**Branch:**
main

---

# CURRENT STATUS

## Overall

Production MVP is under active development.

Architecture is considered stable.

Repository is the single source of truth.

---

# COMPLETED

* Cloudflare Worker configured
* Public Telegram Bot implemented
* Admin Telegram Bot implemented
* Neon PostgreSQL connected
* Drizzle ORM configured
* DDD structure established
* Repository Pattern implemented
* CQRS structure implemented
* Session management implemented
* Recommendation flow implemented
* Media collection implemented
* Rate limiting implemented
* Validation implemented
* Region dataset corrected
* Duplicate Farg‘ona region removed
* District mapping fixed
* Git initialized
* GitHub repository connected
* Repository synchronized with GitHub
* AI handoff documentation created

---

# CURRENT TASK

**Production Priority #1**

Investigate and fix the Media Pipeline.

Current audit indicates:

* Telegram handler collects media correctly.
* DTO passes media correctly.
* SubmitNominationUseCase persists media.
* MediaRepository stores media.

Primary investigation target:

`src/infrastructure/telegram/admin-bot/handlers/moderation-queue.handler.ts`

Goal:

Ensure every submitted photo and video appears correctly in the moderator queue.

---

# NEXT TASKS

1. Complete Media Pipeline.
2. Complete Teacher Phone persistence.
3. Complete Moderator Queue.
4. Complete Publish Pipeline.
5. Add AI Assistance interfaces.

---

# ARCHITECTURE DECISIONS

Do not redesign the system.

Keep:

* Cloudflare Workers
* TypeScript
* grammY
* Neon PostgreSQL
* Drizzle ORM
* DDD
* CQRS
* Repository Pattern
* Ports & Adapters

Business logic belongs only in UseCases.

Repositories manage persistence.

Telegram handlers must remain transport-only.

---

# KNOWN ISSUES

* Media is not visible in moderator notifications.
* Teacher phone persistence is only partially implemented.

---

# DEPLOYMENT

Cloudflare Worker:
qahramon-oqituvchilar

Deployment:

npm run deploy

Logs:

npx wrangler tail

---

# GITHUB

Repository:

https://github.com/itillaboyev-maker/qahramon-oqituvchilar

Default branch:

main

---

# LAST UPDATE

Update this file after every completed production milestone.
