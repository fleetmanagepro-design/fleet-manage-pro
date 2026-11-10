/**
 * FormData with indexed names ("stops.0.city", "stops.1.city") → plain object with arrays.
 * Only string values are kept. Indices may have gaps (removed rows); order is preserved.
 */
export function nestedFormValues(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lists: Record<string, Map<number, Record<string, string>>> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$")) continue;
    const m = /^([a-zA-Z]+)\.(\d+)\.([a-zA-Z]+)$/.exec(key);
    if (!m) {
      out[key] = value;
      continue;
    }
    const [, list, index, field] = m;
    const rows = (lists[list] ??= new Map());
    const row = rows.get(Number(index)) ?? {};
    row[field] = value;
    rows.set(Number(index), row);
  }
  for (const [list, rows] of Object.entries(lists)) {
    out[list] = [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
  }
  return out;
}
