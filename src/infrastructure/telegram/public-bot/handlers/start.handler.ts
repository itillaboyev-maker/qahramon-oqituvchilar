import type { Context } from "grammy";
import { mainMenuKeyboard } from "../keyboards/main-menu.keyboard";
import type { RegisterUserUseCase } from "../../../../application/use-cases/user/register-user.use-case";
import { t } from "../../../../i18n/translate";

export function startHandler(registerUser: RegisterUserUseCase) {
  return async (ctx: Context) => {
    const from = ctx.from;
    if (!from) return;

    await registerUser.execute({
      telegramId: from.id,
      username: from.username ?? null,
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
    });

    await ctx.reply(t("start.welcome"));
    await ctx.reply(t("menu.title"), { reply_markup: mainMenuKeyboard() });
  };
}

export function checkSubscriptionHandler() {
  return async (ctx: Context) => {
    // subscriptionGuard middleware already ran and let this through only if the
    // person is now a member — reaching here means the check passed.
    await ctx.answerCallbackQuery();
    await ctx.reply(t("menu.title"), { reply_markup: mainMenuKeyboard() });
  };
}
