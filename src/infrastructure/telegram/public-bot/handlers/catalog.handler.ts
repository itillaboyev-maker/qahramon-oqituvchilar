import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { GetPublicTeacherCatalogUseCase } from "../../../../application/use-cases/teacher/get-public-teacher-catalog.use-case";
import type { GetPublicTeacherProfileUseCase } from "../../../../application/use-cases/teacher/get-public-teacher-profile.use-case";
import type { Env } from "../../../config/env";
import { logger } from "../../../logging/logger";

/**
 * Public "рџ‘ЁвЂЌрџЏ« Ustozlar" catalog. Unauthenticated вЂ” every list here is already
 * scoped to publishStatus="published" inside GetPublicTeacherCatalogUseCase /
 * GetPublicTeacherProfileUseCase, so this handler only needs to render.
 *
 * Callback data stays short and ID-only (Telegram's 64-byte limit):
 *   catalog:regions
 *   catalog:region:<regionId>
 *   catalog:district:<districtId>:<page>
 *   catalog:teacher:<teacherId>
 */
export function registerCatalog(
  getCatalog: GetPublicTeacherCatalogUseCase,
  getProfile: GetPublicTeacherProfileUseCase,
  env: Env,
) {
  async function safeReply(ctx: Context, text: string, extra?: Parameters<Context["reply"]>[1]) {
    try {
      await ctx.reply(text, extra);
    } catch (err) {
      logger.error("catalog.reply_failed", { err: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    async showRegions(ctx: Context) {
      let regions;
      try {
        regions = await getCatalog.listRegions();
      } catch (err) {
        logger.error("catalog.list_regions_failed", { err: err instanceof Error ? err.message : String(err) });
        await safeReply(ctx, "вљ пёЏ Ustozlar ro'yxati yuklanmadi. Birozdan so'ng qayta urinib ko'ring.");
        return;
      }

      if (regions.length === 0) {
        await safeReply(ctx, "рџ—‚ Hozircha nashr qilingan ustozlar mavjud emas.");
        return;
      }

      const kb = new InlineKeyboard();
      regions.forEach((region) => {
        kb.text(`${region.name} (${region.publishedTeacherCount})`, `catalog:region:${region.id}`).row();
      });

      await safeReply(ctx, "рџ‘ЁвЂЌрџЏ« Ustozlar\n\nViloyatni tanlang:", { reply_markup: kb });
    },

    async showDistricts(ctx: Context, regionId: string) {
      let districts;
      try {
        districts = await getCatalog.listDistricts(regionId);
      } catch (err) {
        logger.error("catalog.list_districts_failed", {
          regionId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "вљ пёЏ Tumanlar ro'yxati yuklanmadi.");
        return;
      }

      if (districts.length === 0) {
        await safeReply(ctx, "рџ—‚ Bu viloyatda hozircha nashr qilingan ustozlar mavjud emas.");
        return;
      }

      const kb = new InlineKeyboard();
      districts.forEach((district) => {
        kb.text(`${district.name} (${district.publishedTeacherCount})`, `catalog:district:${district.id}:0`).row();
      });
      kb.text("в¬…пёЏ Viloyatlar", "catalog:regions");

      await safeReply(ctx, "Tuman/Shaharni tanlang:", { reply_markup: kb });
    },

    async showTeachers(ctx: Context, districtId: string, page: number) {
      let result;
      try {
        result = await getCatalog.listTeachers(districtId, page);
      } catch (err) {
        logger.error("catalog.list_teachers_failed", {
          districtId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "вљ пёЏ Ustozlar ro'yxati yuklanmadi.");
        return;
      }

      if (result.total === 0) {
        await safeReply(ctx, "рџ—‚ Bu tumanda hozircha nashr qilingan ustozlar mavjud emas.", {
          reply_markup: new InlineKeyboard().text("в¬…пёЏ Viloyatlar", "catalog:regions"),
        });
        return;
      }

      const kb = new InlineKeyboard();
      result.items.forEach((teacher) => {
        kb.text(teacher.fullName, `catalog:teacher:${teacher.id}`).row();
      });

      if (result.totalPages > 1) {
        kb.text("в¬…пёЏ", `catalog:district:${districtId}:${Math.max(0, result.page - 1)}`)
          .text(`${result.page + 1}/${result.totalPages}`, "catalog:noop")
          .text("вћЎпёЏ", `catalog:district:${districtId}:${Math.min(result.totalPages - 1, result.page + 1)}`)
          .row();
      }
      kb.text("в¬…пёЏ Viloyatlar", "catalog:regions");

      await safeReply(ctx, `рџ‘ЁвЂЌрџЏ« Ustozlar (${result.total} ta):`, { reply_markup: kb });
    },

    async showProfile(ctx: Context, teacherId: string) {
      let profile;
      try {
        profile = await getProfile.execute({ teacherId });
      } catch (err) {
        logger.error("catalog.get_profile_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "вљ пёЏ Ustoz profili yuklanmadi.");
        return;
      }

      if (!profile) {
        await safeReply(ctx, "вљ пёЏ Ustoz topilmadi yoki hali nashr qilinmagan.", {
          reply_markup: new InlineKeyboard().text("в¬…пёЏ Viloyatlar", "catalog:regions"),
        });
        return;
      }

      const lines: string[] = [`рџ‘¤ ${profile.fullName}`];
      if (profile.regionName || profile.districtName) {
        lines.push(`рџ“Ќ ${profile.regionName ?? "-"} / ${profile.districtName ?? "-"}`);
      }
      if (profile.school) lines.push(`рџЏ« ${profile.school}`);
      if (profile.subject) lines.push(`рџ“ Fan: ${profile.subject}`);
      if (profile.position) lines.push(`рџ’ј Lavozim: ${profile.position}`);
      if (profile.yearsOfExperience != null) lines.push(`вЏі Tajriba: ${profile.yearsOfExperience} yil`);
      if (profile.biography) lines.push(`\n${profile.biography}`);
      if (profile.achievements) lines.push(`\nрџЏ† Yutuqlari:\n${profile.achievements}`);
      if (profile.educationalPhilosophy) lines.push(`\nрџ’Ў Ta'lim falsafasi:\n${profile.educationalPhilosophy}`);
      if (profile.impactStories) lines.push(`\nвњЁ Hikoyalar:\n${profile.impactStories}`);

      const kb = new InlineKeyboard().text("в¬…пёЏ Viloyatlar", "catalog:regions");
      await safeReply(ctx, lines.join("\n"), { reply_markup: kb });

      await this.sendProfileMedia(ctx, profile.media);
    },

    async sendProfileMedia(ctx: Context, media: { id: string; mediaType: string; objectKey: string | null; telegramFileId: string | null }[]) {
      if (media.length === 0) return;

      const r2Bucket = (env as { R2_BUCKET?: R2Bucket }).R2_BUCKET;

      for (const item of media) {
        try {
          let sent = false;

          if (r2Bucket && item.objectKey) {
            const object = await r2Bucket.get(item.objectKey);
            if (object) {
              const bytes = new Uint8Array(await object.arrayBuffer());
              const filename = item.objectKey.split("/").pop() ?? "media";
              if (item.mediaType === "photo") {
                await ctx.replyWithPhoto(new InputFile(bytes, filename));
                sent = true;
              } else if (item.mediaType === "video") {
                await ctx.replyWithVideo(new InputFile(bytes, filename));
                sent = true;
              }
            }
          }

          if (!sent && item.telegramFileId) {
            const publicBotToken = (env as { PUBLIC_BOT_TOKEN?: string }).PUBLIC_BOT_TOKEN;
            if (publicBotToken) {
              const fileRes = await fetch(
                `https://api.telegram.org/bot${publicBotToken}/getFile?file_id=${item.telegramFileId}`,
              );
              const fileData = (await fileRes.json()) as any;
              if (fileData.ok && fileData.result?.file_path) {
                const downloadUrl = `https://api.telegram.org/file/bot${publicBotToken}/${fileData.result.file_path}`;
                const binaryRes = await fetch(downloadUrl);
                if (binaryRes.ok) {
                  const bytes = new Uint8Array(await binaryRes.arrayBuffer());
                  const filename = fileData.result.file_path.split("/").pop() ?? "media";
                  if (item.mediaType === "photo") {
                    await ctx.replyWithPhoto(new InputFile(bytes, filename));
                  } else if (item.mediaType === "video") {
                    await ctx.replyWithVideo(new InputFile(bytes, filename));
                  }
                }
              }
            }
          }
        } catch (err) {
          logger.error("catalog.media_send_failed", {
            mediaId: item.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
  };
}