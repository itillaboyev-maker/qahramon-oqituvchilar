/**
 * Uzbek Cyrillic -> Latin transliteration (1995/2019 official Latin alphabet mapping).
 * This exists so that "Ҳакимов Отабек" and "Hakimov Otabek" reduce to the same
 * comparable form BEFORE any similarity scoring happens — teachers.normalized_name
 * is always stored in this Latin form regardless of which script a submission used,
 * which is what lets a plain pg_trgm index work correctly across both scripts.
 *
 * Multi-character sequences are listed before single characters so they match first.
 */
const MULTI_CHAR_MAP: [string, string][] = [
  ["Ё", "Yo"], ["ё", "yo"],
  ["Ю", "Yu"], ["ю", "yu"],
  ["Я", "Ya"], ["я", "ya"],
  ["Ц", "Ts"], ["ц", "ts"],
  ["Ч", "Ch"], ["ч", "ch"],
  ["Ш", "Sh"], ["ш", "sh"],
  ["Щ", "Sh"], ["щ", "sh"],
  ["Ў", "O'"], ["ў", "o'"],
  ["Ғ", "G'"], ["ғ", "g'"],
];

const SINGLE_CHAR_MAP: [string, string][] = [
  ["А", "A"], ["а", "a"],
  ["Б", "B"], ["б", "b"],
  ["В", "V"], ["в", "v"],
  ["Г", "G"], ["г", "g"],
  ["Д", "D"], ["д", "d"],
  ["Е", "E"], ["е", "e"],
  ["Ж", "J"], ["ж", "j"],
  ["З", "Z"], ["з", "z"],
  ["И", "I"], ["и", "i"],
  ["Й", "Y"], ["й", "y"],
  ["К", "K"], ["к", "k"],
  ["Л", "L"], ["л", "l"],
  ["М", "M"], ["м", "m"],
  ["Н", "N"], ["н", "n"],
  ["О", "O"], ["о", "o"],
  ["П", "P"], ["п", "p"],
  ["Р", "R"], ["р", "r"],
  ["С", "S"], ["с", "s"],
  ["Т", "T"], ["т", "t"],
  ["У", "U"], ["у", "u"],
  ["Ф", "F"], ["ф", "f"],
  ["Х", "X"], ["х", "x"],
  ["Ъ", "'"], ["ъ", "'"],
  ["Ы", "I"], ["ы", "i"],
  ["Ь", ""], ["ь", ""],
  ["Э", "E"], ["э", "e"],
  ["Қ", "Q"], ["қ", "q"],
  ["Ҳ", "H"], ["ҳ", "h"],
];

function containsCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

export function transliterateToLatin(text: string): string {
  if (!containsCyrillic(text)) return text;

  let result = text;
  for (const [from, to] of MULTI_CHAR_MAP) {
    result = result.split(from).join(to);
  }
  for (const [from, to] of SINGLE_CHAR_MAP) {
    result = result.split(from).join(to);
  }
  return result;
}
