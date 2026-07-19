/**
 * Pure string-similarity primitives — no external dependency, deliberately (per the
 * "don't add new technology" decision). Two complementary algorithms:
 *   - Levenshtein: good for typos/insertions/deletions ("Otabek" vs "Otabec").
 *   - Jaro-Winkler: good for transpositions and rewards matching prefixes, which
 *     suits names better ("Hakimov" vs "Xakimov" scores higher under JW than Levenshtein).
 * Both return a 0..1 similarity (1 = identical).
 */

export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  const distance = prev[b.length];
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

export function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
}

export function jaroWinklerSimilarity(a: string, b: string): number {
  const jaro = jaroSimilarity(a, b);
  let prefixLength = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefixLength++;
    else break;
  }
  return jaro + prefixLength * 0.1 * (1 - jaro);
}

/** Best-of-both, since each algorithm catches different kinds of name variation. */
export function nameTokenSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  // Initial-match: "o" vs "otabek" (from "O. Hakimov" vs "Otabek Hakimov") — treat a
  // single-letter token as matching strongly if it's the first letter of the other token.
  if (a.length === 1 || b.length === 1) {
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (long.startsWith(short)) return 0.92;
  }
  return Math.max(levenshteinSimilarity(a, b), jaroWinklerSimilarity(a, b));
}
