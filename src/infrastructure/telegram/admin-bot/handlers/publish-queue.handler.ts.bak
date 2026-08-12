import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { ListPublishQueueUseCase } from "../../../../application/use-cases/teacher/list-publish-queue.use-case";
import type { GetTeacherPublishDetailUseCase } from "../../../../application/use-cases/teacher/get-teacher-publish-detail.use-case";
import type { PublishTeacherUseCase } from "../../../../application/use-cases/teacher/publish-teacher.use-case";
import type { TeacherRepositoryPort } from "../../../../application/ports/repositories/teacher.repository.port";
import type { SessionStorePort } from "../../../../application/ports/session/session-store.port";
import type { Env } from "../../../config/env";
import { logger } from "../../../logging/logger";

export function registerPublishQueue(
  listPublishQueue: ListPublishQueueUseCase,
  getTeacherPublishDetail: GetTeacherPublishDetailUseCase,
  publishTeacher: PublishTeacherUseCase, teacherRepo: TeacherRepositoryPort, sessionStore: SessionStorePort,
  env: Env,
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

  async function sendRecommendationMedia(
    ctx: Context,
    media: Array<{
      id: string;
      mediaType: string;
      objectKey?: string | null | undefined;
    }>,
  ) {
    const r2Bucket = (env as { R2_BUCKET?: R2Bucket }).R2_BUCKET;

    for (const item of media) {
      if (!item.objectKey) {
        logger.warn("publish_queue.media_missing_object_key", {
          mediaId: item.id,
        });
        continue;
      }

      if (!r2Bucket) {
        logger.warn("publish_queue.media_r2_bucket_unavailable", {
          mediaId: item.id,
        });
        continue;
      }

      try {
        const object = await r2Bucket.get(item.objectKey);
        if (!object) {
          logger.warn("publish_queue.media_r2_object_not_found", {
            mediaId: item.id,
            objectKey: item.objectKey,
          });
          continue;
        }

        const bytes = new Uint8Array(await object.arrayBuffer());
        const filename = item.objectKey.split("/").pop() ?? "media";

        if (item.mediaType === "photo") {
          await ctx.replyWithPhoto(new InputFile(bytes, filename));
        } else if (item.mediaType === "video") {
          await ctx.replyWithVideo(new InputFile(bytes, filename));
        }
      } catch (err) {
        logger.error("publish_queue.media_send_failed", {
          mediaId: item.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    async startEdit(ctx: Context, teacherId: string, fromPage: number) {
      const moderatorUserId = moderatorUserIdOf(ctx);
      const session = await sessionStore.start(moderatorUserId, "admin", "teacher_edit");
      await sessionStore.update(session.id, { collectedData: { teacherId, fromPage } });
      await safeReply(ctx, "Yangi matnni yuboring. Bekor qilish uchun /cancel yozing.");
    },

    async handleEditText(ctx: Context, text: string): Promise<boolean> {
      const moderatorUserId = moderatorUserIdOf(ctx);
      const session = await sessionStore.get(moderatorUserId, "admin");
      if (!session || session.flowType !== "teacher_edit") return false;
      const data = session.collectedData as { teacherId?: string; fromPage?: number };
      if (!data.teacherId) { await sessionStore.clear(session.id); return false; }
      if (text.trim() === "/cancel") { await sessionStore.clear(session.id); await safeReply(ctx, "Tahrirlash bekor qilindi."); return true; }
      try {
        await teacherRepo.updateBiography(data.teacherId, text.trim());
      } catch (err) {
        logger.error("publish_queue.edit_save_failed", { teacherId: data.teacherId, err: err instanceof Error ? err.message : String(err) });
        await safeReply(ctx, "Matnni saqlashda xatolik yuz berdi.");
        return true;
      }
      await sessionStore.clear(session.id);
      await safeReply(ctx, "Matn yangilandi.");
      await this.showDetail(ctx, data.teacherId, data.fromPage ?? 0);
      return true;
    },
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
logger.info("publish_queue.media_debug", {
  teacherId: teacher.id,
  recommendations: detail.recommendations.map((r) => ({
  
    mediaCount: r.media.length,
    media: r.media.map((m) => ({
      id: m.id,
      mediaType: m.mediaType,
      objectKey: m.objectKey ?? null,
    })),
  })),
});
      await safeReply(ctx, lines.join("\n"), { reply_markup: kb });

      for (const recommendation of detail.recommendations) {
        if (recommendation.media.length > 0) {
          await sendRecommendationMedia(ctx, recommendation.media);
        }
      }
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