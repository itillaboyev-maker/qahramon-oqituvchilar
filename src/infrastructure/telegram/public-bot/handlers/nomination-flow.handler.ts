import { InlineKeyboard, Keyboard, type Context } from "grammy";
import { eq } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { regions, districts } from "../../../db/schema";
import type { SessionStorePort } from "../../../../application/ports/session/session-store.port";
import type { SubmitNominationUseCase } from "../../../../application/use-cases/recommendation/submit-nomination.use-case";
import type { NominationMediaItem } from "../../../../application/dto/nomination.dto";
import type { Relationship, MediaType } from "../../../../domain/enums";
import { t } from "../../../../i18n/translate";
import { MEDIA_LIMITS } from "../../../../shared/constants/media.constants";
import { logger } from "../../../logging/logger";

import { TEXT_LIMITS } from "../../../../shared/constants/security.constants";
import type { R2MediaStorageService } from "../../../storage/R2MediaStorageService";
type Step =
  | "teacher_name"
  | "region"
  | "district"
  | "school"
  | "teacher_phone"
  | "relationship"
  | "recommendation_text"
  | "ask_more"
  | "extra_info"
  | "media"
  | "recommender_name"
  | "recommender_phone"
  | "consent";

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  student: "👨‍🎓 O'quvchisiman",
  former_student: "🎓 Bitirgan o'quvchisiman",
  parent: "👨‍👩‍👧 Yaqin qarindoshiman",
  colleague: "🤝 Hamkasbiman",
  school_leader: "🏫 Maktab rahbariman",
  community_member: "🌍 Jamoat vakiliman",
  self: "⭐ O'zim",
};
export function registerNominationFlow(
  db: Database,
  sessionStore: SessionStorePort,
  submitNomination: SubmitNominationUseCase,
  r2StorageService: R2MediaStorageService | null,
  botToken?: string,
) {
  return {
    async start(ctx: Context, userId: string) {
      await sessionStore.start(userId, "public", "nomination");
      const session = await sessionStore.get(userId, "public");
      if (!session) return;
      await sessionStore.update(session.id, { currentStep: "teacher_name" satisfies Step });
      await ctx.reply(t("nomination.ask_teacher_name"));
    },

    async handleText(ctx: Context, userId: string, text: string) {
      const session = await sessionStore.get(userId, "public");
      if (!session || session.flowType !== "nomination" || !session.currentStep) return false;

      const step = session.currentStep as Step;
      const data = { ...session.collectedData } as Record<string, unknown>;

      switch (step) {
        case "teacher_name": {
          const name = text.trim();
          if (!name) {
            await ctx.reply(t("nomination.ask_teacher_name"));
            return true;
          }
          if (name.length > 256) {
            await ctx.reply(t("nomination.teacher_name_too_long"));
            return true;
          }
          data.teacherFullName = name;
          const regionRows = await db.select().from(regions).orderBy(regions.nameUzLatn);

          const kb = new InlineKeyboard();
          for (const r of regionRows) {
            kb.text(r.nameUzLatn, `region:${r.id}`).row();
          }
          await sessionStore.update(session.id, { currentStep: "region", collectedData: data });
          await ctx.reply(`${t("nomination.ask_region")}\n\nRegionlar soni: ${regionRows.length}`, { reply_markup: kb });
          return true;
        }
        case "school": {
          const school = text.trim();
          if (!school) {
            await ctx.reply(t("nomination.ask_school"));
            return true;
          }
          data.school = school;
          await this.askTeacherPhone(ctx, session.id, data);
          return true;
        }

        case "teacher_phone": {
          const contactPhone = ctx.message?.contact?.phone_number;
          const value = contactPhone ?? text.trim();

          if (!value) {
            await ctx.reply(t("nomination.ask_teacher_phone"));
            return true;
          }

          const normalized = this.normalizePhone(value);

          if (!normalized) {
            await ctx.reply(t("nomination.phone_invalid"));
            return true;
          }

          data.teacherPhone = normalized;

          await this.askRelationship(ctx, session.id, data);

          return true;
        }

        case "recommendation_text": {
          data.recommendationText = text.trim();
          const kb = new InlineKeyboard()
            .text(t("nomination.btn_add_more"), "more:yes").row()
            .text(t("nomination.btn_finish"), "more:no");
          await sessionStore.update(session.id, { currentStep: "ask_more", collectedData: data });
          await ctx.reply(t("nomination.ask_more"), { reply_markup: kb });
          return true;
        }
        case "extra_info": {
          data.additionalInfo = text.trim();
          await this.askMedia(ctx, session.id, data);
          return true;
        }
        case "recommender_name": {
          const value = text.trim();

          if (!value) {
            await ctx.reply(t("nomination.ask_recommender_name"));
            return true;
          }

          data.recommenderName = value;

          await this.askRecommenderPhone(ctx, session.id, data);
          return true;
        }

        case "recommender_phone": {
          const value = text.trim().toLowerCase();

          if (!value) {
            await ctx.reply(t("nomination.ask_recommender_phone"));
            return true;
          }

          if (
            ["bilmayman", "bilmiman", "bilmayman.", "yo'q", "yoq", "yo‘q"]
              .includes(value)
          ) {
            data.recommenderPhone = null;
          } else {
            data.recommenderPhone = text.trim();
          }

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
      if (!session || session.flowType !== "nomination" || session.currentStep !== "media") return false;

      const data = { ...session.collectedData } as Record<string, unknown>;
      const existing = (data.media as NominationMediaItem[] | undefined) ?? [];

      if (existing.length >= MEDIA_LIMITS.MAX_ITEMS_PER_RECOMMENDATION) {
        const kb = new InlineKeyboard().text(t("nomination.btn_media_done"), "media:done");
        await ctx.reply(t("nomination.media_limit_reached"), { reply_markup: kb });
        return true;
      }

      if (mediaType === "video" && fileSizeBytes && fileSizeBytes > MEDIA_LIMITS.MAX_VIDEO_SIZE_BYTES) {
        const kb = new InlineKeyboard()
          .text(t("nomination.btn_media_done"), "media:done").row()
          .text(t("nomination.btn_skip"), "skip:media");
        await ctx.reply(t("nomination.media_too_large"), { reply_markup: kb });
        return true;
      }

      if (existing.some((m) => m.telegramFileUniqueId === fileUniqueId)) {
        const kb = new InlineKeyboard().text(t("nomination.btn_media_done"), "media:done");
        await ctx.reply(t("nomination.media_duplicate"), { reply_markup: kb });
        return true;
      }
      console.log("R2 SERVICE EXISTS:", !!r2StorageService);
      console.log("BOT TOKEN EXISTS:", !!botToken);

      if (!r2StorageService || !botToken) {
        await ctx.reply("Media upload is unavailable. Iltimos, keyinroq urinib ko'ring.");
        return true;
      }

      try {
        const uploadResult = await r2StorageService.uploadFromTelegram({
          botToken,
          fileId,
          recommendationId: null,
          userId,
        });

        existing.push({
          mediaType,
          telegramFileId: fileId,
          telegramFileUniqueId: fileUniqueId,
          objectKey: uploadResult.objectKey,
          bucketName: uploadResult.bucketName,
          mimeType: uploadResult.mimeType,
          sizeBytes: uploadResult.sizeBytes,
          checksumSha256: uploadResult.checksumSha256,
        });
      } catch (err) {
        logger.error("media_upload_failed", { error: (err as Error).message, userId, fileId });
        await ctx.reply("Media upload failed. Iltimos, qayta urinib ko'ring.");
        return true;
      }

      data.media = existing;

      await sessionStore.update(session.id, { collectedData: data });
      const kb = new InlineKeyboard().text(t("nomination.btn_media_done"), "media:done");
      await ctx.reply(t("nomination.media_received"), { reply_markup: kb });
      return true;
    },

    async askMedia(ctx: Context, sessionId: string, data: Record<string, unknown>) {
      const kb = new InlineKeyboard()
        .text(t("nomination.btn_media_done"), "media:done").row()
        .text(t("nomination.btn_skip"), "skip:media");
      await sessionStore.update(sessionId, { currentStep: "media", collectedData: data });
      await ctx.reply(t("nomination.ask_media"), { reply_markup: kb });
    },

    async askTeacherPhone(ctx: Context, sessionId: string, data: Record<string, unknown>) {
      const kb = new Keyboard()
        .requestContact(t("nomination.btn_share_contact"))
        .row()
        .text(t("nomination.btn_skip"))
        .resized()
        .oneTime();

      await sessionStore.update(sessionId, {
        currentStep: "teacher_phone",
        collectedData: data,
      });

      await ctx.reply(t("nomination.ask_teacher_phone"), {
        reply_markup: kb,
      });
    },

    async askRelationship(ctx: Context, sessionId: string, data: Record<string, unknown>) {
      const kb = new InlineKeyboard();
      for (const [key, label] of Object.entries(RELATIONSHIP_LABELS)) {
        kb.text(label, `rel:${key}`).row();
      }
      await sessionStore.update(sessionId, { currentStep: "relationship", collectedData: data });
      await ctx.reply(t("nomination.ask_relationship"), { reply_markup: kb });
    },

    async askRecommenderName(ctx: Context, sessionId: string, data: Record<string, unknown>) {
      await sessionStore.update(sessionId, { currentStep: "recommender_name", collectedData: data });
      await ctx.reply(t("nomination.ask_recommender_name"));
    },

    async askRecommenderPhone(ctx: Context, sessionId: string, data: Record<string, unknown>) {
      const kb = new InlineKeyboard()
        .text(t("nomination.btn_skip"), "recommender_phone:skip");

      await sessionStore.update(sessionId, {
        currentStep: "recommender_phone",
        collectedData: data,
      });

      await ctx.reply(t("nomination.ask_recommender_phone"), {
        reply_markup: kb,
      });
    },

    async askConsent(ctx: Context, sessionId: string, data: Record<string, unknown>) {
      const kb = new InlineKeyboard()
        .text(t("nomination.btn_consent_yes"), "consent:yes").row()
        .text(t("nomination.btn_consent_no"), "consent:no");
      await sessionStore.update(sessionId, { currentStep: "consent", collectedData: data });
      await ctx.reply(t("nomination.consent_question"), { reply_markup: kb });
    },

    async handleCallback(ctx: Context, userId: string, callbackData: string) {
      const session = await sessionStore.get(userId, "public");
      if (!session || session.flowType !== "nomination") return false;
      const data = { ...session.collectedData } as Record<string, unknown>;

      if (callbackData.startsWith("region:")) {
        const regionId = callbackData.split(":")[1]!;
        const [regionRow] = await db.select().from(regions).where(eq(regions.id, regionId)).limit(1);
        if (!regionRow) {
          await ctx.answerCallbackQuery();
          await ctx.reply(t("nomination.invalid_region"));
          logger.warn("invalid_region_callback", { userId, regionId });
          return true;
        }
        data.regionId = regionId;
        const districtRows = await db.select().from(districts).where(eq(districts.regionId, regionId)).orderBy(districts.nameUzLatn);

        const kb = new InlineKeyboard();
        for (const d of districtRows) {
          kb.text(d.nameUzLatn, `district:${d.id}`).row();
        }
        await sessionStore.update(session.id, { currentStep: "district", collectedData: data });
        await ctx.answerCallbackQuery();
        await ctx.reply(t("nomination.ask_district"), { reply_markup: kb });
        return true;
      }

      if (callbackData.startsWith("district:")) {
        const districtId = callbackData.split(":")[1]!;
        const regionId = data.regionId as string | undefined;
        const [districtRow] = await db.select().from(districts).where(eq(districts.id, districtId)).limit(1);
        if (!districtRow || (regionId && String(districtRow.regionId) !== String(regionId))) {
          await ctx.answerCallbackQuery();
          await ctx.reply(t("nomination.invalid_district"));
          logger.warn("invalid_district_callback", { userId, districtId, regionId });
          return true;
        }
        data.districtId = districtId;
        await sessionStore.update(session.id, { currentStep: "school", collectedData: data });
        await ctx.answerCallbackQuery();
        await ctx.reply(t("nomination.ask_school"));
        return true;
      }

      if (callbackData === "teacher_phone:skip") {
        data.teacherPhone = null;
        await ctx.answerCallbackQuery();
        await this.askRelationship(ctx, session.id, data);
        return true;
      }

      if (callbackData === "teacher_phone:share") {
        await ctx.answerCallbackQuery();
        await ctx.reply(t("nomination.ask_teacher_phone"));
        return true;
      }

      if (callbackData.startsWith("rel:")) {
        const relKey = callbackData.split(":")[1]!;
        if (!(relKey in RELATIONSHIP_LABELS)) {
          await ctx.answerCallbackQuery();
          await ctx.reply(t("nomination.invalid_relationship"));
          logger.warn("invalid_relationship_callback", { userId, relKey });
          return true;
        }
        data.relationship = relKey as Relationship;
        await sessionStore.update(session.id, { currentStep: "recommendation_text", collectedData: data });
        await ctx.answerCallbackQuery();
        await ctx.reply(t("nomination.ask_text"));
        return true;
      }

      if (callbackData === "more:yes") {
        await sessionStore.update(session.id, { currentStep: "extra_info", collectedData: data });
        await ctx.answerCallbackQuery();
        await ctx.reply(t("nomination.ask_extra_info"));
        return true;
      }

      if (callbackData === "more:no") {
        await ctx.answerCallbackQuery();
        await this.askMedia(ctx, session.id, data);
        return true;
      }

      if (callbackData === "media:done" || callbackData === "skip:media") {
        await ctx.answerCallbackQuery();
        await this.askRecommenderName(ctx, session.id, data);
        return true;
      }

      if (callbackData === "skip:recommender_name") {
        await ctx.answerCallbackQuery();
        await this.askRecommenderPhone(ctx, session.id, data);
        return true;
      }

      if (callbackData === "skip:recommender_phone") {
        await ctx.answerCallbackQuery();
        await this.askConsent(ctx, session.id, data);
        return true;
      }

      if (callbackData === "consent:no") {
        await ctx.answerCallbackQuery();
        await sessionStore.clear(session.id);
        await ctx.reply(t("nomination.consent_declined"));
        return true;
      }

      if (callbackData === "consent:yes") {
        await ctx.answerCallbackQuery();
        const user = ctx.from;
        if (!user) return true;

        try {
          await submitNomination.execute({
            teacherFullName: data.teacherFullName as string,
            regionId: data.regionId as string,
            districtId: data.districtId as string,
            school: data.school as string,
            relationship: data.relationship as Relationship,
            recommendationText: data.recommendationText as string,
            additionalInfo: data.additionalInfo as string | undefined,
            media: data.media as NominationMediaItem[] | undefined,
            recommenderName: data.recommenderName as string | undefined,
            recommenderPhone: data.recommenderPhone as string | undefined,
            teacherPhone: data.teacherPhone as string | null | undefined,
            submittedByUserId: userId,
            consentGiven: true,
          });
          await sessionStore.clear(session.id);
          await ctx.reply(t("nomination.done"));
        } catch (err) {
          console.error(err);

          logger.error("submit_nomination_failed", {
            error: err instanceof Error ? err.stack : String(err),
            userId,
          });

          await ctx.reply(
            `❌ Xatolik:\n${err instanceof Error ? err.message : String(err)}`
          );
        
      }
      return true;
    }

      return false;
  },

    normalizePhone(value: string) {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    if (!digitsOnly) return null;
    if (digitsOnly.length < TEXT_LIMITS.PHONE_MIN || digitsOnly.length > TEXT_LIMITS.PHONE_MAX) {
      return null;
    }
    return value.trim();
  },

    async handleContact(ctx: Context, userId: string, contact: { phone_number?: string | null }) {
    const session = await sessionStore.get(userId, "public");
    if (!session || session.flowType !== "nomination" || session.currentStep !== "teacher_phone") return false;

    const data = { ...session.collectedData } as Record<string, unknown>;
    const phone = contact.phone_number?.trim();
    if (!phone) {
      await ctx.reply(t("nomination.phone_invalid"));
      return true;
    }

    const normalized = this.normalizePhone(phone);
    if (!normalized) {
      await ctx.reply(t("nomination.phone_invalid"));
      return true;
    }

    data.teacherPhone = normalized;
    await sessionStore.update(session.id, { collectedData: data });
    await this.askRelationship(ctx, session.id, data);
    return true;
  },
};
}