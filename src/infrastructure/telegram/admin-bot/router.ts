import { Bot } from "grammy";

import type { Container } from "../../config/di-container";
import type { Env } from "../../config/env";

import { adminRoleGuard } from "./middleware/admin-role-guard.middleware";
import { registerModerationQueue } from "./handlers/moderation-queue.handler";
import { registerMergeQueue } from "./handlers/merge-queue.handler";

import { logger } from "../../logging/logger";

export function buildAdminBot(
  botToken: string,
  container: Container,
  env: Env,
) {
  console.log("🔥 BUILD ADMIN BOT");

  const bot = new Bot(botToken);

  bot.init().then(() => {
    console.log("ADMIN BOT ID:", bot.botInfo.id);
  });

  bot.command("test", async (ctx) => {
    await ctx.reply("TEST OK");
  });

  const {
    userRepo,
    teacherRepo,
    duplicateCandidateRepo,
    mediaRepo,
    recommendationRepo,
  } = container.repos;

  const {
    listPendingRecommendations,
    moderateRecommendation,
    mergeTeachers,
    searchTeachers,
  } = container.useCases;

  bot.catch((err) => {
    logger.error("admin_bot_unhandled_error", {
      error:
        err.error instanceof Error
          ? err.error.message
          : String(err.error),
      updateId: err.ctx.update.update_id,
    });

    void err.ctx
      .reply("Xatolik yuz berdi. Qaytadan urinib ko'ring.")
      .catch(() => {});
  });

  bot.use(adminRoleGuard(userRepo));

  const queue = registerModerationQueue(
    listPendingRecommendations,
    moderateRecommendation,
    teacherRepo,
    recommendationRepo,
    mediaRepo,
    env,
  );

  const mergeQueue = registerMergeQueue(
    duplicateCandidateRepo,
    teacherRepo,
    mergeTeachers,
  );

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Moderator paneli.\n\n" +
        "/queue — tavsiyalar navbati\n" +
        "/merge_queue — ehtimoliy dublikatlar navbati\n" +
        "/search <matn> — ustozlarni qidirish",
    );
  });

  bot.command("queue", async (ctx) => {
    console.log("QUEUE COMMAND RECEIVED");
    await ctx.reply("QUEUE COMMAND RECEIVED");
    await queue.showQueue(ctx);
  });

  bot.command("merge_queue", (ctx) =>
    mergeQueue.showQueue(ctx),
  );

  bot.command("search", async (ctx) => {
    if (!ctx.from) return;

    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;

    const query = ctx.match?.toString().trim();

    if (!query) {
      await ctx.reply("Foydalanish: /search Otabek Hakimov");
      return;
    }

    try {
      const results = await searchTeachers.execute({
        moderatorUserId: user.id,
        nameOrSchoolQuery: query,
      });

      if (results.length === 0) {
        await ctx.reply("Hech narsa topilmadi.");
        return;
      }

      const lines = results.map(
        (r: any) =>
          `👤 <b>${r.fullName}</b> — ${r.school ?? "-"} (${r.publishStatus})`,
      );

      await ctx.reply(lines.join("\n"), {
        parse_mode: "HTML",
      });
    } catch (err) {
      await ctx.reply(`Xato: ${(err as Error).message}`);
    }
  });

  bot.callbackQuery(
    /^mod:(review|approve|reject):(.+)$/,
    async (ctx) => {
      const [, action, recommendationId] =
        ctx.match as unknown as [
          string,
          "review" | "approve" | "reject",
          string,
        ];

      const user = await userRepo.findByTelegramId(ctx.from.id);
      if (!user) return;

      (
        ctx as unknown as {
          moderatorUserId: string;
        }
      ).moderatorUserId = user.id;

      await queue.handleAction(
        ctx,
        action,
        recommendationId,
      );
    },
  );

  bot.callbackQuery(
    /^merge:(confirm|dismiss):(.+)$/,
    async (ctx) => {
      const [, decision, candidateId] =
        ctx.match as unknown as [
          string,
          "confirm" | "dismiss",
          string,
        ];

      const user = await userRepo.findByTelegramId(ctx.from.id);
      if (!user) return;

      (
        ctx as unknown as {
          moderatorUserId: string;
        }
      ).moderatorUserId = user.id;

      await mergeQueue.handleDecision(
        ctx,
        decision,
        candidateId,
      );
    },
  );

  return bot;
}