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


        console.log(
  "MEDIA COUNT:",
  mediaList.length,
  mediaList.map((m) => ({
    type: m.mediaType,
    objectKey: m.objectKey,
    telegramFileId: m.telegramFileId,
  })),
);

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

     
const r2Bucket = (env as { R2_BUCKET?: R2Bucket }).R2_BUCKET;
let sent = false;

for (const media of mediaList) {
  try {
    if (r2Bucket && media.objectKey) {
      const object = await r2Bucket.get(media.objectKey);

      if (object) {
        const bytes = new Uint8Array(await object.arrayBuffer());
        const filename = media.objectKey.split("/").pop() ?? "media";

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