/**
 * Customer list search. The term goes into a PostgREST `or=(…)` filter, where
 * commas, parentheses and wildcards have meaning, so keep only characters that
 * appear in company names and MC numbers.
 */
export function sanitizeSearch(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  return (raw ?? "")
    .replace(/[^\p{L}\p{N} &'.\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/** "MC-123456" / "mc 123456" → "123456" so people can paste MC numbers as written. */
export function mcDigits(term: string): string | null {
  const m = /^(?:mc[\s#-]*)?(\d{1,8})$/i.exec(term.trim());
  return m ? m[1] : null;
}
