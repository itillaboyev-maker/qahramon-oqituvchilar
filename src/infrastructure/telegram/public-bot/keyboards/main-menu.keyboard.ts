import { InlineKeyboard } from "grammy";
import { t } from "../../../../i18n/translate";

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(t("menu.submit_info"), "menu:submit_info").row()
    .text(t("menu.about"), "menu:about").row()
    .text(t("menu.contact"), "menu:contact");
}

/**
 * Business rule A: the bot must always ask "who is this about" before starting any
 * submission, with "another teacher" visually emphasized as the encouraged default —
 * listed first, with a star, versus a plain circle for self-submission. Telegram
 * buttons can't be "pre-selected," so emphasis is carried by order + iconography + copy.
 */
export function whoIsThisAboutKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(t("who.btn_teacher"), "who:teacher").row()
    .text(t("who.btn_self"), "who:self");
}

export function joinChannelKeyboard(channelUsername: string): InlineKeyboard {
  const channelUrl = `https://t.me/${channelUsername.replace(/^@/, "")}`;
  return new InlineKeyboard()
    .url(t("start.btn_join_channel"), channelUrl).row()
    .text(t("start.btn_check_subscription"), "check_subscription");
}
