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
export function checkSubscriptionHandler(
  publicTelegramClient: {
    getChatMember(chatId: string | number, userId: number): Promise<{ status: string }>;
  },
  requiredChannelId: string,
) {
 return async (ctx: Context) => {
  if (!ctx.from) return;

  const member = await publicTelegramClient.getChatMember(
    requiredChannelId,
    ctx.from.id,
  );

  if (
    member.status !== "member" &&
    member.status !== "administrator" &&
    member.status !== "creator"
  ) {
    await ctx.answerCallbackQuery({
      text: "Avval kanalga a'zo bo'ling.",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();

  await ctx.reply(t("menu.title"), {
    reply_markup: mainMenuKeyboard(),
  });
};
}
