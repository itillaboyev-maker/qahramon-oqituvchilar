import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { ListPendingRecommendationsUseCase } from "../../../../application/use-cases/recommendation/list-pending-recommendations.use-case";
import type { ModerateRecommendationUseCase } from "../../../../application/use-cases/recommendation/moderate-recommendation.use-case";
import type { TeacherRepositoryPort } from "../../../../application/ports/repositories/teacher.repository.port";
import type { RecommendationRepositoryPort } from "../../../../application/ports/repositories/recommendation.repository.port";
import type { MediaRepositoryPort } from "../../../../application/ports/repositories/media.repository.port";
import type { Env } from "../../../config/env";

/**
 * Minimal shape of a recommendation needed to render a card.
 * Both the queue listing and a by-id lookup satisfy this shape.
 */
type RecommendationCard = {
  id: string;
  teacherId: string;
  relationship: string | null;
  recommendationText: string | null;
  recommenderName: string | null;
  recommenderPhone: string | null;
  additionalInfo: string | null;
};

function formatRecommendation(
  teacher: {
    fullName: string;
    school: string | null;
  },
  communityCount: number,
  r: RecommendationCard,
) {
  return [
    `👤 <b>${teacher.fullName}</b>`,
    teacher.school ? `🏫 ${teacher.school}` : null,
    `📊 Mustaqil tavsiyalar: <b>${communityCount}</b> ta`,
    r.recommenderName
      ? `👤 Tavsiya qiluvchi: ${r.recommenderName}`
      : null,
    r.recommenderPhone
      ? `📞 ${r.recommenderPhone}`
      : null,
    r.relationship
      ? `🤝 ${r.relationship}`
      : null,
    r.recommendationText
      ? `\n📝 ${r.recommendationText}`
      : null,
    r.additionalInfo
      ? `\nℹ ${r.additionalInfo}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function registerModerationQueue(
  listPending: ListPendingRecommendationsUseCase,
  moderate: ModerateRecommendationUseCase,
  teacherRepo: TeacherRepositoryPort,
  recommendationRepo: RecommendationRepositoryPort,
  mediaRepo: MediaRepositoryPort,
  env: Env,
) {
  /**
   * Single source of truth for rendering a recommendation card:
   * loads teacher + community count + media, sends R2 media with
   * telegramFileId fallback, and attaches the caption/keyboard exactly
   * once — regardless of whether it's called from the queue or a
   * direct review-by-id lookup.
   */
  async function sendRecommendationCard(
    ctx: Context,
    rec: RecommendationCard,
    kb: InlineKeyboard,
    headerLines: string[] = [],
  ) {
    const [teacher, communityCount, mediaList] = await Promise.all([
      teacherRepo.findById(rec.teacherId),
      recommendationRepo.countIndependentByTeacherId(rec.teacherId),
      mediaRepo.listByRecommendationIds([rec.id]),
    ]);

    const text = [
      ...headerLines,
      ...(headerLines.length ? [""] : []),
      formatRecommendation(
        teacher ?? { fullName: "Noma'lum", school: null },
        communityCount,
        rec,
      ),
    ].join("\n");

    const r2Bucket = (env as { R2_BUCKET?: R2Bucket }).R2_BUCKET;
    let sent = false;

    for (const media of mediaList) {
      try {
        if (r2Bucket && media.objectKey) {
          const object = await r2Bucket.get(media.objectKey);

          if (object) {
            const bytes = new Uint8Array(await object.arrayBuffer());
            const filename =
              media.objectKey.split("/").pop() ?? "media";

            if (media.mediaType === "photo") {
              await ctx.replyWithPhoto(
                new InputFile(bytes, filename),
                {
                  caption: !sent ? text : undefined,
                  parse_mode: "HTML",
                  reply_markup: !sent ? kb : undefined,
                },
              );
            } else if (media.mediaType === "video") {
              await ctx.replyWithVideo(
                new InputFile(bytes, filename),
                {
                  caption: !sent ? text : undefined,
                  parse_mode: "HTML",
                  reply_markup: !sent ? kb : undefined,
                },
              );
            }

            sent = true;
            continue;
          }
        }

        if (media.telegramFileId) {
          if (media.mediaType === "photo") {
            await ctx.replyWithPhoto(media.telegramFileId, {
              caption: !sent ? text : undefined,
              parse_mode: "HTML",
              reply_markup: !sent ? kb : undefined,
            });
          } else if (media.mediaType === "video") {
            await ctx.replyWithVideo(media.telegramFileId, {
              caption: !sent ? text : undefined,
              parse_mode: "HTML",
              reply_markup: !sent ? kb : undefined,
            });
          }

          sent = true;
        }
      } catch (err) {
        console.error("Media send failed:", err);
      }
    }

    if (!sent) {
      await ctx.reply(text, {
        parse_mode: "HTML",
        reply_markup: kb,
      });
    }
  }

  return {
    /**
     * Loads the newest NEW recommendation and renders it with a
     * "start review" keyboard. Never touched by the review flow anymore.
     */
    async showQueue(ctx: Context) {
      const { items, totalPending } = await listPending.execute(1);

      if (items.length === 0) {
        await ctx.reply("🗂 Navbat bo'sh. Yangi arizalar yo'q.");
        return;
      }

      const rec = items[0]!;
      const kb = new InlineKeyboard().text(
        "👀 Ko'rib chiqish",
        `mod:review:${rec.id}`,
      );

      await sendRecommendationCard(ctx, rec, kb, [
        `Navbatda: ${totalPending} ta ariza`,
      ]);
    },

    /**
     * Loads a recommendation BY ID regardless of its current status
     * (so moving it to under_review doesn't make it disappear), and
     * renders it with the approve/reject keyboard.
     */
    async showReview(ctx: Context, recommendationId: string) {
      const rec = (await recommendationRepo.findById(
        recommendationId,
      )) as RecommendationCard | null;

      if (!rec) {
        await ctx.reply("⚠️ Ariza topilmadi.");
        return;
      }

      const kb = new InlineKeyboard()
        .text("✅ Tasdiqlash", `mod:approve:${rec.id}`)
        .text("❌ Rad etish", `mod:reject:${rec.id}`);

      await sendRecommendationCard(ctx, rec, kb);
    },

    async handleAction(
      ctx: Context,
      action: "review" | "approve" | "reject",
      recommendationId: string,
    ) {
      const moderatorUserId =
        (ctx as unknown as {
          moderatorUserId: string;
        }).moderatorUserId;

      const actionMap = {
        review: "start_review",
        approve: "approve",
        reject: "reject",
      } as const;

      try {
        await moderate.execute({
          recommendationId,
          moderatorUserId,
          action: actionMap[action],
        });

        if (action === "review") {
          await ctx.answerCallbackQuery({
            text: "Ko'rib chiqish ochildi",
          });

          // Do NOT call showQueue() here — the item just moved to
          // under_review and would vanish from the "new" queue.
          await this.showReview(ctx, recommendationId);

          return;
        }

        await ctx.answerCallbackQuery({
          text:
            action === "approve"
              ? "Tasdiqlandi"
              : "Rad etildi",
        });

        await this.showQueue(ctx);
      } catch (err) {
        await ctx.answerCallbackQuery({
          text: (err as Error).message,
          show_alert: true,
        });
      }
    },
  };
}