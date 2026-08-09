import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { ListPublishedTeachersUseCase } from "../../../../application/use-cases/teacher/list-published-teachers.use-case";
import type { GetTeacherPublishDetailUseCase } from "../../../../application/use-cases/teacher/get-teacher-publish-detail.use-case";
import type { MediaRepositoryPort } from "../../../../application/ports/repositories/media.repository.port";
import type { Env } from "../../../config/env";
import { logger } from "../../../logging/logger";

export function registerPublishedTeachers(
  listPublishedTeachers: ListPublishedTeachersUseCase,
  getTeacherPublishDetail: GetTeacherPublishDetailUseCase,
  mediaRepo: MediaRepositoryPort,
  env: Env,
) {
  async function safeReply(ctx: Context, text: string, extra?: Parameters<Context["reply"]>[1]) {
    try {
      await ctx.reply(text, extra);
    } catch (err) {
      logger.error("published_teachers.reply_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    async showList(ctx: Context, page = 0) {
      let result;
      try {
        const moderatorUserId = (ctx as unknown as { moderatorUserId: string }).moderatorUserId;
        result = await listPublishedTeachers.execute({ moderatorUserId, page });
      } catch (err) {
        logger.error("published_teachers.list_failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "⚠️ Nashrdagi ustozlar yuklanmadi.");
        return;
      }

      if (result.total === 0) {
        await safeReply(ctx, "🗂 Nashrdagi ustozlar mavjud emas.");
        return;
      }

      const lines: string[] = [
        "📚 Nashrdagi ustozlar",
        `${result.total} ta ustoz topildi`,
        "",
      ];

      result.items.forEach((teacher, idx) => {
        const num = result.page * result.pageSize + idx + 1;
        lines.push(`${num}. ${teacher.fullName}`);
        lines.push(`📍 ${teacher.regionName ?? "-"} / ${teacher.districtName ?? "-"}`);
        lines.push(`🏫 ${teacher.school ?? "-"}`);
        lines.push("----------------");
      });

      const kb = new InlineKeyboard();
      result.items.forEach((teacher) => {
        kb.text("📂 Batafsil", `teachers:view:${teacher.id}:${result.page}`).row();
      });

      kb.text("⬅️ Orqaga", `teachers:list:${Math.max(0, result.page - 1)}`)
        .text(`Sahifa ${result.page + 1}/${result.totalPages}`, "teachers:noop")
        .text("Keyingi ➡️", `teachers:list:${Math.min(result.totalPages - 1, result.page + 1)}`);

      await safeReply(ctx, lines.join("\n"), { reply_markup: kb });
    },

    async showDetail(ctx: Context, teacherId: string, fromPage: number) {
      let detail;
      try {
        const moderatorUserId = (ctx as unknown as { moderatorUserId: string }).moderatorUserId;
        detail = await getTeacherPublishDetail.execute({ teacherId, moderatorUserId });
      } catch (err) {
        logger.error("published_teachers.detail_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "⚠️ Ustoz profili yuklanmadi.");
        return;
      }

      if (!detail) {
        await safeReply(ctx, "⚠️ Ustoz topilmadi.");
        return;
      }

      const { teacher } = detail;
      const lines: string[] = [
        `👤 ${teacher.fullName}`,
        `Region: ${teacher.regionName ?? "-"}`,
        `Tuman: ${teacher.districtName ?? "-"}`,
        `Maktab: ${teacher.school ?? "-"}`,
        `Fan: ${teacher.subject ?? "-"}`,
        `Lavozim: ${teacher.position ?? "-"}`,
        `Holat: ${teacher.publishStatus}`,
      ];

      const detailText = lines.join("\n");
      const kb = new InlineKeyboard().text("⬅️ Orqaga", `teachers:list:${fromPage}`);

      await safeReply(ctx, detailText, { reply_markup: kb });
      logger.info("published_teachers.public_recommendation_preview", {
        count: detail.recommendations.length,
      });
      await this.sendTeacherMedia(ctx, detail.recommendations.map((item) => item.recommendation.recommendationId));
    },

    async sendTeacherMedia(ctx: Context, recommendationIds: string[]) {
      const r2Bucket = (env as { R2_BUCKET?: R2Bucket }).R2_BUCKET;
      logger.info("published_teachers.media_debug", {
        recommendationIdsCount: recommendationIds.length,
      });

      if (recommendationIds.length === 0) {
        return;
      }

      const mediaItems = await mediaRepo.listByRecommendationIds(recommendationIds);
      logger.info("published_teachers.media_debug", {
        recommendationIdsCount: recommendationIds.length,
        mediaItemsCount: mediaItems.length,
      });

      if (mediaItems.length === 0) {
        return;
      }

      for (const media of mediaItems) {
        logger.info("published_teachers.media_row", {
          mediaId: media.id,
          mediaType: media.mediaType,
          objectKey: media.objectKey,
          storageProvider: media.storageProvider,
          hasTelegramFileId: Boolean(media.telegramFileId),
        });

        try {
          let sent = false;

          if (r2Bucket && media.objectKey) {
            const object = await r2Bucket.get(media.objectKey);
            if (object) {
              const bytes = new Uint8Array(await object.arrayBuffer());
              const filename = media.objectKey.split("/").pop() ?? "media";

              if (media.mediaType === "photo") {
                await ctx.replyWithPhoto(new InputFile(bytes, filename));
                sent = true;
              } else if (media.mediaType === "video") {
                await ctx.replyWithVideo(new InputFile(bytes, filename));
                sent = true;
              }
            } else {
              logger.warn("published_teachers.media_r2_object_not_found", {
                mediaId: media.id,
                objectKey: media.objectKey,
              });
            }
          }

          if (!sent && media.telegramFileId) {
            if (media.mediaType === "photo") {
              await ctx.replyWithPhoto(media.telegramFileId);
              sent = true;
            } else if (media.mediaType === "video") {
              await ctx.replyWithVideo(media.telegramFileId);
              sent = true;
            }
          }

          if (!sent) {
            logger.warn("published_teachers.media_not_sent", {
              mediaId: media.id,
              reason: media.objectKey
                ? "R2 object missing and no telegramFileId"
                : "No objectKey and no telegramFileId",
            });
          }
        } catch (err) {
          logger.error("published_teachers.media_send_failed", {
            mediaId: media.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
  };
}
