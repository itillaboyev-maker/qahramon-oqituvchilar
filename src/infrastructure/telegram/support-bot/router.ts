import { Bot, type Context } from "grammy";

/**
 * Minimal "just forward it to me" support bot: any message a user sends is
 * forwarded as-is to the admin's personal chat. No commands, no state, no DB.
 */
export function buildSupportBot(token: string, adminChatId: string) {
  const bot = new Bot(token);

  bot.on("message", async (ctx: Context) => {
    try {
      await ctx.forwardMessage(adminChatId);
    } catch {
      // best-effort forwarder
    }
  });

  return bot;
}
