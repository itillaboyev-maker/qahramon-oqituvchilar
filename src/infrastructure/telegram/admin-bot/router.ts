import { Bot } from "grammy";
import type { Context } from "grammy";

import type { Container } from "../../config/di-container";
import type { Env } from "../../config/env";

import { adminRoleGuard } from "./middleware/admin-role-guard.middleware";
import { registerModerationQueue } from "./handlers/moderation-queue.handler";
import { registerMergeQueue } from "./handlers/merge-queue.handler";
import { registerPublishedTeachers } from "./handlers/published-teachers.handler";

import { registerPublishQueue } from "./handlers/publish-queue.handler";

import { logger } from "../../logging/logger";

export function buildAdminBot(
  botToken: string,
  container: Container,
  env: Env,
) {
  console.log("🔥 BUILD ADMIN BOT");

  const bot = new Bot(botToken);

  bot.api.setMyCommands([
    { command: "queue", description: "Yangi arizalar navbati" },
    { command: "publish_queue", description: "Nashrga tayyor profillar" },
    { command: "top", description: "Eng kuchli nomzodlar" },
    { command: "merge_queue", description: "Ehtimoliy dublikatlar" },
    { command: "teachers", description: "Nashrdagi ustozlar katalogi" },
    { command: "search", description: "Ustozlarni qidirish" },
  ]).catch((err) => logger.error("set_commands_failed", { err: String(err) }));

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
    publishTeacher,
    listPublishQueue,
    getTeacherPublishDetail,
    listPublishedTeachers,
  } = container.useCases;

  const publishedTeachers = registerPublishedTeachers(
    listPublishedTeachers,
    getTeacherPublishDetail,
    container.repos.mediaRepo,
    env,
  );

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
  const publishQueue = registerPublishQueue(
    listPublishQueue,
    getTeacherPublishDetail,
    publishTeacher,
    teacherRepo,
    container.sessionStore,
    "publish",
    "general",
    env,
  );


  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Moderator paneli.\n\n" +
        "/queue — tavsiyalar navbati\n" +
        "/merge_queue — ehtimoliy dublikatlar navbati\n" +
        "/publish_queue — nashrga tayyor profillar navbati\n" +
        "/teachers — nashrdagi ustozlar katalogi\n" +
        "/search <matn> — ustozlarni qidirish",
    );
  });

  async function showPublishedTeachers(ctx: Context) {
    if (!ctx.from) return;

    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;

    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;

    await publishedTeachers.showList(ctx, 0);
  }

  bot.command("teachers", showPublishedTeachers);
  bot.command("published_teachers", showPublishedTeachers);

  bot.command("queue", async (ctx) => {
    console.log("QUEUE COMMAND RECEIVED");
    await ctx.reply("QUEUE COMMAND RECEIVED");
    await queue.showQueue(ctx);
  });

  bot.command("merge_queue", (ctx) =>
    mergeQueue.showQueue(ctx),
  );

  const topQueue = registerPublishQueue(
    listPublishQueue,
    getTeacherPublishDetail,
    publishTeacher,
    teacherRepo,
    container.sessionStore,
    "top",
    "top",
    env,
  );

  bot.command("top", async (ctx) => {
    if (!ctx.from) return;
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    await topQueue.showQueue(ctx, 0);
  });

  bot.callbackQuery(/^top:list:(\d+)$/, async (ctx) => {
    const [, pageStr] = ctx.match as unknown as [string, string];
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    await topQueue.showQueue(ctx, Number(pageStr) || 0);
  });

  bot.callbackQuery(/^top:view:(.+):(\d+)$/, async (ctx) => {
    const [, teacherId, pageStr] = ctx.match as unknown as [string, string, string];
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    await topQueue.showDetail(ctx, teacherId, Number(pageStr) || 0);
  });

  bot.callbackQuery(/^top:confirm:(.+)$/, async (ctx) => {
    const [, teacherId] = ctx.match as unknown as [string, string];
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    await topQueue.handlePublish(ctx, teacherId);
  });

  bot.callbackQuery(/^top:reject:(.+)$/, async (ctx) => {
    const [, teacherId] = ctx.match as unknown as [string, string];
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    await topQueue.handleReject(ctx, teacherId);
  });

  bot.callbackQuery("top:noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^assign_top:(.+):(\d+)$/, async (ctx) => {
    const [, teacherId, pageStr] = ctx.match as unknown as [string, string, string];
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;
    await teacherRepo.updateModerationTrack(teacherId, "top");
    await ctx.answerCallbackQuery({ text: "TOP navbatiga qo'shildi" });
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    await publishQueue.showQueue(ctx, Number(pageStr) || 0);
  });

  bot.callbackQuery(/^assign_general:(.+):(\d+)$/, async (ctx) => {
    const [, teacherId, pageStr] = ctx.match as unknown as [string, string, string];
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;
    await teacherRepo.updateModerationTrack(teacherId, "general");
    await ctx.answerCallbackQuery({ text: "Oddiy navbatga qaytarildi" });
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    await topQueue.showQueue(ctx, Number(pageStr) || 0);
  });
  bot.command("publish_queue", async (ctx) => {
    if (!ctx.from) return;

    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;

    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;

    await publishQueue.showQueue(ctx, 0);
  });

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

  bot.callbackQuery(/^publish:list:(\d+)$/, async (ctx) => {
    const [, pageStr] = ctx.match as unknown as [string, string];

    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;

    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;

    await publishQueue.showQueue(ctx, Number(pageStr) || 0);
  });

  bot.callbackQuery(/^publish:view:(.+):(\d+)$/, async (ctx) => {
    const [, teacherId, pageStr] = ctx.match as unknown as [string, string, string];

    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;

    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;

    await publishQueue.showDetail(ctx, teacherId, Number(pageStr) || 0);
  });

  bot.callbackQuery(/^edit_teacher:(.+):(\d+)$/, async (ctx) => {
    const [, teacherId, pageStr] = ctx.match as unknown as [string, string, string];
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    await publishQueue.startEdit(ctx, teacherId, Number(pageStr) || 0);
  });

  bot.on("message:text", async (ctx) => {
    const user = await userRepo.findByTelegramId(ctx.from!.id);
    if (!user) return;
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    await publishQueue.handleEditText(ctx, ctx.message.text);
  });

  bot.callbackQuery(/^publish:reject:(.+)$/, async (ctx) => {
    const [, teacherId] = ctx.match as unknown as [string, string];
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    await publishQueue.handleReject(ctx, teacherId);
  });

  bot.callbackQuery("publish:noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^publish:confirm:(.+)$/, async (ctx) => {
    const [, teacherId] = ctx.match as unknown as [string, string];

    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;

    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;

    await publishQueue.handlePublish(ctx, teacherId);
  });

  bot.callbackQuery(/^teachers:list:(\d+)$/, async (ctx) => {
    const [, pageStr] = ctx.match as unknown as [string, string];

    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;

    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;

    await publishedTeachers.showList(ctx, Number(pageStr) || 0);
  });

  bot.callbackQuery(/^teachers:view:(.+):(\d+)$/, async (ctx) => {
    const [, teacherId, pageStr] = ctx.match as unknown as [string, string, string];

    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;

    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;

    await publishedTeachers.showDetail(ctx, teacherId, Number(pageStr) || 0);  });

  bot.callbackQuery(/^orig_view:(.+):(\d+)$/, async (ctx) => {
    const [, teacherId] = ctx.match as unknown as [string, string, string];
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) return;
    (ctx as unknown as { moderatorUserId: string }).moderatorUserId = user.id;
    const detail = await getTeacherPublishDetail.execute({ teacherId, moderatorUserId: user.id });
    if (!detail) { await ctx.answerCallbackQuery({ text: "Topilmadi" }); return; }
    const parts: string[] = ["Original arizalar (tahrirlanmagan):", ""];
    for (const { recommendation: rec } of detail.recommendations) {
      if (rec.recommendationText) parts.push(`Nima uchun: ${rec.recommendationText}`);
      if (rec.achievementsText) parts.push(`Yutuqlar: ${rec.achievementsText}`);
      if (rec.teachingMethodsText) parts.push(`Metodlar: ${rec.teachingMethodsText}`);
      if (rec.studentImpactText) parts.push(`Tasir: ${rec.studentImpactText}`);
      if (rec.evidenceText) parts.push(`Dalillar: ${rec.evidenceText}`);
      if (rec.additionalInfo) parts.push(`Qoshimcha: ${rec.additionalInfo}`);
      parts.push("---");
    }
    await ctx.reply(parts.join("\n"));
    await ctx.answerCallbackQuery();
  });
  bot.callbackQuery("teachers:noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  return bot;
}
