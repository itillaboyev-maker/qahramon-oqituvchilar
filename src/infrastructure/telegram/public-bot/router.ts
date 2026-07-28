import { Bot, InlineKeyboard } from "grammy";
import type { Container } from "../../config/di-container";
import { subscriptionGuard } from "./middleware/subscription-guard.middleware";
import { startHandler, checkSubscriptionHandler } from "./handlers/start.handler";
import { registerNominationFlow } from "./handlers/nomination-flow.handler";
import { registerSelfSubmissionFlow } from "./handlers/self-submission-flow.handler";
import { mainMenuKeyboard, whoIsThisAboutKeyboard } from "./keyboards/main-menu.keyboard";
import { t } from "../../../i18n/translate";
import { logger } from "../../logging/logger";

export function buildPublicBot(botToken: string, requiredChannelId: string, container: Container) {
  const bot = new Bot(botToken);
  const { publicTelegramClient } = container.telegramClients;
  const { registerUser, submitNomination } = container.useCases;

  // Stage 9: never let an unhandled error silently drop a user's update — log it with
  // context and show a friendly message instead of leaving them stuck mid-flow.
  bot.catch((err) => {
    logger.error("public_bot_unhandled_error", {
      error: err.error instanceof Error ? err.error.message : String(err.error),
      updateId: err.ctx.update.update_id,
    });
    void err.ctx.reply("Kechirasiz, xatolik yuz berdi. Iltimos /start buyrug'ini qayta yuboring.").catch(() => {});
  });

  const nomination = registerNominationFlow(
    container.db,
    container.sessionStore,
    submitNomination,
    container.r2StorageService,
    botToken,
  );
  const selfSubmission = registerSelfSubmissionFlow(
    container.db,
    container.sessionStore,
    submitNomination,
  );

  bot.use(subscriptionGuard(publicTelegramClient, requiredChannelId));

  bot.callbackQuery("check_subscription", checkSubscriptionHandler());

  // Business rule A: always ask "who is this about" before any submission starts.
  // "Boshqa ustoz" is the encouraged default — emphasized in the keyboard itself
  // (see whoIsThisAboutKeyboard), not by skipping the question.
  bot.callbackQuery("menu:submit_info", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(t("who.question"), { reply_markup: whoIsThisAboutKeyboard() });
  });
bot.callbackQuery("recommender_phone:skip", async (ctx) => {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id;
  if (!userId) return;

  const user = await container.repos.userRepo.findByTelegramId(userId);
  if (!user) return;

  const session = await container.sessionStore.get(user.id, "public");
  if (!session) return;

  const data = { ...session.collectedData } as Record<string, unknown>;

  data.recommenderPhone = null;

  await container.sessionStore.update(session.id, {
    currentStep: "consent",
    collectedData: data,
  });

  await ctx.reply(t("nomination.consent_question"), {
    reply_markup: new InlineKeyboard()
      .text(t("nomination.btn_consent_yes"), "consent:yes")
      .row()
      .text(t("nomination.btn_consent_no"), "consent:no"),
  });
});
  bot.callbackQuery("who:teacher", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    await ctx.answerCallbackQuery();
    await nomination.start(ctx, user.id);
  });

  bot.callbackQuery("who:self", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    await ctx.answerCallbackQuery();
    await selfSubmission.start(ctx, user.id);
  });

  bot.callbackQuery("menu:about", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "\"Qahramon o'qituvchilar\" — fidoyi o'qituvchilarni tan olish va ularning tajribasini kelajak avlodlar uchun saqlab qolish milliy loyihasi.",
    );
  });

  bot.callbackQuery("menu:contact", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Savol va takliflar uchun: @qahramon_oqituvchilar_support");
  });

  // Both flows share these dispatch points — each handler checks bot_sessions.flowType
  // internally and no-ops (returns false) if the session isn't in its own flow, so
  // trying both in sequence is safe and never double-processes an update.
  bot.on("callback_query:data", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    const data = ctx.callbackQuery.data;
    const handled = (await nomination.handleCallback(ctx, user.id, data)) || (await selfSubmission.handleCallback(ctx, user.id, data));
    if (!handled) {
      await ctx.answerCallbackQuery();
      await ctx.reply(t("menu.unknown_button"));
    }
  });

  bot.on("message:text", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    const text = ctx.message.text;
    const handled = (await nomination.handleText(ctx, user.id, text)) || (await selfSubmission.handleText(ctx, user.id, text));
    if (!handled) {
      const session = await container.sessionStore.get(user.id, "public");
      if (session && session.flowType !== "none" && session.currentStep) {
        // User is mid-flow but message wasn't expected here.
        await ctx.reply(t("menu.unknown_input_in_flow"));
        return;
      }
      // Fallback: show main menu
      await ctx.reply(t("menu.title"), { reply_markup: mainMenuKeyboard() });
    }
  });

  // Media (business rule H): stored as Telegram file_id references for MVP, always
  // attached to the recommendation being submitted — never directly to a teacher.
  bot.on("message:contact", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    await nomination.handleContact(ctx, user.id, ctx.message.contact);
  });

  bot.on("message:photo", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    const largest = ctx.message.photo[ctx.message.photo.length - 1]!;
    console.log("PUBLIC BOT FILE_ID:", largest.file_id);
console.log("PUBLIC BOT BOT_ID:", ctx.me.id);
    (await nomination.handleMedia(ctx, user.id, "photo", largest.file_id, largest.file_unique_id, largest.file_size)) ||
      (await selfSubmission.handleMedia(ctx, user.id, "photo", largest.file_id, largest.file_unique_id, largest.file_size));
  });

  bot.on("message:video", async (ctx) => {
    const user = await container.repos.userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    const video = ctx.message.video;
    (await nomination.handleMedia(ctx, user.id, "video", video.file_id, video.file_unique_id, video.file_size)) ||
      (await selfSubmission.handleMedia(ctx, user.id, "video", video.file_id, video.file_unique_id, video.file_size));
  });

  return bot;
}
