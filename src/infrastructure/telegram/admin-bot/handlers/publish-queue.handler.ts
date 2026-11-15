import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { ListPublishQueueUseCase } from "../../../../application/use-cases/teacher/list-publish-queue.use-case";
import type { GetTeacherPublishDetailUseCase } from "../../../../application/use-cases/teacher/get-teacher-publish-detail.use-case";
import type { PublishTeacherUseCase } from "../../../../application/use-cases/teacher/publish-teacher.use-case";
import type { SessionStorePort } from "../../../../application/ports/session/session-store.port";
import type { TeacherRepositoryPort } from "../../../../application/ports/repositories/teacher.repository.port";
import { logger } from "../../../logging/logger";

type EditField = "biography" | "achievements" | "educationalPhilosophy" | "impactStories";

const EDIT_FIELD_MENU: { key: EditField; label: string }[] = [
  { key: "biography", label: "1 - Hikoya / tarjimai hol" },
  { key: "achievements", label: "2 - Yutuqlari" },
  { key: "educationalPhilosophy", label: "3 - Pedagogik falsafasi" },
  { key: "impactStories", label: "4 - Shogirdlariga tasiri" },
];

const EDIT_FIELD_BY_NUMBER: Record<string, EditField> = {
  "1": "biography",
  "2": "achievements",
  "3": "educationalPhilosophy",
  "4": "impactStories",
};

export function registerPublishQueue(
  listPublishQueue: ListPublishQueueUseCase,
  getTeacherPublishDetail: GetTeacherPublishDetailUseCase,
  publishTeacher: PublishTeacherUseCase,
  teacherRepo: TeacherRepositoryPort,
  sessionStore: SessionStorePort,
  queueKey: "publish" | "top",
  track: "general" | "top",
  env: unknown,
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

  async function safeAnswerCallbackQuery(ctx: Context) {
    try {
          await safeAnswerCallbackQuery(ctx);
    } catch (err) {
      logger.error("publish_queue.answer_callback_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function updateEditField(id: string, field: EditField, value: string) {
    switch (field) {
      case "biography":
        return teacherRepo.updateBiography(id, value);
      case "achievements":
        return teacherRepo.updateAchievements(id, value);
      case "educationalPhilosophy":
        return teacherRepo.updateEducationalPhilosophy(id, value);
      case "impactStories":
        return teacherRepo.updateImpactStories(id, value);
    }
  }

  const api = {
    async showQueue(ctx: Context, page = 0) {
      const moderatorUserId = moderatorUserIdOf(ctx);

      let result;
      try {
        result = await listPublishQueue.execute({ moderatorUserId, page, track });
      } catch (err) {
        logger.error("publish_queue.list_failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "Failed to load the publish queue.");
        return;
      }

      if (result.total === 0) {
        await safeReply(ctx, "Publish queue is empty.");
        return;
      }

      const lines: string[] = [
        "Publish Queue",
        "Review:",
        `${result.total} teachers`,
        "",
      ];

      result.items.forEach((entry, idx) => {
        const num = result.page * result.pageSize + idx + 1;
        lines.push(`${num}.`);
        lines.push(`${entry.teacher.fullName}`);
        if (entry.teacher.school) lines.push(`School: ${entry.teacher.school}`);
        if (entry.teacher.regionName) lines.push(`Region: ${entry.teacher.regionName}`);
        if (entry.teacher.districtName) lines.push(`District: ${entry.teacher.districtName}`);
        lines.push(`Recommendations: ${entry.independentRecommendationCount}`);
        lines.push(`Status: ${entry.teacher.publishStatus}`);
        lines.push("----------------");
      });

      const kb = new InlineKeyboard();
      result.items.forEach((entry) => {
        kb.text("Open", `${queueKey}:view:${entry.teacher.id}:${result.page}`).row();
      });

      kb.text("Previous", `${queueKey}:list:${Math.max(0, result.page - 1)}`)
        .text(`Page ${result.page + 1}/${result.totalPages}`, `${queueKey}:noop`)
        .text("Next", `${queueKey}:list:${Math.min(result.totalPages - 1, result.page + 1)}`);

      const MAX = 3800;
      const chunks: string[] = [];
      let current = "";
      for (const line of lines) {
        if (current && (current + "\n" + line).length > MAX) {
          chunks.push(current);
          current = line;
        } else {
          current = current ? current + "\n" + line : line;
        }
      }
      if (current) chunks.push(current);

      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        await safeReply(ctx, chunks[i]!, isLast ? { reply_markup: kb } : undefined);
      }
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
        await safeReply(ctx, "Failed to load teacher profile.");
        return;
      }

      if (!detail) {
        await safeReply(ctx, "Teacher not found.");
        return;
      }

      const { teacher } = detail;
      const lines: string[] = [
        `${teacher.fullName}`,
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
        detail.recommendations.forEach((item, idx) => {
          const r = item.recommendation;
          lines.push(`--- Tavsiya #${idx + 1} ---`);
          if (r.recommenderName) lines.push(`Tavsiya qiluvchi: ${r.recommenderName}`);
          if (r.recommenderPhone) lines.push(`Tavsiyachi tel: ${r.recommenderPhone}`);
          if (r.teacherPhone) lines.push(`Ustoz tel: ${r.teacherPhone}`);
          if (r.relationship) lines.push(`Munosabat: ${String(r.relationship)}`);
          if (r.experienceYearsText) lines.push(`Ish staji: ${r.experienceYearsText}`);
          if (r.achievementsText) lines.push(`Yutuqlari: ${r.achievementsText}`);
          if (r.studentImpactText) lines.push(`Shogirdlari yutuqlari: ${r.studentImpactText}`);
          if (r.teachingMethodsText) lines.push(`Metodikasi: ${r.teachingMethodsText}`);
          if (r.recommendationText) lines.push(`Hikoya: ${r.recommendationText}`);
          if (r.evidenceText) lines.push(`Dalil: ${r.evidenceText}`);
          if (r.additionalInfo) lines.push(`Qo'shimcha: ${r.additionalInfo}`);
          lines.push(`Media: ${item.mediaSummary}`);
          lines.push("");
        });
      }

      const kb = new InlineKeyboard()
        .text("Back", `${queueKey}:list:${fromPage}`)
        .row()
        .text("Publish", `${queueKey}:confirm:${teacher.id}`)
        .text("Reject", `${queueKey}:reject:${teacher.id}`)
        .row()
        .text("Edit", `edit_teacher:${teacher.id}:${fromPage}`)
        .text("View recommendations", `orig_view:${teacher.id}:${fromPage}`)
        .row()
        .text("⭐ Top'ga belgilash", `assign_top:${teacher.id}:${fromPage}`)
        .text("↩️ Oddiy navbat", `assign_general:${teacher.id}:${fromPage}`);

      const MAX = 3800;
      const pieces: string[] = [];
      for (const line of lines) {
        let l = line;
        while (l.length > MAX) {
          pieces.push(l.slice(0, MAX));
          l = l.slice(MAX);
        }
        pieces.push(l);
      }
      const chunks: string[] = [];
      let current = "";
      for (const piece of pieces) {
        if (current && (current + "\n" + piece).length > MAX) {
          chunks.push(current);
          current = piece;
        } else {
          current = current ? current + "\n" + piece : piece;
        }
      }
      if (current) chunks.push(current);
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        await safeReply(ctx, chunks[i]!, isLast ? { reply_markup: kb } : undefined);
      }

      const r2Bucket = (env as { R2_BUCKET?: R2Bucket }).R2_BUCKET;
      const mediaList = detail.recommendations.flatMap((r) => r.media);
      for (const media of mediaList) {
        try {
          if (r2Bucket && media.objectKey) {
            const object = await r2Bucket.get(media.objectKey);
            if (object) {
              const bytes = new Uint8Array(await object.arrayBuffer());
              const filename = media.objectKey.split("/").pop() ?? "media";
              if (media.mediaType === "photo") {
                await ctx.replyWithPhoto(new InputFile(bytes, filename));
              } else if (media.mediaType === "video") {
                await ctx.replyWithVideo(new InputFile(bytes, filename));
              }
              continue;
            }
          }
          if (media.telegramFileId) {
            let sent = false;
            try {
              if (media.mediaType === "photo") {
                await ctx.replyWithPhoto(media.telegramFileId);
                sent = true;
              } else if (media.mediaType === "video") {
                await ctx.replyWithVideo(media.telegramFileId);
                sent = true;
              }
            } catch {
              // file_id belongs to the public bot - download via its token below
            }
            if (!sent) {
              const publicToken = (env as { PUBLIC_BOT_TOKEN?: string }).PUBLIC_BOT_TOKEN;
              if (publicToken) {
                const meta = await fetch(
                  `https://api.telegram.org/bot${publicToken}/getFile?file_id=${encodeURIComponent(media.telegramFileId)}`,
                );
                const metaJson = (await meta.json()) as { ok: boolean; result?: { file_path?: string } };
                const filePath = metaJson.ok ? metaJson.result?.file_path : undefined;
                if (filePath) {
                  const file = await fetch(`https://api.telegram.org/file/bot${publicToken}/${filePath}`);
                  const bytes = new Uint8Array(await file.arrayBuffer());
                  const filename = filePath.split("/").pop() ?? "media";
                  if (media.mediaType === "photo") await ctx.replyWithPhoto(new InputFile(bytes, filename));
                  else if (media.mediaType === "video") await ctx.replyWithVideo(new InputFile(bytes, filename));
                }
              }
            }
          }
        } catch (err) {
          logger.error("publish_queue.media_send_failed", {
            teacherId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },

        async handlePublish(ctx: Context, teacherId: string) {
      const userId = moderatorUserIdOf(ctx);
      if (!userId) return;

           await safeAnswerCallbackQuery(ctx);

      let existingExperienceYears: number | null = null;
      try {
        const detail = await getTeacherPublishDetail.execute({ teacherId, moderatorUserId: userId });
        if (detail) {
          for (const { recommendation } of detail.recommendations) {
            const text = recommendation.experienceYearsText;
            if (text) {
              const match = text.match(/\d{1,3}/);
              const parsed = match ? Number(match[0]) : NaN;
              if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 80) {
                existingExperienceYears = parsed;
                break;
              }
            }
          }
        }
      } catch (err) {
        logger.error("publish_queue.detail_lookup_failed_in_publish", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
      }

      if (existingExperienceYears !== null) {
        try {
          await teacherRepo.updateYearsOfExperience(teacherId, existingExperienceYears);
          await publishTeacher.execute({ teacherId, moderatorUserId: userId });
        } catch (err) {
          logger.error("publish_queue.publish_failed", {
            teacherId,
            err: err instanceof Error ? err.message : String(err),
          });
          await safeReply(ctx, `Xatolik: ${(err as Error).message}`);
          return;
        }
        await safeReply(ctx, `Ustoz profili nashr qilindi (ish staji: ${existingExperienceYears} yil, nomination arizasidan olindi).`);
        return;
      }

      const existing = await sessionStore.get(userId, "admin");
      const session = existing ?? (await sessionStore.start(userId, "admin", "admin_input"));
      await sessionStore.update(session.id, {
        currentStep: "await_experience_for_publish",
        collectedData: { ...session.collectedData, publishTeacherId: teacherId },
      });

      await safeReply(ctx, "Ustozning aniq necha yillik ish staji bor? Bitta raqam kiriting (masalan: 12).");
    },

    async handleReject(ctx: Context, teacherId: string) {
           await safeAnswerCallbackQuery(ctx);

      try {
        const teacher = await teacherRepo.findById(teacherId);
        if (!teacher) {
          await safeReply(ctx, "Ustoz topilmadi.");
          return;
        }

        await teacherRepo.updatePublishStatus(teacherId, "draft");
        await safeReply(
          ctx,
          `${teacher.fullName} profili rad etildi va qoralama (draft) holatiga qaytarildi. Malumotlar saqlanib qoldi.`,
        );
      } catch (err) {
        logger.error("publish_queue.reject_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, `Xatolik: ${(err as Error).message}`);
        return;
      }

      await api.showQueue(ctx, 0);
    },

        async startEdit(ctx: Context, teacherId: string, fromPage: number) {
      const userId = moderatorUserIdOf(ctx);
      if (!userId) return;

         await safeAnswerCallbackQuery(ctx);

      const existing = await sessionStore.get(userId, "admin");
      const session = existing ?? (await sessionStore.start(userId, "admin", "admin_input"));
      await sessionStore.update(session.id, {
        currentStep: "await_edit_field",
        collectedData: {
          ...session.collectedData,
          editTeacherId: teacherId,
          editFromPage: fromPage,
        },
      });

      const menu = EDIT_FIELD_MENU.map((f) => f.label).join("\n");
      await safeReply(ctx, `Qaysi bolimni tahrirlaysiz? Raqamini yuboring:\n\n${menu}`);
    },

         async handleEditText(ctx: Context, text: string): Promise<boolean> {
      const userId = moderatorUserIdOf(ctx);
      if (!userId) return false;

      const session = await sessionStore.get(userId, "admin");
      logger.info("debug_edit_text", {
        userId,
        found: !!session,
        flowType: session?.flowType,
        currentStep: session?.currentStep,
      });
      if (!session || session.flowType !== "admin_input") return false;

      const data = session.collectedData as {
        editTeacherId?: string;
        editFromPage?: number;
        editField?: EditField;
      };

      if (session.currentStep === "await_edit_field") {
        if (!data.editTeacherId) return false;

        const field = EDIT_FIELD_BY_NUMBER[text.trim()];
        if (!field) {
          await safeReply(ctx, "Iltimos, 1 dan 4 gacha raqam yuboring.");
          return true;
        }

        await sessionStore.update(session.id, {
          currentStep: "await_edit_text",
          collectedData: { ...data, editField: field },
        });

        await safeReply(ctx, "Yangi matnni yuboring:");
        return true;
      }

      if (session.currentStep === "await_edit_text") {
        if (!data.editTeacherId || !data.editField) {
          await safeReply(ctx, "Xatolik: qaytadan boshlang.");
          await sessionStore.update(session.id, { currentStep: null });
          return true;
        }

        try {
          await updateEditField(data.editTeacherId, data.editField, text.trim());
        } catch (err) {
          logger.error("publish_queue.edit_failed", {
            teacherId: data.editTeacherId,
            field: data.editField,
            err: err instanceof Error ? err.message : String(err),
          });
          await safeReply(ctx, `Xatolik: ${(err as Error).message}`);
          await sessionStore.update(session.id, { currentStep: null });
          return true;
        }

        await sessionStore.update(session.id, { currentStep: null });
        await safeReply(ctx, "Malumot yangilandi.");

        const moderatorUserId = moderatorUserIdOf(ctx);
        (ctx as unknown as { moderatorUserId: string }).moderatorUserId = moderatorUserId;
        await api.showDetail(ctx, data.editTeacherId, data.editFromPage ?? 0);
        return true;
      }

      return false;
    },

        async handlePublishExperienceText(ctx: Context, userId: string, text: string): Promise<boolean> {
      const sessionUserId = moderatorUserIdOf(ctx) || userId;
      const session = await sessionStore.get(sessionUserId, "admin");
      logger.info("debug_publish_experience", {
        sessionUserId,
        found: !!session,
        flowType: session?.flowType,
        currentStep: session?.currentStep,
      });
      if (!session || session.flowType !== "admin_input" || session.currentStep !== "await_experience_for_publish") {
        return false;
      }

      const teacherId = (session.collectedData as { publishTeacherId?: string })?.publishTeacherId;
      if (!teacherId) {
        await safeReply(ctx, "Xatolik: ustoz aniqlanmadi, qaytadan /publish_queue dan boshlang.");
        await sessionStore.update(session.id, { currentStep: null });
        return true;
      }

      const years = Number(text.trim());
      if (!Number.isInteger(years) || years < 0 || years > 80) {
        await safeReply(ctx, "Iltimos, bitta butun raqam kiriting (masalan: 12).");
        return true;
      }

      const moderatorUserId = moderatorUserIdOf(ctx);

      try {
        await teacherRepo.updateYearsOfExperience(teacherId, years);
        await publishTeacher.execute({ teacherId, moderatorUserId });
      } catch (err) {
        logger.error("publish_queue.publish_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, `Xatolik: ${(err as Error).message}`);
        await sessionStore.update(session.id, { currentStep: null });
        return true;
      }

      await sessionStore.update(session.id, { currentStep: null });
      await safeReply(ctx, `Ustoz profili nashr qilindi (ish staji: ${years} yil).`);
      return true;
    },
  };

  return api;
}