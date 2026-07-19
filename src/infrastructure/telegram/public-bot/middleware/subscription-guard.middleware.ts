import type { Context, NextFunction } from "grammy";
import type { TelegramClientPort } from "../../../../application/ports/services/telegram-client.port";
import { joinChannelKeyboard } from "../keyboards/main-menu.keyboard";
import { t } from "../../../../i18n/translate";

/**
 * Enforces the mandatory channel subscription (product requirement: gate everything
 * behind "📢 Join Channel" / "✅ Check Subscription" before any menu is shown).
 */
export function subscriptionGuard(telegramClient: TelegramClientPort, requiredChannelId: string) {
  return async (ctx: Context, next: NextFunction) => {
    // Let the "check subscription" button itself through — it re-verifies explicitly.
    if (ctx.callbackQuery?.data === "check_subscription") {
      return next();
    }

    const userId = ctx.from?.id;
    if (!userId) return;

    const isMember = await telegramClient.isChannelMember(userId, requiredChannelId);
    if (!isMember) {
      await ctx.reply(t("start.join_channel"), {
        reply_markup: joinChannelKeyboard(requiredChannelId),
      });
      return;
    }

    return next();
  };
}
