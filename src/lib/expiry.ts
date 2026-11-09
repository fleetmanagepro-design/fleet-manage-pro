import { daysBetween } from "@/lib/dates";

/**
 * Expiration status of a dated document (registration, CDL, medical card, …).
 *   expired   – the date has passed
 *   due_soon  – within `soonDays` (default 30)
 *   upcoming  – within `upcomingDays`, when given (drivers: 60)
 *   ok / missing
 * Something that expires today is still valid today.
 */
export type ExpiryState = "expired" | "due_soon" | "upcoming" | "ok" | "missing";

export type ExpiryItem<K extends string = string> = {
  key: K;
  label: string;
  /** Calendar date it expires / is due, "YYYY-MM-DD". */
  dueOn: string | null;
  /** Days from today until dueOn (negative when past). */
  daysLeft: number | null;
  state: ExpiryState;
  /** Extra context, e.g. "last 03/01/2026, valid 6 months". */
  note?: string;
};

export type ExpiryThresholds = { soonDays?: number; upcomingDays?: number };

export function expiryItem<K extends string>(
  key: K,
  label: string,
  dueOn: string | null,
  today: string,
  { soonDays = 30, upcomingDays }: ExpiryThresholds = {},
): ExpiryItem<K> {
  if (!dueOn) return { key, label, dueOn: null, daysLeft: null, state: "missing" };
  const daysLeft = daysBetween(today, dueOn);
  const state: ExpiryState =
    daysLeft < 0
      ? "expired"
      : daysLeft <= soonDays
        ? "due_soon"
        : upcomingDays !== undefined && daysLeft <= upcomingDays
          ? "upcoming"
          : "ok";
  return { key, label, dueOn, daysLeft, state };
}

const SEVERITY: ExpiryState[] = ["expired", "due_soon", "upcoming", "ok", "missing"];

/** The most urgent state among items, for list badges. "missing" never outranks a real date. */
export function worstState(items: readonly ExpiryItem[]): ExpiryState {
  for (const s of SEVERITY) if (items.some((i) => i.state === s)) return s;
  return "missing";
}
