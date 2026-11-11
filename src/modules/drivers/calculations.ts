import { addDays, todayIn } from "@/lib/dates";
import { formatMiles } from "@/lib/miles";
import { type Cents, formatCents, sumCents } from "@/lib/money";
import type { LoadStatus } from "@/modules/dispatch/labels";
import { driverLoadPay, roundDiv } from "./pay";
import { type PayRule, describePayRule } from "./pay-rules";

/**
 * Weekly driver pay statements (PRODUCT_SPEC §3 "Driver pay", decisions of 11/10–11/11/2026).
 *   week: Monday–Sunday in company time; a load belongs to the week of its first pickup
 *   loads: owner-operator = value − company fee, company driver = miles × rate; extras paid in full
 *   deductions: % of the week's gross (gross = load value, before the company fee; for company drivers,
 *               their mileage pay), a fixed amount per week, or a fixed amount (optional) + a rate per mile over
 *               a number of free miles per week (all miles: loaded + empty); any deduction active on a day of the week applies
 *   balance: a negative net is carried into the next statement as a debt
 * Pure functions; amounts are integer cents.
 */

export const PAID_LOAD_STATUSES: readonly LoadStatus[] = ["delivered", "invoiced", "paid"];

/** The day that decides a load's pay week and pay rule: first pickup appointment, else delivery. */
export function loadPayDay(
  stops: readonly { stop_type: string; sequence: number; appointment_start: string | null }[],
  deliveredAt: string | null,
  timeZone: string,
): string | null {
  const first = [...stops].filter((s) => s.stop_type === "pickup").sort((a, b) => a.sequence - b.sequence)[0];
  if (first?.appointment_start) return todayIn(timeZone, new Date(first.appointment_start));
  return deliveredAt ? todayIn(timeZone, new Date(deliveredAt)) : null;
}

export const weekEnd = (weekStart: string) => addDays(weekStart, 6);
export const isInWeek = (day: string, weekStart: string) => day >= weekStart && day <= weekEnd(weekStart);

/** Balance carried into a statement: the previous finalized net, if it was negative. */
export const carriedIn = (previousNetCents: Cents | null | undefined): Cents => Math.min(0, previousNetCents ?? 0);

export type StatementLoad = {
  loadId: string;
  loadNumber: string;
  status: LoadStatus;
  route: string;
  valueCents: Cents;
  loaded_miles: number | null;
  deadhead_miles: number | null;
  /** The driver's rule in effect on the load's pay day. */
  rule: PayRule | null;
  extras: readonly { description: string; amountCents: Cents }[];
};

export type StatementDeduction = {
  id: string;
  name: string;
  kind: "percent_of_gross" | "fixed_weekly" | "per_mile";
  percent: number | null;
  /** fixed_weekly: the amount; per_mile: the optional fixed weekly part. */
  amount_cents: Cents | null;
  rate_cents_per_mile: number | null;
  free_miles: number | null;
  starts_on: string;
  ends_on: string | null;
};

export type StatementLine = {
  line_type: "load" | "extra" | "deduction" | "carryover";
  load_id: string | null;
  deduction_id: string | null;
  description: string;
  detail: string | null;
  miles: number | null;
  value_cents: Cents | null;
  fee_cents: Cents | null;
  /** Effect on net pay. */
  amount_cents: Cents;
};

export type Statement = {
  weekStart: string;
  lines: StatementLine[];
  loadCount: number;
  grossCents: Cents;
  companyFeeCents: Cents;
  extrasCents: Cents;
  deductionsCents: Cents;
  carriedInCents: Cents;
  netCents: Cents;
  /** Picked up this week but not delivered yet: the statement can't be finalized. */
  pending: { loadId: string; loadNumber: string; status: LoadStatus }[];
  /** Delivered loads with no pay rule on the pickup day: can't be paid until one is added. */
  missingRule: { loadId: string; loadNumber: string }[];
};

export const isDeductionActive = (d: Pick<StatementDeduction, "starts_on" | "ends_on">, weekStart: string) =>
  d.starts_on <= weekEnd(weekStart) && (d.ends_on === null || d.ends_on >= weekStart);

const pct = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function buildStatement(input: {
  weekStart: string;
  loads: readonly StatementLoad[];
  deductions: readonly StatementDeduction[];
  carriedInCents: Cents;
}): Statement {
  const lines: StatementLine[] = [];
  const pending: Statement["pending"] = [];
  const missingRule: Statement["missingRule"] = [];
  let gross = 0;
  let fee = 0;
  let extras = 0;
  let loadCount = 0;
  let weekTenths = 0;

  for (const l of input.loads) {
    if (l.status === "cancelled") continue;
    if (!PAID_LOAD_STATUSES.includes(l.status)) {
      pending.push({ loadId: l.loadId, loadNumber: l.loadNumber, status: l.status });
      continue;
    }
    if (!l.rule) {
      missingRule.push({ loadId: l.loadId, loadNumber: l.loadNumber });
      continue;
    }
    const pay = driverLoadPay(l.rule, { valueCents: l.valueCents, loaded_miles: l.loaded_miles, deadhead_miles: l.deadhead_miles });
    const isShare = pay.companyFeeCents !== null;
    gross += isShare ? l.valueCents : pay.baseCents;
    fee += pay.companyFeeCents ?? 0;
    loadCount += 1;
    weekTenths += Math.round((l.loaded_miles ?? 0) * 10) + Math.round((l.deadhead_miles ?? 0) * 10);
    lines.push({
      line_type: "load",
      load_id: l.loadId,
      deduction_id: null,
      description: `Load ${l.loadNumber} · ${l.route}`,
      detail: describePayRule(l.rule),
      miles: pay.paidMiles,
      value_cents: isShare ? l.valueCents : null,
      fee_cents: pay.companyFeeCents,
      amount_cents: pay.baseCents,
    });
    for (const x of l.extras) {
      extras += x.amountCents;
      lines.push({
        line_type: "extra", load_id: l.loadId, deduction_id: null, description: `Load ${l.loadNumber} · ${x.description}`,
        detail: null, miles: null, value_cents: null, fee_cents: null, amount_cents: x.amountCents,
      });
    }
  }

  const active = input.deductions
    .filter((d) => isDeductionActive(d, input.weekStart))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.name.localeCompare(b.name));
  let deductions = 0;
  for (const d of active) {
    const { amount, detail, miles } = deductionAmount(d, gross, weekTenths);
    deductions += amount;
    lines.push({
      line_type: "deduction", load_id: null, deduction_id: d.id, description: d.name, detail,
      miles, value_cents: d.kind === "percent_of_gross" ? gross : null, fee_cents: null,
      amount_cents: amount === 0 ? 0 : -amount,
    });
  }

  const carried = carriedIn(input.carriedInCents);
  if (carried < 0) {
    lines.push({
      line_type: "carryover", load_id: null, deduction_id: null, description: "Balance from previous statement",
      detail: null, miles: null, value_cents: null, fee_cents: null, amount_cents: carried,
    });
  }

  const net = sumCents([gross, -fee, extras, -deductions, carried]);
  return {
    weekStart: input.weekStart, lines, loadCount, grossCents: gross, companyFeeCents: fee, extrasCents: extras,
    deductionsCents: deductions, carriedInCents: carried, netCents: net, pending, missingRule,
  };
}

/** One deduction for a week with `gross` cents and `weekTenths` tenths of a mile (loaded + empty). */
export function deductionAmount(
  d: Pick<StatementDeduction, "kind" | "percent" | "amount_cents" | "rate_cents_per_mile" | "free_miles">,
  gross: Cents,
  weekTenths: number,
): { amount: Cents; detail: string; miles: number | null } {
  if (d.kind === "percent_of_gross") {
    return { amount: roundDiv(gross * Math.round((d.percent ?? 0) * 100), 10_000), detail: `${pct(d.percent ?? 0)}% of gross`, miles: null };
  }
  if (d.kind === "fixed_weekly") return { amount: d.amount_cents ?? 0, detail: "Weekly", miles: null };
  const fixed = d.amount_cents ?? 0;
  const freeTenths = Math.round((d.free_miles ?? 0) * 10);
  const overTenths = Math.max(0, weekTenths - freeTenths);
  const rate = d.rate_cents_per_mile ?? 0;
  const perMile = `${formatMiles(overTenths / 10)} mi × ${formatCents(rate)}` + (freeTenths > 0 ? ` over ${formatMiles(freeTenths / 10)} mi` : "");
  return {
    amount: fixed + roundDiv(rate * overTenths, 10),
    detail: `${fixed > 0 ? `${formatCents(fixed)} weekly + ` : ""}${perMile} (${formatMiles(weekTenths / 10)} mi this week)`,
    miles: overTenths / 10,
  };
}

/** "10% of gross", "$250.00 / week", "$300.00 / week + $0.10/mi over 2,000 mi a week" (driver page). */
export function describeDeduction(d: Pick<StatementDeduction, "kind" | "percent" | "amount_cents" | "rate_cents_per_mile" | "free_miles">): string {
  if (d.kind === "percent_of_gross") return `${pct(d.percent ?? 0)}% of gross`;
  if (d.kind === "fixed_weekly") return `${formatCents(d.amount_cents ?? 0)} / week`;
  const fixed = d.amount_cents ? `${formatCents(d.amount_cents)} / week + ` : "";
  const free = d.free_miles ? ` over ${formatMiles(d.free_miles)} mi a week` : " (all miles)";
  return `${fixed}${formatCents(d.rate_cents_per_mile ?? 0)}/mi${free}`;
}

/** Why a draft can't be finalized yet ([] = it can). */
export function finalizeBlockers(s: Pick<Statement, "pending" | "missingRule" | "weekStart">, today: string): string[] {
  const out: string[] = [];
  if (addDays(s.weekStart, 7) > today) out.push("This week isn't over yet.");
  if (s.pending.length) out.push(`Not delivered yet: load ${s.pending.map((p) => p.loadNumber).join(", ")}.`);
  if (s.missingRule.length) out.push(`No pay rule on the pickup day: load ${s.missingRule.map((p) => p.loadNumber).join(", ")}.`);
  return out;
}

/** Whether a driver belongs on the week's list even with no loads (a deduction or a debt applies). */
export const hasWeekActivity = (s: Pick<Statement, "lines" | "pending" | "missingRule">) =>
  s.lines.length > 0 || s.pending.length > 0 || s.missingRule.length > 0;
