import { formatCents } from "@/lib/money";
import { MILES_BASIS_LABELS, PERCENT_BASIS_LABELS, type MilesBasis, type PayType, type PercentBasis } from "./labels";

export type PayRule = {
  id: string;
  effective_from: string;
  pay_type: PayType;
  rate_cents_per_mile: number | null;
  miles_basis: MilesBasis | null;
  percent: number | null;
  percent_basis: PercentBasis | null;
  flat_cents: number | null;
  stop_pay_cents: number;
  detention_pay_cents_per_hour: number;
};

/**
 * The rule that applies on `date` ("YYYY-MM-DD"): the latest with effective_from <= date
 * (PRODUCT_SPEC.md §3). Null when the driver had no rule yet.
 */
export function ruleInEffect<R extends Pick<PayRule, "effective_from">>(rules: readonly R[], date: string): R | null {
  let best: R | null = null;
  for (const r of rules) {
    if (r.effective_from <= date && (!best || r.effective_from > best.effective_from)) best = r;
  }
  return best;
}

/** A rule already in effect is history and can't be changed (decision of 11/09/2026). */
export function isRuleLocked(rule: Pick<PayRule, "effective_from">, today: string): boolean {
  return rule.effective_from <= today;
}

/** "$0.58/mi on loaded miles", "72% of linehaul + fuel surcharge", "$450.00 per load". */
export function describePayRule(rule: PayRule): string {
  switch (rule.pay_type) {
    case "per_mile":
      return `${formatCents(rule.rate_cents_per_mile ?? 0)}/mi on ${MILES_BASIS_LABELS[rule.miles_basis ?? "loaded"]}`;
    case "percent":
      return `${Number(rule.percent ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}% of ${PERCENT_BASIS_LABELS[rule.percent_basis ?? "linehaul"]}`;
    case "flat":
      return `${formatCents(rule.flat_cents ?? 0)} per load`;
  }
}

/** "Stop pay $50.00 · Detention $25.00/h", or "" when there are no extras. */
export function describeExtras(rule: Pick<PayRule, "stop_pay_cents" | "detention_pay_cents_per_hour">): string {
  const parts: string[] = [];
  if (rule.stop_pay_cents > 0) parts.push(`Stop pay ${formatCents(rule.stop_pay_cents)}`);
  if (rule.detention_pay_cents_per_hour > 0) parts.push(`Detention ${formatCents(rule.detention_pay_cents_per_hour)}/h`);
  return parts.join(" · ");
}
