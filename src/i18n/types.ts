import uzLatn from "./locales/uz-latn.json";

export type TranslationKey = keyof typeof uzLatn;
export type SupportedLocale = "uz-latn" | "uz-cyrl" | "ru" | "en";
