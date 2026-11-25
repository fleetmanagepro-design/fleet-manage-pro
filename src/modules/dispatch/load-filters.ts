import { isCalendarDate } from "@/lib/dates";

/**
 * Pickup date filter on the loads list (decision of 11/25/2026): "From" and "To" calendar days in company time,
 * either may be empty; the same day in both shows that day's pickups. Reversed dates are swapped.
 */
export function pickupDateRange(fromParam: unknown, toParam: unknown): { from?: string; to?: string } {
  const pick = (v: unknown) => {
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === "string" && isCalendarDate(s) ? s : undefined;
  };
  const from = pick(fromParam);
  const to = pick(toParam);
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}
