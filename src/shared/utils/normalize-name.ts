import { transliterateToLatin } from "./transliteration";
import { nameTokenSimilarity } from "./string-similarity";

/**
 * Normalizes a full name for dedup matching: transliterates Cyrillic to Latin FIRST
 * (so "Ҳакимов Отабек" and "Hakimov Otabek" converge to the same form), then
 * lowercases, standardizes apostrophe variants, and collapses whitespace. Every
 * teachers.normalized_name value goes through this — which is what lets a plain
 * pg_trgm index compare names correctly regardless of the script they arrived in.
 */
export function normalizeName(fullName: string): string {
  return transliterateToLatin(fullName)
    .trim()
    .toLowerCase()
    .replace(/[‘’`ʻʼ]/g, "'")
    .replace(/\s+/g, " ");
}

export function tokenizeName(normalizedName: string): string[] {
  return normalizedName
    .split(/[\s.]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Order-invariant, initial-aware name comparison — handles "Otabek Hakimov" vs
 * "Hakimov Otabek" (reordered) and "O. Hakimov" vs "Otabek Hakimov" (abbreviated)
 * without either name needing to be in a specific token order. For each token in the
 * shorter name, finds its best match among the longer name's tokens; unmatched tokens
 * in the longer name reduce the score (so "Otabek Hakimov" vs "Otabek Botirovich
 * Hakimov" doesn't score a perfect 1.0 — a genuinely different person could share two
 * of three tokens).
 */
export function fullNameSimilarity(normalizedA: string, normalizedB: string): number {
  if (normalizedA === normalizedB) return 1;

  const tokensA = tokenizeName(normalizedA);
  const tokensB = tokenizeName(normalizedB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const usedLongerIndices = new Set<number>();
  let totalScore = 0;

  for (const tokenShort of shorter) {
    let bestScore = 0;
    let bestIdx = -1;
    for (let i = 0; i < longer.length; i++) {
      if (usedLongerIndices.has(i)) continue;
      const score = nameTokenSimilarity(tokenShort, longer[i]!);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) usedLongerIndices.add(bestIdx);
    totalScore += bestScore;
  }

  // Normalize by the longer token count so missing/extra tokens genuinely cost score.
  return totalScore / longer.length;
}
