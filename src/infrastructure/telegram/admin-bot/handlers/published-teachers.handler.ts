import { InlineKeyboard, InputFile, type Context } from "grammy";
import type { ListPublishedTeachersUseCase } from "../../../../application/use-cases/teacher/list-published-teachers.use-case";
import type { GetTeacherPublishDetailUseCase } from "../../../../application/use-cases/teacher/get-teacher-publish-detail.use-case";
import type { MediaRepositoryPort } from "../../../../application/ports/repositories/media.repository.port";
import type { TeacherRepositoryPort, PublishedTeacherFilters } from "../../../../application/ports/repositories/teacher.repository.port";
import type { SessionStorePort } from "../../../../application/ports/session/session-store.port";
import type { Env } from "../../../config/env";
import { logger } from "../../../logging/logger";

type StoredFilters = {
  districtNameQuery?: string;
  subject?: string;
  minExperience?: number;
  maxExperience?: number;
  applicationDateFrom?: string;
  applicationDateTo?: string;
};

function toFilters(stored: StoredFilters | undefined): PublishedTeacherFilters {
  if (!stored) return {};
  return {
    districtNameQuery: stored.districtNameQuery,
    subject: stored.subject,
    minExperience: stored.minExperience,
    maxExperience: stored.maxExperience,
    applicationDateFrom: stored.applicationDateFrom ? new Date(stored.applicationDateFrom) : undefined,
    applicationDateTo: stored.applicationDateTo ? new Date(stored.applicationDateTo) : undefined,
  };
}

function hasActiveFilters(f: StoredFilters | undefined): boolean {
  if (!f) return false;
  return Boolean(
    f.districtNameQuery || f.subject || f.minExperience !== undefined ||
    f.maxExperience !== undefined || f.applicationDateFrom || f.applicationDateTo,
  );
}

function parseDateRange(text: string): { from: Date; to: Date } | null {
  const m = text.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, d1, mo1, y1, d2, mo2, y2] = m;
  const from = new Date(Date.UTC(Number(y1), Number(mo1) - 1, Number(d1), 0, 0, 0));
  const to = new Date(Date.UTC(Number(y2), Number(mo2) - 1, Number(d2), 23, 59, 59));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

function parseExperienceRange(text: string): { min: number; max: number } | null {
  const single = text.trim().match(/^(\d{1,3})$/);
  if (single) {
    const n = Number(single[1]);
    return { min: n, max: n };
  }
  const range = text.trim().match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return min <= max ? { min, max } : { min: max, max: min };
  }
  return null;
}

const PUBLISH_CHANNEL = "@fidoyiustoz99";
const BACKFILL_SINCE_ISO = "2026-09-20T19:00:00Z"; // 21.09.2026 00:00 Toshkent vaqti
const BACKFILL_BATCH = 3;
const CLEANUP_SINCE_ISO = "2026-08-12T19:00:00Z"; // 13.08.2026 00:00 Toshkent vaqti

type CleanupItem = Awaited<ReturnType<TeacherRepositoryPort["listForCleanup"]>>[number];

function formatTashkent(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const t = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}.${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

function shortText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function registerPublishedTeachers(
  listPublishedTeachers: ListPublishedTeachersUseCase,
  getTeacherPublishDetail: GetTeacherPublishDetailUseCase,
  mediaRepo: MediaRepositoryPort,
  env: Env,
  sessionStore: SessionStorePort,
  teacherRepo: TeacherRepositoryPort,
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
  
  function moderatorUserIdOf(ctx: Context): string | undefined {
    return (ctx as unknown as { moderatorUserId?: string }).moderatorUserId;
  }

  async function getSession(userId: string) {
    const existing = await sessionStore.get(userId, "admin");
    if (existing && existing.flowType === "admin_input") return existing;
    return sessionStore.start(userId, "admin", "admin_input");
  }

  return {
      async showList(ctx: Context, page = 0) {
      const userId = moderatorUserIdOf(ctx);
      if (!userId) return;
      const session = await getSession(userId);
      const stored = (session.collectedData as { filters?: StoredFilters })?.filters;
      const filters = toFilters(stored);

      let result;
      try {
        const moderatorUserId = (ctx as unknown as { moderatorUserId: string }).moderatorUserId;
        result = await listPublishedTeachers.execute({ moderatorUserId, page, filters });
      } catch (err) {
        logger.error("published_teachers.list_failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "⚠️ Nashrdagi ustozlar yuklanmadi.");
        return;
      }

      const activeNote = hasActiveFilters(stored) ? "\n🔍 Filtr faol\n" : "";

      if (result.total === 0) {
        const kb = new InlineKeyboard()
          .text("🔍 Filtrlash", "teachers:filter:menu")
          .text("♻️ Tozalash", "teachers:filter:clear");
        await safeReply(ctx, `🗂 Mos ustozlar topilmadi.${activeNote}`, { reply_markup: kb });
        return;
      }

      const lines: string[] = [
        "📚 Nashrdagi ustozlar",
        `${result.total} ta ustoz topildi${activeNote}`,
        "",
      ];

      result.items.forEach((teacher, idx) => {
        const num = result.page * result.pageSize + idx + 1;
        lines.push(`${num}. ${teacher.fullName}`);
        lines.push(`📍 ${teacher.regionName ?? "-"} / ${teacher.districtName ?? "-"}`);
        lines.push(`🏫 ${teacher.school ?? "-"}`);
        if (teacher.subject) lines.push(`📘 ${teacher.subject}`);
        if (teacher.yearsOfExperience != null) lines.push(`📆 ${teacher.yearsOfExperience} yil staj`);
        lines.push("----------------");
      });

      const kb = new InlineKeyboard();
      result.items.forEach((teacher) => {
        kb.text("📂 Batafsil", `teachers:view:${teacher.id}:${result.page}`).row();
      });

      kb.text("⬅️ Orqaga", `teachers:list:${Math.max(0, result.page - 1)}`)
        .text(`Sahifa ${result.page + 1}/${result.totalPages}`, "teachers:noop")
        .text("Keyingi ➡️", `teachers:list:${Math.min(result.totalPages - 1, result.page + 1)}`)
        .row()
        .text("🔍 Filtrlash", "teachers:filter:menu");
      if (hasActiveFilters(stored)) {
        kb.text("♻️ Tozalash", "teachers:filter:clear");
      }

      try {
        const pendingCount = await teacherRepo.countPendingChannelPosts(BACKFILL_SINCE_ISO);
        kb.row().text(`\u{1F4E3} Kanalga chiqarilmaganlar (${pendingCount})`, "teachers:pending:0");
      } catch {
        kb.row().text("\u{1F4E3} Kanalga chiqarilmaganlar", "teachers:pending:0");
      }
      kb.row().text("\u{1F9EA} Tozalash", "teachers:clean:0");
      await safeReply(ctx, lines.join("\n"), { reply_markup: kb });
    },

    async showPendingList(ctx: Context, page = 0) {
      const moderatorUserId = moderatorUserIdOf(ctx);
      if (!moderatorUserId) return;
      const PAGE_SIZE = 5;
      const toAll = new InlineKeyboard().text("\u2B05\uFE0F Barcha ustozlar", "teachers:list:0");

      let total = 0;
      try {
        total = await teacherRepo.countPendingChannelPosts(BACKFILL_SINCE_ISO);
      } catch (err) {
        logger.error("published_teachers.pending_count_failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "\u26A0\uFE0F Ro'yxat yuklanmadi.");
        return;
      }

      if (total === 0) {
        await safeReply(ctx, "\u2705 Kanalga chiqarilmagan ustoz qolmadi.", { reply_markup: toAll });
        return;
      }

      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const current = Math.min(Math.max(0, page), totalPages - 1);

      let ids: string[] = [];
      try {
        const upTo = await teacherRepo.listPendingChannelPostIds(BACKFILL_SINCE_ISO, (current + 1) * PAGE_SIZE);
        ids = upTo.slice(current * PAGE_SIZE);
      } catch (err) {
        logger.error("published_teachers.pending_list_failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "\u26A0\uFE0F Ro'yxat yuklanmadi.");
        return;
      }

      const lines: string[] = [
        "\u{1F4E3} Kanalga chiqarilmagan ustozlar",
        `${total} ta ustoz (21.09.2026 dan beri nashr bo'lganlar)`,
        "",
      ];
      const kb = new InlineKeyboard();
      let shown = 0;
      for (const id of ids) {
        try {
          const detail = await getTeacherPublishDetail.execute({ teacherId: id, moderatorUserId });
          if (!detail) continue;
          const teacher = detail.teacher;
          shown++;
          const num = current * PAGE_SIZE + shown;
          lines.push(`${num}. ${teacher.fullName}`);
          lines.push(`\u{1F4CD} ${teacher.regionName ?? "-"} / ${teacher.districtName ?? "-"}`);
          lines.push(`\u{1F3EB} ${teacher.school ?? "-"}`);
          if (teacher.subject) lines.push(`\u{1F4D8} ${teacher.subject}`);
          lines.push("----------------");
          kb.text(`\u{1F4C2} Batafsil (${num})`, `teachers:pview:${id}:${current}`).row();
        } catch (err) {
          logger.error("published_teachers.pending_item_failed", {
            teacherId: id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      kb.text("\u2B05\uFE0F Orqaga", `teachers:pending:${Math.max(0, current - 1)}`)
        .text(`Sahifa ${current + 1}/${totalPages}`, "teachers:noop")
        .text("Keyingi \u27A1\uFE0F", `teachers:pending:${Math.min(totalPages - 1, current + 1)}`)
        .row()
        .text("\u2B05\uFE0F Barcha ustozlar", "teachers:list:0");

      await safeReply(ctx, lines.join("\n"), { reply_markup: kb });
    },

    async showCleanupList(ctx: Context, page = 0) {
      const PAGE_SIZE = 8;
      const toAll = new InlineKeyboard().text("\u2B05\uFE0F Barcha ustozlar", "teachers:list:0");

      let total = 0;
      try {
        total = await teacherRepo.countForCleanup(CLEANUP_SINCE_ISO);
      } catch (err) {
        logger.error("published_teachers.cleanup_count_failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "\u26A0\uFE0F Ro'yxat yuklanmadi.");
        return;
      }

      if (total === 0) {
        await safeReply(ctx, "\u2705 Tozalash uchun ustoz yo'q.", { reply_markup: toAll });
        return;
      }

      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const current = Math.min(Math.max(0, page), totalPages - 1);

      let items: CleanupItem[] = [];
      try {
        items = await teacherRepo.listForCleanup(CLEANUP_SINCE_ISO, PAGE_SIZE, current * PAGE_SIZE);
      } catch (err) {
        logger.error("published_teachers.cleanup_list_failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "\u26A0\uFE0F Ro'yxat yuklanmadi.");
        return;
      }

      const statusLabels: Record<string, string> = { draft: "qoralama", published: "nashrda", archived: "arxiv" };
      const lines: string[] = [
        "\u{1F9EA} Tozalash (13.08.2026 dan keyingi ustozlar)",
        `${total} ta ustoz, eng yangisidan boshlab`,
        "",
      ];
      const kb = new InlineKeyboard();
      items.forEach((item, idx) => {
        const num = current * PAGE_SIZE + idx + 1;
        lines.push(`${num}. ${shortText(item.fullName, 40)}`);
        lines.push(`\u{1F4CC} ${statusLabels[item.publishStatus] ?? item.publishStatus} | \u{1F552} ${formatTashkent(item.createdAt)}`);
        if (item.subject) lines.push(`\u{1F4D8} ${shortText(item.subject, 40)}`);
        if (item.channelPostedAt) lines.push("\u{1F4E3} kanalga chiqarilgan");
        lines.push("----------------");
        kb.text(`\u{1F5D1} ${num}. ${shortText(item.fullName, 24)}`, `teachers:cdel:${item.id}:${current}`).row();
      });

      kb.text("\u2B05\uFE0F Orqaga", `teachers:clean:${Math.max(0, current - 1)}`)
        .text(`Sahifa ${current + 1}/${totalPages}`, "teachers:noop")
        .text("Keyingi \u27A1\uFE0F", `teachers:clean:${Math.min(totalPages - 1, current + 1)}`)
        .row()
        .text("\u2B05\uFE0F Barcha ustozlar", "teachers:list:0");

      await safeReply(ctx, lines.join("\n"), { reply_markup: kb });
    },

    async showCleanupConfirm(ctx: Context, teacherId: string, page: number) {
      let item: CleanupItem | null = null;
      let deps = { recommendations: 0, media: 0 };
      try {
        item = await teacherRepo.findCleanupItem(teacherId);
        if (item) deps = await teacherRepo.countTeacherDependents(teacherId);
      } catch (err) {
        logger.error("published_teachers.cleanup_confirm_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "\u26A0\uFE0F Ma'lumot yuklanmadi.");
        return;
      }

      const back = new InlineKeyboard().text("\u2B05\uFE0F Ro'yxatga", `teachers:clean:${page}`);
      if (!item) {
        await safeReply(ctx, "\u26A0\uFE0F Ustoz topilmadi (allaqachon o'chirilgan bo'lishi mumkin).", { reply_markup: back });
        return;
      }

      const lines: string[] = [
        "\u{1F5D1} O'chirishni tasdiqlang",
        "",
        `\u{1F464} ${shortText(item.fullName, 80)}`,
        `\u{1F4CC} Holat: ${item.publishStatus}`,
        `\u{1F552} Yaratilgan: ${formatTashkent(item.createdAt)}`,
      ];
      if (item.channelPostedAt) {
        lines.push("", "\u26A0\uFE0F Bu ustoz kanalga chiqarilgan. Kanaldagi post o'chmaydi, faqat bazadagi ma'lumot o'chadi.");
      }
      lines.push(
        "",
        "Quyidagilar ham butunlay o'chadi:",
        `\u2022 Tavsiyalar: ${deps.recommendations}`,
        `\u2022 Media: ${deps.media}`,
        "",
        "Bu amalni qaytarib bo'lmaydi.",
      );

      const kb = new InlineKeyboard()
        .text("\u2705 Ha, o'chirish", `teachers:cdo:${teacherId}:${page}`)
        .row()
        .text("\u21A9\uFE0F Bekor", `teachers:clean:${page}`);
      await safeReply(ctx, lines.join("\n"), { reply_markup: kb });
    },

    async doCleanupDelete(ctx: Context, teacherId: string, page: number) {
      try {
        const r = await teacherRepo.deleteTeacherCascade(teacherId);
        logger.info("published_teachers.cleanup_deleted", { teacherId, ...r });
        if (r.teachers === 0) {
          await safeReply(ctx, "\u26A0\uFE0F Ustoz topilmadi (allaqachon o'chirilgan).");
        } else {
          await safeReply(
            ctx,
            `\u2705 O'chirildi: tavsiyalar ${r.recommendations}, media ${r.media}, dublikat yozuvlari ${r.duplicates}.`,
          );
        }
      } catch (err) {
        logger.error("published_teachers.cleanup_delete_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(ctx, "\u26A0\uFE0F O'chirib bo'lmadi. Bu ustozga boshqa ma'lumot bog'langan bo'lishi mumkin.");
        return;
      }
      await this.showCleanupList(ctx, page);
    },

    async showFilterMenu(ctx: Context) {
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard()
        .text("📅 Muddat bo'yicha", "teachers:filter:date").row()
        .text("📆 Ish staji bo'yicha", "teachers:filter:experience").row()
        .text("📘 Fan bo'yicha", "teachers:filter:subject").row()
        .text("📍 Tuman bo'yicha", "teachers:filter:district").row()
        .text("♻️ Filtrni tozalash", "teachers:filter:clear").row()
        .text("⬅️ Orqaga", "teachers:filter:back");
      await safeReply(ctx, "Qanday filtr qo'llaymiz?", { reply_markup: kb });
    },

    async promptDate(ctx: Context, userId: string) {
      await ctx.answerCallbackQuery();
      const session = await getSession(userId);
      await sessionStore.update(session.id, { currentStep: "await_date" });
      await safeReply(ctx, "Muddatni kiriting, masalan:\n10.09.2026-10.11.2026");
    },

    async promptDistrict(ctx: Context, userId: string) {
      await ctx.answerCallbackQuery();
      const session = await getSession(userId);
      await sessionStore.update(session.id, { currentStep: "await_district" });
      await safeReply(ctx, "Tuman nomini kiriting, masalan: Rishton");
    },

    async promptExperience(ctx: Context, userId: string) {
      await ctx.answerCallbackQuery();
      const session = await getSession(userId);
      await sessionStore.update(session.id, { currentStep: "await_experience" });
      await safeReply(ctx, "Necha yil? Masalan: 10  yoki  5-10");
    },

    async showSubjectOptions(ctx: Context, userId: string) {
      await ctx.answerCallbackQuery();
      const subjects = await teacherRepo.listDistinctPublishedSubjects();
      if (subjects.length === 0) {
        await safeReply(ctx, "Hozircha fan bo'yicha ma'lumot yo'q.");
        return;
      }
      const session = await getSession(userId);
      const data = { ...session.collectedData } as Record<string, unknown>;
      data.subjectOptions = subjects;
      await sessionStore.update(session.id, { collectedData: data });

      const kb = new InlineKeyboard();
      subjects.forEach((s, idx) => kb.text(s, `teachers:filter:subject:${idx}`).row());
      kb.text("⬅️ Orqaga", "teachers:filter:back");
      await safeReply(ctx, "Fanni tanlang:", { reply_markup: kb });
    },

    async applySubjectChoice(ctx: Context, userId: string, index: number) {
      await ctx.answerCallbackQuery();
      const session = await getSession(userId);
      const data = { ...session.collectedData } as Record<string, unknown>;
      const options = (data.subjectOptions as string[] | undefined) ?? [];
      const chosen = options[index];
      if (!chosen) {
        await safeReply(ctx, "Ushbu tanlov eskirgan, qaytadan urinib ko'ring.");
        return;
      }
      const filters = { ...(data.filters as StoredFilters | undefined) };
      filters.subject = chosen;
      data.filters = filters;
      delete data.subjectOptions;
      await sessionStore.update(session.id, { collectedData: data, currentStep: null });
      await this.showList(ctx, 0);
    },

    async clearFilters(ctx: Context, userId: string) {
      await ctx.answerCallbackQuery();
      const session = await getSession(userId);
      await sessionStore.update(session.id, { collectedData: {}, currentStep: null });
      await this.showList(ctx, 0);
    },

    async handleFilterText(ctx: Context, userId: string, text: string): Promise<boolean> {
      const session = await sessionStore.get(userId, "admin");
      if (!session || session.flowType !== "admin_input") return false;
      const step = session.currentStep;
      if (step === "await_channel_post_edit") {
        return await this.applyChannelDraftEdit(ctx, userId, text);
      }
      if (step !== "await_date" && step !== "await_district" && step !== "await_experience") return false;

      const data = { ...session.collectedData } as Record<string, unknown>;
      const filters = { ...(data.filters as StoredFilters | undefined) };

      if (step === "await_date") {
        const parsed = parseDateRange(text);
        if (!parsed) {
          await safeReply(ctx, "Format noto'g'ri. Masalan: 10.09.2026-10.11.2026");
          return true;
        }
        filters.applicationDateFrom = parsed.from.toISOString();
        filters.applicationDateTo = parsed.to.toISOString();
      } else if (step === "await_district") {
        const value = text.trim();
        if (!value) {
          await safeReply(ctx, "Tuman nomini kiriting.");
          return true;
        }
        filters.districtNameQuery = value;
      } else if (step === "await_experience") {
        const parsed = parseExperienceRange(text);
        if (!parsed) {
          await safeReply(ctx, "Format noto'g'ri. Masalan: 10  yoki  5-10");
          return true;
        }
        filters.minExperience = parsed.min;
        filters.maxExperience = parsed.max;
      }

      data.filters = filters;
      await sessionStore.update(session.id, { collectedData: data, currentStep: null });
      await this.showList(ctx, 0);
      return true;
    },

    async showDetail(ctx: Context, teacherId: string, fromPage: number, source: "all" | "pending" = "all") {
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
      const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
      const relationshipLabels: Record<string, string> = {
        student: "O'quvchisi",
        former_student: "Bitirgan o'quvchisi",
        parent: "Yaqin qarindoshi",
        colleague: "Hamkasbi",
        school_leader: "Maktab rahbari",
        community_member: "Jamoat vakili",
        self: "O'zi",
      };

      const teacherPhones = Array.from(
        new Set(
          detail.recommendations
            .map((item) => clean(item.recommendation.teacherPhone))
            .filter((v): v is string => Boolean(v)),
        ),
      );
      const experience = teacher.yearsOfExperience != null ? `${teacher.yearsOfExperience} yil` : "-";

      const head: string[] = [
        `👤 ${teacher.fullName}`,
        `📍 Region: ${teacher.regionName ?? "-"}`,
        `📍 Tuman: ${teacher.districtName ?? "-"}`,
        `🏫 Maktab: ${teacher.school ?? "-"}`,
        `📘 Fan: ${teacher.subject ?? "-"}`,
        `💼 Lavozim: ${teacher.position ?? "-"}`,
        `📆 Ish staji: ${experience}`,
        `📞 Ustoz telefoni: ${teacherPhones.length > 0 ? teacherPhones.join(", ") : "-"}`,
        `📊 Tavsiyalar soni: ${detail.independentRecommendationCount}`,
        `Holat: ${teacher.publishStatus}`,
      ];

      const blocks: string[] = [head.join("\n")];
      detail.recommendations.forEach((item, idx) => {
        const d = item.recommendation;
        const parts: string[] = [`━━━━━━━━━━\n📝 Tavsiya #${idx + 1}`];
        const rel = d.relationship;
        if (rel) parts.push(`🤝 Munosabat: ${relationshipLabels[String(rel)] ?? String(rel)}`);
        const who = [clean(d.recommenderName), clean(d.recommenderPhone) ? `📞 ${clean(d.recommenderPhone)}` : null]
          .filter(Boolean)
          .join("  ");
        if (who) parts.push(`👤 Tavsiya qiluvchi: ${who}`);
        if (clean(d.experienceYearsText)) parts.push(`📆 Ish staji (aytilgan): ${clean(d.experienceYearsText)}`);
        if (clean(d.achievementsText)) parts.push(`🏆 Yutuqlari:\n${clean(d.achievementsText)}`);
        if (clean(d.studentImpactText)) parts.push(`🎓 Shogirdlari yutuqlari:\n${clean(d.studentImpactText)}`);
        if (clean(d.teachingMethodsText)) parts.push(`🧑‍🏫 Metodikasi:\n${clean(d.teachingMethodsText)}`);
        if (clean(d.recommendationText)) parts.push(`📝 Tavsiya matni:\n${clean(d.recommendationText)}`);
        if (clean(d.evidenceText)) parts.push(`📎 Dalil:\n${clean(d.evidenceText)}`);
        if (clean(d.additionalInfo)) parts.push(`ℹ️ Qo'shimcha:\n${clean(d.additionalInfo)}`);
        parts.push(`🖼 Media: ${item.mediaSummary}`);
        blocks.push(parts.join("\n"));
      });

      // Telegram caps a message at 4096 chars — split into chunks below that.
      const MAX = 3800;
      const chunks: string[] = [];
      let current = "";
      for (const block of blocks) {
        let piece = block;
        while (piece.length > MAX) {
          if (current) {
            chunks.push(current);
            current = "";
          }
          chunks.push(piece.slice(0, MAX));
          piece = piece.slice(MAX);
        }
        if (current && (current + "\n\n" + piece).length > MAX) {
          chunks.push(current);
          current = piece;
        } else {
          current = current ? current + "\n\n" + piece : piece;
        }
      }
      if (current) chunks.push(current);

      const kb = new InlineKeyboard().text("⬅️ Orqaga", `${source === "pending" ? "teachers:pending" : "teachers:list"}:${fromPage}`).row().text("📣 Kanalga chop etish", `chpost:preview:${teacherId}`);
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        await safeReply(ctx, chunks[i]!, isLast ? { reply_markup: kb } : undefined);
      }

      logger.info("published_teachers.detail_shown", {
        count: detail.recommendations.length,
      });
      await this.sendTeacherMedia(ctx, detail.recommendations.map((item) => item.recommendation.recommendationId));
    },

    async buildChannelDraft(
      ctx: Context,
      teacherId: string,
    ): Promise<{ text: string; recommendationIds: string[] } | null> {
      let detail;
      try {
        const moderatorUserId = (ctx as unknown as { moderatorUserId: string }).moderatorUserId;
        detail = await getTeacherPublishDetail.execute({ teacherId, moderatorUserId });
      } catch (err) {
        logger.error("published_teachers.channel_draft_failed", {
          teacherId,
          err: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
      if (!detail) return null;

      const teacher = detail.teacher;
      const uniq = (values: Array<string | null | undefined>) =>
        Array.from(new Set(values.map((v) => (v ?? "").trim()).filter((v) => v.length > 0)));
      const stories = uniq(detail.recommendations.map((i) => i.recommendation.recommendationText));
      const achievements = uniq(detail.recommendations.map((i) => i.recommendation.achievementsText));
      const students = uniq(detail.recommendations.map((i) => i.recommendation.studentImpactText));

      const expTexts = uniq(detail.recommendations.map((i) => i.recommendation.experienceYearsText));
      const exp0 = expTexts[0] ?? "";
      const expFallback = exp0 ? (/^\d+$/.test(exp0) ? `${exp0} yil` : exp0) : "";
      const years = teacher.yearsOfExperience != null ? `${teacher.yearsOfExperience} yil` : expFallback;
      const subject = (teacher.subject ?? "").trim();
      const school = (teacher.school ?? "").trim();
      const place = [teacher.districtName, teacher.regionName]
        .map((v) => (v ?? "").trim())
        .filter((v) => v.length > 0)
        .join(", ");
      const regionTag = (teacher.regionName ?? "")
        .replace(/\s+(viloyati|respublikasi)$/i, "")
        .replace(/[\s'’ʻʼ`".,;:!?()\-–—\/\\]+/g, "");

      const parts: string[] = [`👤 ${teacher.fullName}`, ""];
      if (place) parts.push(`📍 ${place}`);
      if (school) parts.push(`🏫 ${/^\d+$/.test(school) ? `${school}-maktab` : school}`);
      if (subject) parts.push(`📘 Fan: ${subject}`);
      if (years) parts.push(`📆 Ish staji: ${years}`);
      const submitterName = (detail.recommendations[0]?.recommendation.recommenderName ?? "").trim();
      parts.push(`📨 Loyihaga taqdim etgan: ${submitterName || "Ma'lumot ko'rsatilmagan"}`);
      if (stories.length > 0) {
        parts.push("", "📝 Ustoz hikoyasi", stories.map((s) => `❝ ${s} ❞`).join("\n\n"));
      }
      if (achievements.length > 0) parts.push("", "🏆 Yutuqlari", achievements.join("\n\n"));
      if (students.length > 0) parts.push("", "🎓 Shogirdlari yutuqlari", students.join("\n\n"));
      parts.push("", regionTag ? `#FidoyiUstozlar #${regionTag}` : "#FidoyiUstozlar");

      const text = parts.join("\n");

      return {
        text,
        recommendationIds: detail.recommendations.map((i) => i.recommendation.recommendationId),
      };
    },

    async loadChannelMedia(recommendationIds: string[]) {
      if (recommendationIds.length === 0) return [];
      const all = await mediaRepo.listByRecommendationIds(recommendationIds);
      return all.filter((m) => m.mediaType === "photo" || m.mediaType === "video");
    },

    async sendChannelPreview(ctx: Context, text: string, mediaCount: number) {
      const kb = new InlineKeyboard()
        .text("✅ Kanalga yuborish", "chpost:send").row()
        .text("✏️ Tahrirlash", "chpost:edit")
        .text("❌ Bekor qilish", "chpost:cancel");
      await safeReply(
        ctx,
        `📣 Kanal posti ko'rinishi (${PUBLISH_CHANNEL}):\n\n${text.length > 3500 ? `${text.slice(0, 3500)}…\n\n(Ko'rinish qisqartirildi, kanalga to'liq matn yuboriladi.)` : text}\n\n———\n🖼 Qo'shiladigan media: ${mediaCount} ta`,
        { reply_markup: kb },
      );
    },

    async channelPreview(ctx: Context, userId: string, teacherId: string) {
      await ctx.answerCallbackQuery();
      const draft = await this.buildChannelDraft(ctx, teacherId);
      if (!draft) {
        await safeReply(ctx, "⚠️ Ustoz ma'lumoti yuklanmadi.");
        return;
      }
      const media = await this.loadChannelMedia(draft.recommendationIds);
      const session = await getSession(userId);
      const data = { ...session.collectedData } as Record<string, unknown>;
      data.channelDraft = draft.text;
      data.channelTeacherId = teacherId;
      data.channelMediaCount = media.length;
      await sessionStore.update(session.id, { collectedData: data, currentStep: null });
      await this.sendChannelPreview(ctx, draft.text, media.length);
    },

    async channelEdit(ctx: Context, userId: string) {
      await ctx.answerCallbackQuery();
      const session = await sessionStore.get(userId, "admin");
      const draft = (session?.collectedData as { channelDraft?: string } | undefined)?.channelDraft;
      if (!session || !draft) {
        await safeReply(ctx, "Post eskirgan. Ustozni qaytadan tanlang.");
        return;
      }
      await sessionStore.update(session.id, { currentStep: "await_channel_post_edit" });
      await safeReply(
        ctx,
        "Post matnini tahrirlab, TO'LIQ matnni bitta xabarda yuboring (yuqoridagi ko'rinishni nusxalab o'zgartirishingiz mumkin).",
      );
    },

    async applyChannelDraftEdit(ctx: Context, userId: string, text: string): Promise<boolean> {
      const session = await sessionStore.get(userId, "admin");
      if (!session) return false;
      const value = text.trim();
      if (!value) {
        await safeReply(ctx, "Matn bo'sh bo'lmasligi kerak.");
        return true;
      }
      if (value.length > 3800) {
        await safeReply(ctx, `Matn juda uzun (${value.length} belgi). 3800 belgidan oshmasin.`);
        return true;
      }
      const data = { ...session.collectedData } as Record<string, unknown>;
      data.channelDraft = value;
      await sessionStore.update(session.id, { collectedData: data, currentStep: null });
      await this.sendChannelPreview(ctx, value, Number(data.channelMediaCount ?? 0));
      return true;
    },

    async channelCancel(ctx: Context, userId: string) {
      await ctx.answerCallbackQuery();
      const session = await sessionStore.get(userId, "admin");
      if (session) {
        const data = { ...session.collectedData } as Record<string, unknown>;
        delete data.channelDraft;
        delete data.channelTeacherId;
        delete data.channelMediaCount;
        await sessionStore.update(session.id, { collectedData: data, currentStep: null });
      }
      await safeReply(ctx, "Bekor qilindi.");
    },

    async channelSend(ctx: Context, userId: string) {
      await ctx.answerCallbackQuery();
      const session = await sessionStore.get(userId, "admin");
      const data = (session?.collectedData ?? {}) as { channelDraft?: string; channelTeacherId?: string };
      if (!session || !data.channelDraft || !data.channelTeacherId) {
        await safeReply(ctx, "Post eskirgan. Ustozni qaytadan tanlang.");
        return;
      }

      const draft = await this.buildChannelDraft(ctx, data.channelTeacherId);
      const media = await this.loadChannelMedia(draft?.recommendationIds ?? []);

      const r2Bucket = (env as { R2_BUCKET?: R2Bucket }).R2_BUCKET;
      const items: Array<{ type: "photo" | "video"; media: InputFile | string }> = [];
      for (const m of media) {
        try {
          let src: InputFile | string | null = null;
          if (r2Bucket && m.objectKey) {
            const object = await r2Bucket.get(m.objectKey);
            if (object) {
              const bytes = new Uint8Array(await object.arrayBuffer());
              src = new InputFile(bytes, m.objectKey.split("/").pop() ?? "media");
            }
          }
          if (!src && m.telegramFileId) src = m.telegramFileId;
          if (src) items.push({ type: m.mediaType as "photo" | "video", media: src });
        } catch (err) {
          logger.error("published_teachers.channel_media_load_failed", {
            mediaId: m.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      let failed = media.length - items.length;
      for (let i = 0; i < items.length; i += 10) {
        const chunk = items.slice(i, i + 10);
        try {
          if (chunk.length === 1) {
            const only = chunk[0]!;
            if (only.type === "photo") await ctx.api.sendPhoto(PUBLISH_CHANNEL, only.media);
            else await ctx.api.sendVideo(PUBLISH_CHANNEL, only.media);
          } else {
            await ctx.api.sendMediaGroup(
              PUBLISH_CHANNEL,
              chunk.map((c) => ({ type: c.type, media: c.media })) as Parameters<Context["api"]["sendMediaGroup"]>[1],
            );
          }
        } catch (err) {
          failed += chunk.length;
          logger.error("published_teachers.channel_media_send_failed", {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      try {
        await this.sendChannelText(ctx, data.channelDraft);
        await teacherRepo.markChannelPosted(data.channelTeacherId);
      } catch (err) {
        logger.error("published_teachers.channel_send_failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        await safeReply(
          ctx,
          `⚠️ Kanalga yuborib bo'lmadi: ${err instanceof Error ? err.message : String(err)}\nAdminbot ${PUBLISH_CHANNEL} kanalida admin ekanini tekshiring.`,
        );
        return;
      }

      const clean = { ...session.collectedData } as Record<string, unknown>;
      delete clean.channelDraft;
      delete clean.channelTeacherId;
      delete clean.channelMediaCount;
      await sessionStore.update(session.id, { collectedData: clean, currentStep: null });

      await safeReply(
        ctx,
        failed > 0
          ? `✅ Post ${PUBLISH_CHANNEL} kanaliga chop etildi. ⚠️ ${failed} ta media yuborilmadi.`
          : `✅ Post ${PUBLISH_CHANNEL} kanaliga chop etildi.`,
      );
    },

    async sendChannelText(ctx: Context, text: string): Promise<void> {
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const toHtml = (s: string) =>
        s
          .split("\n")
          .map((line) => {
            const e = esc(line);
            if (e.startsWith("👤 ")) return `👤 <b>${e.slice(3)}</b>`;
            return e.replace(/^(📘|📆) ([^:]+:)/, "$1 <b>$2</b>");
          })
          .join("\n");

      const LIMIT = 3500;
      const chunks: string[] = [];
      let rest = text;
      while (rest.length > LIMIT) {
        let cut = rest.lastIndexOf("\n\n", LIMIT);
        if (cut < LIMIT / 2) cut = rest.lastIndexOf("\n", LIMIT);
        if (cut < LIMIT / 2) cut = rest.lastIndexOf(" ", LIMIT);
        if (cut < LIMIT / 2) cut = LIMIT;
        chunks.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).trimStart();
      }
      if (rest.length > 0) chunks.push(rest);

      for (const chunk of chunks) {
        try {
          await ctx.api.sendMessage(PUBLISH_CHANNEL, toHtml(chunk), { parse_mode: "HTML" });
        } catch (err) {
          logger.error("published_teachers.channel_html_failed", {
            err: err instanceof Error ? err.message : String(err),
          });
          await ctx.api.sendMessage(PUBLISH_CHANNEL, chunk);
        }
      }
    },

    async downloadPublicBotFile(fileId: string): Promise<InputFile | null> {
      const token = (env as { PUBLIC_BOT_TOKEN?: string }).PUBLIC_BOT_TOKEN;
      if (!token) return null;
      const meta = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
      const json = (await meta.json()) as { ok: boolean; result?: { file_path?: string } };
      const filePath = json.ok ? json.result?.file_path : undefined;
      if (!filePath) return null;
      const file = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
      return new InputFile(new Uint8Array(await file.arrayBuffer()), filePath.split("/").pop() ?? "media");
    },

    async sendMediaBatchToChannel(
      ctx: Context,
      media: Array<{ id: string; mediaType: string; objectKey?: string | null; telegramFileId?: string | null }>,
    ): Promise<number> {
      const r2Bucket = (env as { R2_BUCKET?: R2Bucket }).R2_BUCKET;
      const items: Array<{ type: "photo" | "video"; media: InputFile }> = [];
      for (const m of media) {
        try {
          let src: InputFile | null = null;
          if (r2Bucket && m.objectKey) {
            const object = await r2Bucket.get(m.objectKey);
            if (object) {
              src = new InputFile(new Uint8Array(await object.arrayBuffer()), m.objectKey.split("/").pop() ?? "media");
            }
          }
          if (!src && m.telegramFileId) src = await this.downloadPublicBotFile(m.telegramFileId);
          if (src) items.push({ type: m.mediaType as "photo" | "video", media: src });
        } catch (err) {
          logger.error("published_teachers.backfill_media_load_failed", {
            mediaId: m.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      let failed = media.length - items.length;
      for (let i = 0; i < items.length; i += 10) {
        const chunk = items.slice(i, i + 10);
        try {
          if (chunk.length === 1) {
            const only = chunk[0]!;
            if (only.type === "photo") await ctx.api.sendPhoto(PUBLISH_CHANNEL, only.media);
            else await ctx.api.sendVideo(PUBLISH_CHANNEL, only.media);
          } else {
            await ctx.api.sendMediaGroup(
              PUBLISH_CHANNEL,
              chunk.map((c) => ({ type: c.type, media: c.media })) as Parameters<Context["api"]["sendMediaGroup"]>[1],
            );
          }
        } catch (err) {
          failed += chunk.length;
          logger.error("published_teachers.backfill_media_send_failed", {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return failed;
    },

    async channelBackfillStatus(ctx: Context) {
      const pending = await teacherRepo.countPendingChannelPosts(BACKFILL_SINCE_ISO);
      if (pending === 0) {
        await safeReply(ctx, "Kanalga chiqarilmagan ustoz topilmadi (21.09.2026 dan beri nashr bo'lganlar orasida).");
        return;
      }
      const kb = new InlineKeyboard().text(
        `▶️ Chop etishni boshlash (${Math.min(BACKFILL_BATCH, pending)} ta)`,
        "chbackfill:run",
      );
      await safeReply(
        ctx,
        `21.09.2026 dan beri nashr bo'lgan va kanalga hali chiqmagan ustozlar: ${pending} ta.\n\nTugma bosilganda ${BACKFILL_BATCH} tadan, eng eskisidan boshlab ${PUBLISH_CHANNEL} kanaliga chop etiladi.`,
        { reply_markup: kb },
      );
    },

    async channelBackfillRun(ctx: Context) {
      await ctx.answerCallbackQuery();
      const ids = await teacherRepo.listPendingChannelPostIds(BACKFILL_SINCE_ISO, BACKFILL_BATCH);
      if (ids.length === 0) {
        await safeReply(ctx, "Hammasi chop etilgan. ✅");
        return;
      }

      let done = 0;
      let skipped = 0;
      let mediaFailed = 0;
      for (const id of ids) {
        const draft = await this.buildChannelDraft(ctx, id);
        if (!draft) {
          skipped++;
          continue;
        }
        try {
          const media = await this.loadChannelMedia(draft.recommendationIds);
          mediaFailed += await this.sendMediaBatchToChannel(ctx, media);
          await this.sendChannelText(ctx, draft.text);
        } catch (err) {
          logger.error("published_teachers.backfill_send_failed", {
            err: err instanceof Error ? err.message : String(err),
          });
          await safeReply(
            ctx,
            `⚠️ Kanalga yuborib bo'lmadi: ${err instanceof Error ? err.message : String(err)}\nAdminbot ${PUBLISH_CHANNEL} kanalida admin ekanini tekshiring. Chop etilgan: ${done} ta.`,
          );
          return;
        }
        await teacherRepo.markChannelPosted(id);
        done++;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      const left = await teacherRepo.countPendingChannelPosts(BACKFILL_SINCE_ISO);
      const summary =
        `✅ Chop etildi: ${done} ta` +
        (skipped > 0 ? `, o'tkazib yuborildi: ${skipped} ta` : "") +
        (mediaFailed > 0 ? `, yuborilmagan media: ${mediaFailed} ta` : "") +
        `.\nQoldi: ${left} ta.`;
      if (left > 0 && done > 0) {
        const kb = new InlineKeyboard().text(
          `▶️ Davom etish (${Math.min(BACKFILL_BATCH, left)} ta)`,
          "chbackfill:run",
        );
        await safeReply(ctx, summary, { reply_markup: kb });
      } else {
        await safeReply(ctx, summary);
      }
    },

    async sendTeacherMedia(ctx: Context, recommendationIds: string[]) {
      const r2Bucket = (env as { R2_BUCKET?: R2Bucket }).R2_BUCKET;

      if (recommendationIds.length === 0) {
        return;
      }

      const mediaItems = await mediaRepo.listByRecommendationIds(recommendationIds);
      if (mediaItems.length === 0) {
        return;
      }

      for (const media of mediaItems) {
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