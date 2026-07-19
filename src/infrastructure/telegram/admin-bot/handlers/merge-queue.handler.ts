import { InlineKeyboard, type Context } from "grammy";
import type { DuplicateCandidateRepositoryPort } from "../../../../application/ports/repositories/duplicate-candidate.repository.port";
import type { TeacherRepositoryPort } from "../../../../application/ports/repositories/teacher.repository.port";
import type { MergeTeachersUseCase } from "../../../../application/use-cases/teacher/merge-teachers.use-case";

/** Admin bot merge review queue (business rule F) — moderator has final say, always. */
export function registerMergeQueue(
  duplicateCandidateRepo: DuplicateCandidateRepositoryPort,
  teacherRepo: TeacherRepositoryPort,
  mergeTeachers: MergeTeachersUseCase,
) {
  return {
    async showQueue(ctx: Context) {
      const pending = await duplicateCandidateRepo.listPending(1);
      if (pending.length === 0) {
        await ctx.reply("🔗 Birlashtirish navbati bo'sh.");
        return;
      }

      const candidate = pending[0]!;
      const [teacherA, teacherB] = await Promise.all([
        teacherRepo.findById(candidate.teacherIdA),
        teacherRepo.findById(candidate.teacherIdB),
      ]);

      const kb = new InlineKeyboard()
        .text("✅ Bitta ustoz (birlashtirish)", `merge:confirm:${candidate.id}`).row()
        .text("❌ Ikki xil ustoz", `merge:dismiss:${candidate.id}`);

      await ctx.reply(
        `🔗 Ehtimoliy dublikat (ishonch: ${candidate.similarityScore})\n\n` +
          `A: <b>${teacherA?.fullName ?? "topilmadi"}</b> (${teacherA?.school ?? "-"})\n` +
          `B: <b>${teacherB?.fullName ?? "topilmadi"}</b> (${teacherB?.school ?? "-"})`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    },

    async handleDecision(ctx: Context, decision: "confirm" | "dismiss", candidateId: string) {
      const moderatorUserId = (ctx as unknown as { moderatorUserId: string }).moderatorUserId;
      try {
        const result = await mergeTeachers.execute({ duplicateCandidateId: candidateId, moderatorUserId, decision });
        const message = "dismissed" in result ? "Ikki xil ustoz deb belgilandi." : `Birlashtirildi (${result.reassignedCount} ta tavsiya ko'chirildi).`;
        await ctx.answerCallbackQuery({ text: message });
        await this.showQueue(ctx);
      } catch (err) {
        await ctx.answerCallbackQuery({ text: (err as Error).message, show_alert: true });
      }
    },
  };
}
