import uzLatn from "./locales/uz-latn.json";
import uzCyrl from "./locales/uz-cyrl.json";
import ru from "./locales/ru.json";
import en from "./locales/en.json";
import type { TranslationKey, SupportedLocale } from "./types";

// MVP ships uz-latn only. The other three files exist and are wired here so adding
// a language later is "fill in the JSON," not "restructure the bot."
const dictionaries: Record<SupportedLocale, Partial<Record<TranslationKey, string>>> = {
  "uz-latn": uzLatn,
  "uz-cyrl": uzCyrl,
  ru,
  en,
};

export function t(key: TranslationKey, locale: SupportedLocale = "uz-latn"): string {
  return dictionaries[locale][key] ?? dictionaries["uz-latn"][key] ?? key;
}
