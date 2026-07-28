import { webhookCallback } from "grammy";
import { buildContainer } from "./infrastructure/config/di-container";
import { buildPublicBot } from "./infrastructure/telegram/public-bot/router";
import { buildAdminBot } from "./infrastructure/telegram/admin-bot/router";
import { logger } from "./infrastructure/logging/logger";
import type { Env } from "./infrastructure/config/env";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      const container = buildContainer(env);

      if (url.pathname === "/webhook/public") {
       
        if (request.headers.get("x-telegram-bot-api-secret-token") !== env.PUBLIC_BOT_WEBHOOK_SECRET) {
          logger.warn("public_webhook_auth_failed", { path: url.pathname });
          return new Response("Unauthorized", { status: 401 });
        }
        const bot = buildPublicBot(env.PUBLIC_BOT_TOKEN, env.REQUIRED_CHANNEL_ID, container);
        return await webhookCallback(bot, "cloudflare-mod")(request);
      }

      if (url.pathname === "/webhook/admin") {
        if (request.headers.get("x-telegram-bot-api-secret-token") !== env.ADMIN_BOT_WEBHOOK_SECRET) {
          logger.warn("admin_webhook_auth_failed", { path: url.pathname });
          return new Response("Unauthorized", { status: 401 });
        }
       const bot = buildAdminBot(
  env.ADMIN_BOT_TOKEN,
  container,
  env,
);
        logger.info("before_webhook_callback");

const response = await webhookCallback(bot, "cloudflare-mod")(request);

logger.info("after_webhook_callback", {
  status: response.status,
});

return response;
      }

      return new Response("Qahramon O'qituvchilar API — see /webhook/public and /webhook/admin", {
        status: 200,
      });
    } catch (err) {
      // Last-resort catch (Stage 9): bot.catch() handles errors inside grammY's own
      // processing, but this covers anything before/outside that (e.g. buildContainer
      // failing due to a bad DATABASE_URL) so Telegram always gets a clean response
      // instead of the Worker crashing with an unhandled exception.
      logger.error("worker_fetch_unhandled_error", {
        error: err instanceof Error ? err.message : String(err),
        path: url.pathname,
      });
      return new Response("Internal error", { status: 500 });
    }
  },
};
