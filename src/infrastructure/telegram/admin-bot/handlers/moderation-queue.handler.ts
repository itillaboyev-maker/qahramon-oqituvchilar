import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { ListPendingRecommendationsUseCase } from "../../../../application/use-cases/recommendation/list-pending-recommendations.use-case";
import type { ModerateRecommendationUseCase } from "../../../../application/use-cases/recommendation/moderate-recommendation.use-case";
import type { TeacherRepositoryPort } from "../../../../application/ports/repositories/teacher.repository.port";
import type { RecommendationRepositoryPort } from "../../../../application/ports/repositories/recommendation.repository.port";
import type { MediaRepositoryPort } from "../../../../application/ports/repositories/media.repository.port";
import type { Env } from "../../../config/env";
function formatRecommendation(
  teacher: {
    fullName: string;
    school: string | null;
  },
  communityCount: number,
  r: {
    relationship: string | null;
    recommendationText: string | null;
    recommenderName: string | null;
    recommenderPhone: string | null;
    additionalInfo: string | null;
  },
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
  return {
   async showQueue(ctx: Context) {
      const { items, totalPending } =
        await listPending.execute(1);

      if (items.length === 0) {
        await ctx.reply(
          "🗂 Navbat bo'sh. Yangi arizalar yo'q.",
        );
        return;
      }

      const rec = items[0]!;

      const [teacher, communityCount, mediaList] =
        await Promise.all([
          
          teacherRepo.findById(rec.teacherId),
          recommendationRepo.countIndependentByTeacherId(
            rec.teacherId,
          ),
          mediaRepo.listByRecommendationIds([rec.id]),
        ]);
      const text = [
        `Navbatda: ${totalPending} ta ariza`,
        "",
        formatRecommendation(
          teacher ?? {
            fullName: "Noma'lum",
            school: null,
          },
          communityCount,
          rec,
        ),
      ].join("\n");

     const kb = new InlineKeyboard().text(
  "👀 Ko'rib chiqish",
  `mod:review:${rec.id}`,
);

      const photo = mediaList.find((m) => m.mediaType === "photo");

      let sentPhoto = false;
      const r2Bucket = (env as unknown as { R2_BUCKET?: R2Bucket }).R2_BUCKET;

      if (photo?.objectKey && r2Bucket) {
        try {
          const r2Object = await r2Bucket.get(photo.objectKey);
          if (r2Object) {
            const arrayBuffer = await r2Object.arrayBuffer();
            const filename = photo.objectKey.split("/").pop() ?? "photo.jpg";
            await ctx.replyWithPhoto(new InputFile(new Uint8Array(arrayBuffer), filename), {
              caption: text,
              parse_mode: "HTML",
              reply_markup: kb,
            });
            sentPhoto = true;
          }
        } catch (err) {
          console.error("R2 media send error:", err);
        }
      }

      if (!sentPhoto && photo?.telegramFileId) {
        try {
          await ctx.replyWithPhoto(photo.telegramFileId, {
            caption: text,
            parse_mode: "HTML",
            reply_markup: kb,
          });
          sentPhoto = true;
        } catch (err) {
          console.error("Telegram fallback photo send error:", err);
        }
      }

      // 3. Agar umuman rasm bo'lmasa yoki har ikkala usul ishlamasa — matn o'zini yuborish
      if (!sentPhoto) {
        await ctx.reply(text, {
          parse_mode: "HTML",
          reply_markup: kb,
        });
      }
    },

    async handleAction(
      ctx: Context,
      action: "review" | "approve" | "reject",
      recommendationId: string,
      env?: { R2_BUCKET?: R2Bucket },
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
    text: "Ko'rib chiqish ochilmoqda...",
  });

 const rec = await recommendationRepo.findById(recommendationId);

if (!rec) {
  await ctx.reply("❌ Ariza topilmadi");
  return;
}

const kb = new InlineKeyboard()
  .text(
    "✅ Tasdiqlash",
    `mod:approve:${rec.id}`,
  )
  .text(
    "❌ Rad etish",
    `mod:reject:${rec.id}`,
  );

await ctx.reply(
  [
    "📋 Ariza batafsil:",
    "",
    `🆔 ID: ${rec.id}`,
    `📌 Holat: ${rec.status}`,
    "",
    `📝 Tavsiya: ${rec.recommendationText ?? "-"}`,
    "",
    `👤 Tavsiya qiluvchi: ${rec.recommenderName ?? "-"}`,
    `📞 Telefon: ${rec.recommenderPhone ?? "-"}`,
  ].join("\n"),
  {
    reply_markup: kb,
  },
);

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
          text:
            (err as Error).message,
          show_alert: true,
        });
      }
    },
  };
}