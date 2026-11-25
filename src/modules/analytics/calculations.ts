import { addDays, addMonths, daysBetween, formatCalendarDate, isCalendarDate, mondayOf } from "@/lib/dates";
import { type Cents, sumCents } from "@/lib/money";
import { emptyMilePercent, revenuePerMileCents, totalMiles } from "@/modules/dispatch/calculations";

/**
 * Dashboard numbers (PRODUCT_SPEC §4.2; first version 11/25/2026, before expenses exist).
 * Revenue counts delivered loads on their delivery day in company time. Pure functions, amounts in cents.
 */

export const PERIODS = ["week", "month", "last_month", "quarter", "year", "custom"] as const;
export type PeriodKey = (typeof PERIODS)[number];
export const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: "This week", month: "This month", last_month: "Last month", quarter: "This quarter", year: "This year", custom: "Custom",
};

export type Period = { key: PeriodKey; from: string; to: string; label: string };

const firstOfMonth = (day: string) => `${day.slice(0, 8)}01`;

/** The period's calendar days (inclusive), from ?period= and, for custom, ?from=&to=. Unknown → this month. */
export function dashboardPeriod(param: unknown, fromParam: unknown, toParam: unknown, today: string): Period {
  const key = (PERIODS as readonly string[]).includes(param as string) ? (param as PeriodKey) : "month";
  const range = (from: string, to: string, k: PeriodKey = key): Period => ({
    key: k, from, to, label: `${formatCalendarDate(from)} – ${formatCalendarDate(to)}`,
  });
  switch (key) {
    case "week": return range(mondayOf(today), addDays(mondayOf(today), 6));
    case "last_month": {
      const first = addMonths(firstOfMonth(today), -1);
      return range(first, addDays(firstOfMonth(today), -1));
    }
    case "quarter": {
      const m = Number(today.slice(5, 7));
      const first = `${today.slice(0, 4)}-${String(m - ((m - 1) % 3)).padStart(2, "0")}-01`;
      return range(first, addDays(addMonths(first, 3), -1));
    }
    case "year": return range(`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`);
    case "custom": {
      const ok = (v: unknown) => typeof v === "string" && isCalendarDate(v);
      if (ok(fromParam) && ok(toParam)) {
        const [a, b] = [fromParam as string, toParam as string].sort();
        // at most ~3 years so the query stays reasonable
        return range(a, daysBetween(a, b) > 1100 ? addDays(a, 1100) : b);
      }
      return { ...dashboardPeriod("month", null, null, today), key: "custom" };
    }
    default: return range(firstOfMonth(today), addDays(addMonths(firstOfMonth(today), 1), -1));
  }
}

export type Granularity = "day" | "week" | "month";

/** Days for up to a month, weeks for up to ~4 months, months beyond. */
export const granularityFor = (p: Pick<Period, "from" | "to">): Granularity => {
  const days = daysBetween(p.from, p.to) + 1;
  return days <= 31 ? "day" : days <= 124 ? "week" : "month";
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const bucketKey = (day: string, g: Granularity) => (g === "day" ? day : g === "week" ? mondayOf(day) : firstOfMonth(day));
const bucketLabel = (key: string, g: Granularity) =>
  g === "month" ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}` : `${key.slice(5, 7)}/${key.slice(8, 10)}`;

/** Every bucket in the period, in order (empty ones too, so the chart has no gaps). */
export function periodBuckets(p: Pick<Period, "from" | "to">, g = granularityFor(p)): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  let k = bucketKey(p.from, g);
  while (k <= p.to) {
    out.push({ key: k, label: bucketLabel(k, g) });
    k = g === "day" ? addDays(k, 1) : g === "week" ? addDays(k, 7) : addMonths(k, 1);
  }
  return out;
}

export type DeliveredLoad = {
  id: string;
  deliveredDay: string;
  valueCents: Cents;
  loaded_miles: number | null;
  deadhead_miles: number | null;
  truck: { id: string; unit_number: string } | null;
  /** Null when pay isn't visible to the viewer or a driver has no rule. */
  driverPayCents: Cents | null;
};

export type TruckRow = { id: string; unit: string; loads: number; revenueCents: Cents; miles: number; rpmCents: Cents | null };

export type DashboardSummary = {
  loadsDelivered: number;
  revenueCents: Cents;
  miles: number;
  loadedMiles: number;
  rpmCents: Cents | null;
  emptyPercent: number | null;
  /** Only when every load's pay is known. */
  driverPayCents: Cents | null;
  contributionCents: Cents | null;
  series: { key: string; label: string; revenueCents: Cents; loads: number }[];
  trucks: TruckRow[];
};

export function summarize(loads: readonly DeliveredLoad[], period: Pick<Period, "from" | "to">): DashboardSummary {
  const g = granularityFor(period);
  const buckets = periodBuckets(period, g);
  const byBucket = new Map(buckets.map((b) => [b.key, { ...b, revenueCents: 0, loads: 0 }]));
  const byTruck = new Map<string, TruckRow>();
  let loaded = 0;
  let dead = 0;
  for (const l of loads) {
    const b = byBucket.get(bucketKey(l.deliveredDay, g));
    if (b) { b.revenueCents += l.valueCents; b.loads += 1; }
    loaded += Math.round((l.loaded_miles ?? 0) * 10);
    dead += Math.round((l.deadhead_miles ?? 0) * 10);
    if (l.truck) {
      const t = byTruck.get(l.truck.id) ?? { id: l.truck.id, unit: l.truck.unit_number, loads: 0, revenueCents: 0, miles: 0, rpmCents: null };
      t.loads += 1;
      t.revenueCents += l.valueCents;
      t.miles = (Math.round(t.miles * 10) + Math.round(totalMiles(l) * 10)) / 10;
      byTruck.set(l.truck.id, t);
    }
  }
  const revenue = sumCents(loads.map((l) => l.valueCents));
  const miles = (loaded + dead) / 10;
  const payKnown = loads.every((l) => l.driverPayCents !== null);
  const pay = payKnown ? sumCents(loads.map((l) => l.driverPayCents ?? 0)) : null;
  const collator = new Intl.Collator("en-US", { numeric: true });
  return {
    loadsDelivered: loads.length,
    revenueCents: revenue,
    miles,
    loadedMiles: loaded / 10,
    rpmCents: revenuePerMileCents(revenue, miles),
    emptyPercent: emptyMilePercent({ loaded_miles: loaded / 10, deadhead_miles: dead / 10 }),
    driverPayCents: pay,
    contributionCents: pay === null ? null : revenue - pay,
    series: [...byBucket.values()].map(({ key, label, revenueCents, loads: n }) => ({ key, label, revenueCents, loads: n })),
    trucks: [...byTruck.values()]
      .map((t) => ({ ...t, rpmCents: revenuePerMileCents(t.revenueCents, t.miles) }))
      .sort((a, b) => b.revenueCents - a.revenueCents || collator.compare(a.unit, b.unit)),
  };
}

/** Top and bottom trucks by revenue; the bottom list never repeats a truck from the top list. */
export function topAndBottom<T>(rows: readonly T[], n = 5): { top: T[]; bottom: T[] } {
  const top = rows.slice(0, n);
  const bottom = rows.slice(Math.max(n, rows.length - n)).reverse();
  return { top, bottom };
}

/** Nice round ceiling for a chart axis (1, 2, 2.5, 5 × 10^k steps, 3–5 gridlines), the tightest that fits. */
export function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  const options = [4, 5, 3].map((ticks) => {
    const raw = max / ticks;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? 10 * mag;
    return { top: step * ticks, step };
  });
  return options.reduce((best, o) => (o.top < best.top ? o : best));
}
