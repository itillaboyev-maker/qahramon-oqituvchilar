import { InlineKeyboard, type Context } from "grammy";
import type { ListPendingRecommendationsUseCase } from "../../../../application/use-cases/recommendation/list-pending-recommendations.use-case";
import type { ModerateRecommendationUseCase } from "../../../../application/use-cases/recommendation/moderate-recommendation.use-case";
import type { TeacherRepositoryPort } from "../../../../application/ports/repositories/teacher.repository.port";
import type { RecommendationRepositoryPort } from "../../../../application/ports/repositories/recommendation.repository.port";

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
    `📊 Community signal: <b>${communityCount}</b> ta mustaqil tavsiya`,
    r.recommenderName ? `👤 Tavsiya qiluvchi: ${r.recommenderName}` : null,
    r.recommenderPhone ? `📞 ${r.recommenderPhone}` : null,
    r.relationship ? `🤝 ${r.relationship}` : null,
    r.recommendationText ? `\n📝 ${r.recommendationText}` : null,
    r.additionalInfo ? `\nℹ ${r.additionalInfo}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function registerModerationQueue(
  listPending: ListPendingRecommendationsUseCase,
  moderate: ModerateRecommendationUseCase,
  teacherRepo: TeacherRepositoryPort,
  recommendationRepo: RecommendationRepositoryPort,
) {
  return {
    async showQueue(ctx: Context) {
      const { items, totalPending } = await listPending.execute(1);

      if (items.length === 0) {
        await ctx.reply("🗂 Navbat bo'sh. Yangi arizalar yo'q.");
        return;
      }

      const rec = items[0]!;

      const [teacher, communityCount] = await Promise.all([
        teacherRepo.findById(rec.teacherId),
        recommendationRepo.countIndependentByTeacherId(rec.teacherId),
      ]);

      const kb = new InlineKeyboard()
        .text("👀 Ko'rib chiqish", `mod:review:${rec.id}`).row()
        .text("✅ Tasdiqlash", `mod:approve:${rec.id}`)
        .text("❌ Rad etish", `mod:reject:${rec.id}`);

      await ctx.reply(
        `Navbatda: ${totalPending} ta ariza\n\n${formatRecommendation(
          teacher ?? {
            fullName: "Noma'lum",
            school: null,
          },
          communityCount,
          rec,
        )}`,
        {
          parse_mode: "HTML",
          reply_markup: kb,
        },
      );
    },

    async handleAction(
      ctx: Context,
      action: "review" | "approve" | "reject",
      recommendationId: string,
    ) {
      const moderatorUserId = (ctx as unknown as {
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

        await ctx.answerCallbackQuery({ text: "Bajarildi" });
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