/**
 * Global search (decision of 11/25/2026): one box in the menu finds loads (number, pickup #, customer ref/PO,
 * stop city), drivers (name, phone, CDL #), trucks and trailers (unit #, VIN, plate) and customers (name, MC #).
 * Pure helpers; the queries run as the user, so each role only finds what it may see.
 */

export type SearchKind = "load" | "driver" | "truck" | "trailer" | "customer";
export type SearchHit = { kind: SearchKind; id: string; href: string; title: string; subtitle: string };

export const SEARCH_ORDER: readonly SearchKind[] = ["load", "driver", "truck", "trailer", "customer"];
export const SEARCH_LABELS: Record<SearchKind, string> = {
  load: "Loads", driver: "Drivers", truck: "Trucks", trailer: "Trailers", customer: "Customers",
};

/**
 * What was typed, made safe for a PostgREST `or=(…ilike…)` filter: characters that delimit or wildcard the
 * filter are dropped, spaces collapsed. Null when there is too little to search (< 2 characters).
 */
export function searchTerm(input: string): string | null {
  const t = input.replace(/[,()*%\\:"'`;]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return t.length >= 2 ? t : null;
}

export const searchWords = (term: string) => term.toLowerCase().split(" ").filter(Boolean);

/** Every word appears somewhere in the text (case-insensitive): "john car" matches "John Carter". */
export const matchesAll = (text: string, words: readonly string[]) => {
  const t = text.toLowerCase();
  return words.every((w) => t.includes(w));
};

/** Hits grouped in display order, each group capped. */
export function groupHits(hits: readonly SearchHit[], perGroup = 5): { kind: SearchKind; hits: SearchHit[] }[] {
  return SEARCH_ORDER
    .map((kind) => ({ kind, hits: hits.filter((h) => h.kind === kind).slice(0, perGroup) }))
    .filter((g) => g.hits.length > 0);
}
