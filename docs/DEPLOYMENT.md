# Deployment guide — MVP

Follow these steps in order. Steps 1–3 (Supabase) must be done before step 5 (Cloudflare
secrets), since the Worker needs a live `DATABASE_URL` to do anything.

---

## 1. Supabase setup

1. Go to [supabase.com](https://supabase.com) → New project.
   - Choose a region close to Uzbekistan (e.g. Frankfurt/`eu-central-1`) for lower latency.
   - Save the database password you set — you'll need it for the connection string.
2. Once the project is provisioned, go to **Project Settings → Database**.
3. Under **Connection string**, copy the **Connection pooling** string (not the direct
   connection) — it uses port `6543` and is required because Cloudflare Workers open a
   new connection per request; the pooler handles that load. It looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
4. Save this as your `DATABASE_URL` — you'll enter it as a Cloudflare secret in step 5.
5. Enable the `pg_trgm` extension check: **Database → Extensions** → search `pg_trgm` →
   confirm it's available (the migration script also enables it via SQL, so this is just
   a sanity check — no action needed here).

---

## 2. Database migration steps

Run the two SQL files against your new Supabase database, in order.

**Option A — Supabase SQL Editor (simplest, no local Postgres client needed):**
1. Open **SQL Editor** in the Supabase dashboard.
2. Paste the full contents of `migrations/0000_init.sql` → Run.
3. Paste the full contents of `migrations/0001_seed_regions.sql` → Run.

**Option B — psql from your machine:**
```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres" \
  -f migrations/0000_init.sql

psql "postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres" \
  -f migrations/0001_seed_regions.sql
```
Use the **direct connection** (port `5432`, not the pooler) for migrations — DDL and
long-running scripts are more reliable outside the pooler.

**Verify:**
```sql
select count(*) from regions;        -- should return 14
select count(*) from teachers;       -- should return 0
```

**Set your own admin role** (so you can use the moderator bot later — do this after you
send `/start` to the admin bot once in step 6, so your row exists):
```sql
update users set role = 'admin' where telegram_id = <your_telegram_numeric_id>;
```
Get your numeric Telegram ID from [@userinfobot](https://t.me/userinfobot) if you don't
know it.

---

## 3. Telegram bot setup

You need **two** separate bots — this is a deliberate security boundary (public bot
compromise never exposes moderation actions).

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. `/newbot` → choose a name and username for the **public bot**
   (e.g. `Qahramon Oqituvchilar`, username `qahramon_oqituvchilar_bot`).
   BotFather replies with a token like `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   — save it as `PUBLIC_BOT_TOKEN`.
3. `/newbot` again → create the **admin/moderator bot**
   (e.g. `Qahramon Admin`, username `qahramon_oqituvchilar_admin_bot`).
   Save this token as `ADMIN_BOT_TOKEN`.
4. Create the official Telegram **channel** that the product spec requires users to join:
   - Telegram app → New Channel → make it public, set a username (e.g. `@qahramon_oqituvchilar`).
   - Add the **public bot** as an administrator of the channel (Channel settings →
     Administrators → Add Admin → search your bot). This is required for the bot to be
     able to check membership via `getChatMember`.
5. Note the channel username (with the `@`) as `REQUIRED_CHANNEL_ID`.

Optional but recommended: set each bot's profile picture, description (`/setdescription`
in BotFather), and short description via BotFather so it looks legitimate before launch.

---

## 4. Environment variables list

| Variable | Where it's used | Example / notes |
|---|---|---|
| `DATABASE_URL` | Drizzle client | Supabase **pooled** connection string, port `6543` |
| `PUBLIC_BOT_TOKEN` | Public bot | From BotFather, step 3.2 |
| `ADMIN_BOT_TOKEN` | Admin bot | From BotFather, step 3.3 |
| `PUBLIC_BOT_WEBHOOK_SECRET` | Verifies incoming webhook requests | Any long random string you generate yourself |
| `ADMIN_BOT_WEBHOOK_SECRET` | Verifies incoming webhook requests | A **different** long random string |
| `REQUIRED_CHANNEL_ID` | Subscription check | `@qahramon_oqituvchilar` (step 3.4) |
| `ENVIRONMENT` | Informational only | Already set in `wrangler.toml` as `"production"` |

Generate random secrets locally, don't reuse them anywhere else:
```bash
openssl rand -hex 32   # run twice, once per webhook secret
```

All of these are **secrets**, not plain vars (except `ENVIRONMENT`) — they must never be
committed to git or placed in `wrangler.toml`'s `[vars]` block. Step 5 shows how to set
them properly via Wrangler.

---

## 5. Cloudflare Worker deployment — exact steps

1. Install dependencies:
   ```bash
   cd qahramon-oqituvchilar
   npm install
   ```
2. Authenticate Wrangler with your Cloudflare account:
   ```bash
   npx wrangler login
   ```
   This opens a browser window to authorize the CLI.
3. Set each secret (you'll be prompted to paste the value after each command):
   ```bash
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put PUBLIC_BOT_TOKEN
   npx wrangler secret put ADMIN_BOT_TOKEN
   npx wrangler secret put PUBLIC_BOT_WEBHOOK_SECRET
   npx wrangler secret put ADMIN_BOT_WEBHOOK_SECRET
   npx wrangler secret put REQUIRED_CHANNEL_ID
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```
5. Wrangler prints your Worker URL on success, e.g.:
   ```
   https://qahramon-oqituvchilar.<your-subdomain>.workers.dev
   ```
   Save this URL — you need it for webhook registration in step 6.
6. Sanity check the Worker is live:
   ```bash
   curl https://qahramon-oqituvchilar.<your-subdomain>.workers.dev/
   ```
   Expect: `Qahramon O'qituvchilar API — see /webhook/public and /webhook/admin`

**Optional — custom domain:** if you have a domain on Cloudflare, add a route in the
dashboard (**Workers & Pages → your worker → Settings → Triggers → Add Custom Domain**)
so your webhook URL is your own domain instead of `*.workers.dev`. Not required for MVP.

---

## 6. Webhook configuration

Telegram needs to know where to POST updates for each bot. Do this once per bot, using
the `setWebhook` API directly (no code needed — plain `curl`).

**Public bot:**
```bash
curl -X POST "https://api.telegram.org/bot<PUBLIC_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://qahramon-oqituvchilar.<your-subdomain>.workers.dev/webhook/public",
    "secret_token": "<PUBLIC_BOT_WEBHOOK_SECRET>"
  }'
```

**Admin bot:**
```bash
curl -X POST "https://api.telegram.org/bot<ADMIN_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://qahramon-oqituvchilar.<your-subdomain>.workers.dev/webhook/admin",
    "secret_token": "<ADMIN_BOT_WEBHOOK_SECRET>"
  }'
```

Use the **exact same secret values** you set via `wrangler secret put` in step 5 — the
Worker rejects any request where the `x-telegram-bot-api-secret-token` header doesn't
match, so a mismatch here silently breaks the bot (Telegram will show no error to you,
messages just won't arrive).

**Verify each webhook registered correctly:**
```bash
curl "https://api.telegram.org/bot<PUBLIC_BOT_TOKEN>/getWebhookInfo"
curl "https://api.telegram.org/bot<ADMIN_BOT_TOKEN>/getWebhookInfo"
```
Check `"url"` matches, and `"last_error_message"` is absent or empty.

---

## 7. End-to-end MVP test

Run through this checklist in order. Use two different Telegram accounts if possible
(one as a regular user, one as yourself/admin) — otherwise use one account and switch
roles in the database between steps.

### A. Subscription gate
1. Open the public bot, send `/start`.
2. Confirm it shows the "join channel" message with the two buttons, **not** the main menu
   (since you haven't joined yet).
3. Tap **📢 Kanalga o'tish**, join the channel, come back and tap **✅ A'zolikni tekshirish**.
4. Confirm the main menu now appears.

### B. Nomination flow (fast path, <2 minutes)
1. Tap **🌟 Fidoyi o'qituvchini tavsiya qilish**.
2. Answer each prompt: teacher name → pick a region → pick a district → school name
   → pick a relationship → write a short "why" text.
3. When asked "add more info?", tap **✅ Yetarli, yuborish** (skip the optional branch
   first, to test the fast path).
4. Tap **⏭ O'tkazib yuborish** for recommender name, then again for phone.
5. Tap **✅ Roziman** on the consent prompt.
6. Confirm you receive the "Rahmat!" success message.
7. In Supabase SQL Editor, verify:
   ```sql
   select id, full_name, publish_status from teachers order by created_at desc limit 1;
   select id, teacher_id, status, consent_given from recommendations order by created_at desc limit 1;
   ```
   Expect: one new `teachers` row with `publish_status = 'draft'`, one new
   `recommendations` row with `status = 'new'` and `consent_given = true`.

### C. Recommendation-first dedup (no duplicate teacher)
1. Repeat step B for the **same teacher name, same district, same school**.
2. Verify in SQL that `teachers` still has only **one** row for that teacher, but
   `recommendations` now has **two** rows pointing at the same `teacher_id`.

### D. Optional "add more" branch
1. Submit a third nomination, this time tapping **➕ Ha, qo'shaman** when asked.
2. Confirm the bot asks for the extra info in one message, then continues to
   recommender name/phone/consent as before.
3. Verify `additional_info` is populated on the new `recommendations` row.

### E. Optional fields truly optional
1. Confirm you were never blocked from finishing a submission after skipping both
   recommender name and phone — this is the "phone optional" requirement.

### F. Moderator queue workflow
1. Make sure your Telegram account's `users.role` is `moderator` or `admin` (see step 2's
   final instruction).
2. Open the **admin bot**, send `/start`, then `/queue`.
3. Confirm it shows the oldest `NEW` recommendation with teacher name, relationship, and
   text, plus three buttons: 👀 Ko'rib chiqish / ✅ Tasdiqlash / ❌ Rad etish.
4. Tap **👀 Ko'rib chiqish** — confirm the recommendation moves to `UNDER_REVIEW`
   (check `select status from recommendations where id = '<id>'`).
5. Run `/queue` again — confirm the next `NEW` item shows (or "queue empty" if none left).
6. Go back and tap **✅ Tasdiqlash** on an under-review item — confirm:
   - `recommendations.status` → `approved`, `moderated_by` and `moderated_at` populated.
   - The related `teachers.publish_status` flips from `draft` to `review` (only if it
     was still `draft` — this only happens once per teacher).
7. Test rejection on a different item — confirm `status` → `rejected`.
8. Confirm a **non-moderator** account gets "Sizda ushbu botdan foydalanish huquqi yo'q"
   when messaging the admin bot at all.

### G. Negative/edge cases worth checking
- Send `/start` to the public bot a second time — confirm no duplicate row is created in
  `users` (same `telegram_id`, `upsert` behavior).
- Start a nomination, then send `/start` again mid-flow — confirm the old session is
  discarded cleanly (no crash, no stuck state) and a fresh session starts.
- Check `getWebhookInfo` periodically during testing for `pending_update_count` growth —
  a growing number means the Worker is erroring; check `wrangler tail` for logs:
  ```bash
  npx wrangler tail
  ```

If all of A–G pass, the MVP is ready for real users. Photo capture is the next feature
to layer on top of the nomination flow once this is confirmed stable in production.
