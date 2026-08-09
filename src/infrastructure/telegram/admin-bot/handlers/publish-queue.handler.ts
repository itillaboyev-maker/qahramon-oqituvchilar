import { InlineKeyboard, type Context } from "grammy";
import type { ListPublishQueueUseCase } from "../../../../application/use-cases/teacher/list-publish-queue.use-case";
import type { GetTeacherPublishDetailUseCase } from "../../../../application/use-cases/teacher/get-teacher-publish-detail.use-case";
import type { PublishTeacherUseCase } from "../../../../application/use-cases/teacher/publish-teacher.use-case";
import { logger } from "../../../logging/logger";

export function registerPublishQueue(
  listPublishQueue: ListPublishQueueUseCase,
  getTeacherPublishDetail: GetTeacherPublishDetailUseCase,
  publishTeacher: PublishTeacherUseCase,
) {
  async function safeReply(
    ctx: Context,
    text: string,
    extra?: Parameters<Context["reply"]>[1],
  ) {
    try {
      await ctx.reply(text, extra);
    } catch (err) {
      logger.error("publish_queue.reply_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function moderatorUserIdOf(ctx: Context): string {
    return (ctx as unknown as { moderatorUserId: string }).moderatorUserId;
  }

  return {
    async showQueue(ctx: Context, page = 0) {
      const moderatorUserId = moderatorUserIdOf(ctx);

      let result;
      try {
        result = await listPublishQueue.execute({ moderatorUserId, page });
      } catch (err) {
        logger.error("publish_queue.list_failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "⚠️ Failed to load the publish queue.");
        return;
      }

      if (result.total === 0) {
        await safeReply(ctx, "🗂 Publish queue is empty.");
        return;
      }

      const lines: string[] = [
        "📢 Publish Queue",
        "Review:",
        `${result.total} teachers`,
        "",
      ];

      result.items.forEach((entry, idx) => {
        const num = result.page * result.pageSize + idx + 1;
        lines.push(`${num}.`);
        lines.push(`👤 ${entry.teacher.fullName}`);
        if (entry.teacher.school) lines.push(`🏫 ${entry.teacher.school}`);
        if (entry.teacher.regionName) lines.push(`📍 ${entry.teacher.regionName}`);
        lines.push(`📊 ${entry.independentRecommendationCount} recommendations`);
        lines.push(`Status: ${entry.teacher.publishStatus}`);
        lines.push("----------------");
      });

      const kb = new InlineKeyboard();
      result.items.forEach((entry) => {
        kb.text("📂 Open", `publish:view:${entry.teacher.id}:${result.page}`).row();
      });

      kb.text("⬅️ Previous", `publish:list:${Math.max(0, result.page - 1)}`)
        .text(`Page ${result.page + 1}/${result.totalPages}`, "publish:noop")
        .text("Next ➡️", `publish:list:${Math.min(result.totalPages - 1, result.page + 1)}`);

      await safeReply(ctx, lines.join("\n"), { reply_markup: kb });
    },

    async showDetail(ctx: Context, teacherId: string, fromPage: number) {
      const moderatorUserId = moderatorUserIdOf(ctx);

      let detail;
      try {
        detail = await getTeacherPublishDetail.execute({ teacherId, moderatorUserId });
      } catch (err) {
        logger.error("publish_queue.detail_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "⚠️ Failed to load teacher profile.");
        return;
      }

      if (!detail) {
        await safeReply(ctx, "⚠️ Teacher not found.");
        return;
      }

      const { teacher } = detail;
      const lines: string[] = [
        `👤 ${teacher.fullName}`,
        `Region: ${teacher.regionName ?? "-"}`,
        `District: ${teacher.districtName ?? "-"}`,
        `School: ${teacher.school ?? "-"}`,
        `Subject: ${teacher.subject ?? "-"}`,
        `Position: ${teacher.position ?? "-"}`,
        `Current publish status: ${teacher.publishStatus}`,
        "",
        `Independent recommendations: ${detail.independentRecommendationCount}`,
        "",
      ];

      if (detail.recommendations.length > 0) {
        lines.push("Public content:");
        for (const { mediaSummary } of detail.recommendations) {
          lines.push(`- Approved public profile content`);
          lines.push(`  🖼 ${mediaSummary}`);
          lines.push("");
        }
      }

      const kb = new InlineKeyboard()
        .text("⬅️ Back", `publish:list:${fromPage}`)
        .text("📢 Publish", `publish:confirm:${teacher.id}`);

      await safeReply(ctx, lines.join("\n"), { reply_markup: kb });
    },

    async handlePublish(ctx: Context, teacherId: string) {
      const moderatorUserId = moderatorUserIdOf(ctx);

      try {
        await publishTeacher.execute({ teacherId, moderatorUserId });
      } catch (err) {
        logger.error("publish_queue.publish_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        await ctx.answerCallbackQuery({
          text: (err as Error).message,
          show_alert: true,
        });
        return;
      }

      await ctx.answerCallbackQuery({ text: "Published" });

      try {
        await ctx.editMessageText("✅ Teacher profile published successfully.", {
          reply_markup: { inline_keyboard: [] },
        });
      } catch (err) {
        logger.error("publish_queue.edit_message_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "✅ Teacher profile published successfully.");
      }
    },
  };
}