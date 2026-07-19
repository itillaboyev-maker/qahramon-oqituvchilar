import { InlineKeyboard, type Context } from "grammy";
import { eq } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { regions, districts } from "../../../db/schema";
import type { SessionStorePort } from "../../../../application/ports/session/session-store.port";
import type { SubmitNominationUseCase } from "../../../../application/use-cases/recommendation/submit-nomination.use-case";
import type { NominationMediaItem } from "../../../../application/dto/nomination.dto";
import type { MediaType } from "../../../../domain/enums";
import { t } from "../../../../i18n/translate";
import { MEDIA_LIMITS } from "../../../../shared/constants/media.constants";
import { logger } from "../../../logging/logger";

/**
 * Self-submission flow (business rule A — secondary path, deliberately shorter than
 * nomination since there's no "relationship" question: it's always self). Reuses
 * SubmitNominationUseCase with submissionType: "self", relationship: "self" — this
 * keeps recommendation-creation, media attachment, and Identity Resolution identical
 * between both submission types rather than duplicating that logic.
 */

type Step = "full_name" | "region" | "district" | "school" | "subject" | "story" | "media" | "phone" | "consent";

export function registerSelfSubmissionFlow(
  db: Database,
  sessionStore: SessionStorePort,
  submitNomination: SubmitNominationUseCase,
) {
  return {
    async start(ctx: Context, userId: string) {
      await sessionStore.start(userId, "public", "self_submission");
      const session = await sessionStore.get(userId, "public");
      if (!session) return;
      await sessionStore.update(session.id, { currentStep: "full_name" satisfies Step });
      await ctx.reply(t("self.ask_full_name"));
    },

    async handleText(ctx: Context, userId: string, text: string) {
      const session = await sessionStore.get(userId, "public");
      if (!session || session.flowType !== "self_submission" || !session.currentStep) return false;

      const step = session.currentStep as Step;
      const data = { ...session.collectedData } as Record<string, unknown>;

      switch (step) {
        case "full_name": {
          const name = text.trim();
          if (!name) {
            await ctx.reply(t("self.ask_full_name"));
            return true;
          }
          if (name.length > 256) {
            await ctx.reply(t("nomination.teacher_name_too_long"));
            return true;
          }
          data.teacherFullName = name;
          const regionRows = await db.select().from(regions).orderBy(regions.nameUzLatn);
          const kb = new InlineKeyboard();
          for (const r of regionRows) kb.text(r.nameUzLatn, `sregion:${r.id}`).row();
          await sessionStore.update(session.id, { currentStep: "region", collectedData: data });
          await ctx.reply(t("self.ask_region"), { reply_markup: kb });
          return true;
        }
        case "school": {
          data.school = text.trim();
          await sessionStore.update(session.id, { currentStep: "subject", collectedData: data });
          await ctx.reply(t("self.ask_subject"));
          return true;
        }
        case "subject": {
          data.subject = text.trim();
          await sessionStore.update(session.id, { currentStep: "story", collectedData: data });
          await ctx.reply(t("self.ask_story"));
          return true;
        }
        case "story": {
          data.recommendationText = text.trim();
          await this.askMedia(ctx, session.id, data);
          return true;
        }
        case "phone": {
          data.recommenderPhone = text.trim(); // optional, never blocks submission
          await this.askConsent(ctx, session.id, data);
          return true;
        }
        default:
          return false;
      }
    },

    async handleMedia(
      ctx: Context,
      userId: string,
      mediaType: MediaType,
      fileId: string,
      fileUniqueId: string,
      fileSizeBytes?: number,
    ) {
      const session = await sessionStore.get(userId, "public");
      if (!session || session.flowType !== "self_submission" || session.currentStep !== "media") return false;

      const data = { ...session.collectedData } as Record<string, unknown>;
      const existing = (data.media as NominationMediaItem[] | undefined) ?? [];

      if (existing.length >= MEDIA_LIMITS.MAX_ITEMS_PER_RECOMMENDATION) {
        const kb = new InlineKeyboard().text(t("nomination.btn_media_done"), "smedia:done");
        await ctx.reply(t("nomination.media_limit_reached"), { reply_markup: kb });
        return true;
      }

      if (mediaType === "video" && fileSizeBytes && fileSizeBytes > MEDIA_LIMITS.MAX_VIDEO_SIZE_BYTES) {
        const kb = new InlineKeyboard()
          .text(t("nomination.btn_media_done"), "smedia:done").row()
          .text(t("nomination.btn_skip"), "sskip:media");
        await ctx.reply(t("nomination.media_too_large"), { reply_markup: kb });
        return true;
      }

      if (existing.some((m) => m.telegramFileUniqueId === fileUniqueId)) {
        const kb = new InlineKeyboard().text(t("nomination.btn_media_done"), "smedia:done");
        await ctx.reply(t("nomination.media_duplicate"), { reply_markup: kb });
        return true;
      }

      existing.push({ mediaType, telegramFileId: fileId, telegramFileUniqueId: fileUniqueId });
      data.media = existing;

      await sessionStore.update(session.id, { collectedData: data });
      const kb = new InlineKeyboard().text(t("nomination.btn_media_done"), "smedia:done");
      await ctx.reply(t("nomination.media_received"), { reply_markup: kb });
      return true;
    },

    async askMedia(ctx: Context, sessionId: string, data: Record<string, unknown>) {
      const kb = new InlineKeyboard()
        .text(t("nomination.btn_media_done"), "smedia:done").row()
        .text(t("nomination.btn_skip"), "sskip:media");
      await sessionStore.update(sessionId, { currentStep: "media", collectedData: data });
      await ctx.reply(t("nomination.ask_media"), { reply_markup: kb });
    },

    async askPhone(ctx: Context, sessionId: string, data: Record<string, unknown>) {
      const kb = new InlineKeyboard().text(t("nomination.btn_skip"), "sskip:phone");
      await sessionStore.update(sessionId, { currentStep: "phone", collectedData: data });
      await ctx.reply(t("nomination.ask_recommender_phone"), { reply_markup: kb });
    },

    async askConsent(ctx: Context, sessionId: string, data: Record<string, unknown>) {
      const kb = new InlineKeyboard()
        .text(t("nomination.btn_consent_yes"), "sconsent:yes").row()
        .text(t("nomination.btn_consent_no"), "sconsent:no");
      await sessionStore.update(sessionId, { currentStep: "consent", collectedData: data });
      await ctx.reply(t("nomination.consent_question"), { reply_markup: kb });
    },

    async handleCallback(ctx: Context, userId: string, callbackData: string) {
      const session = await sessionStore.get(userId, "public");
      if (!session || session.flowType !== "self_submission") return false;
      const data = { ...session.collectedData } as Record<string, unknown>;

      if (callbackData.startsWith("sregion:")) {
        const regionId = callbackData.split(":")[1]!;
        // validate region
        const [regionRow] = await db.select().from(regions).where(eq(regions.id, regionId)).limit(1);
        if (!regionRow) {
          await ctx.answerCallbackQuery();
          await ctx.reply(t("nomination.invalid_region"));
          logger.warn("invalid_sregion_callback", { userId, regionId });
          return true;
        }
        data.regionId = regionId;
        const districtRows = await db.select().from(districts).where(eq(districts.regionId, regionId)).orderBy(districts.nameUzLatn);
        const kb = new InlineKeyboard();
        for (const d of districtRows) kb.text(d.nameUzLatn, `sdistrict:${d.id}`).row();
        await sessionStore.update(session.id, { currentStep: "district", collectedData: data });
        await ctx.answerCallbackQuery();
        await ctx.reply(t("self.ask_district"), { reply_markup: kb });
        return true;
      }

      if (callbackData.startsWith("sdistrict:")) {
        const districtId = callbackData.split(":")[1]!;
        const regionId = data.regionId as string | undefined;
        const [districtRow] = await db.select().from(districts).where(eq(districts.id, districtId)).limit(1);
        if (!districtRow || (regionId && String(districtRow.regionId) !== String(regionId))) {
          await ctx.answerCallbackQuery();
          await ctx.reply(t("nomination.invalid_district"));
          logger.warn("invalid_sdistrict_callback", { userId, districtId, regionId });
          return true;
        }
        data.districtId = districtId;
        await sessionStore.update(session.id, { currentStep: "school", collectedData: data });
        await ctx.answerCallbackQuery();
        await ctx.reply(t("self.ask_school"));
        return true;
      }

      if (callbackData === "smedia:done" || callbackData === "sskip:media") {
        await ctx.answerCallbackQuery();
        await this.askPhone(ctx, session.id, data);
        return true;
      }

      if (callbackData === "sskip:phone") {
        await ctx.answerCallbackQuery();
        await this.askConsent(ctx, session.id, data);
        return true;
      }

      if (callbackData === "sconsent:no") {
        await ctx.answerCallbackQuery();
        await sessionStore.clear(session.id);
        await ctx.reply(t("nomination.consent_declined"));
        return true;
      }

      if (callbackData === "sconsent:yes") {
        await ctx.answerCallbackQuery();
        try {
          await submitNomination.execute({
            teacherFullName: data.teacherFullName as string,
            regionId: data.regionId as string,
            districtId: data.districtId as string,
            school: data.school as string,
            subject: data.subject as string,
            relationship: "self",
            submissionType: "self",
            recommendationText: data.recommendationText as string,
            media: data.media as NominationMediaItem[] | undefined,
            recommenderName: data.teacherFullName as string,
            recommenderPhone: data.recommenderPhone as string | undefined,
            submittedByUserId: userId,
            consentGiven: true,
          });
          await sessionStore.clear(session.id);
          await ctx.reply(t("self.done"));
        } catch (err) {
          logger.error("submit_self_nomination_failed", { error: (err as Error).message, userId });
          await ctx.reply((err as Error).message);
        }
        return true;
      }

      return false;
    },
  };
}
