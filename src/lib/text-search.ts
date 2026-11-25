/**
 * Text search shared by the menu search and the list pages (decision of 11/25/2026).
 * A term is what was typed, made safe for PostgREST `or=(…ilike…)` filters; a row matches when every word of
 * the term appears in one of its fields ("john car" → John Carter).
 */

/** Characters that delimit or wildcard a PostgREST filter are dropped. Null when there is too little (< 2 chars). */
export function searchTerm(input: unknown): string | null {
  const raw = Array.isArray(input) ? input[0] : input;
  if (typeof raw !== "string") return null;
  const t = raw.replace(/[,()*%\\:"'`;]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return t.length >= 2 ? t : null;
}

export const searchWords = (term: string) => term.toLowerCase().split(" ").filter(Boolean);

/** Every word appears somewhere in the text (case-insensitive). */
export const matchesAll = (text: string, words: readonly string[]) => {
  const t = text.toLowerCase();
  return words.every((w) => t.includes(w));
};

/** A row's fields match the term (null term = everything matches). */
export function matchesTerm(fields: readonly (string | number | null | undefined)[], term: string | null): boolean {
  if (!term) return true;
  return matchesAll(fields.filter((f) => f !== null && f !== undefined && f !== "").join(" "), searchWords(term));
}
