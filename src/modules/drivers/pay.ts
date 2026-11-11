import { type Cents, sumCents } from "@/lib/money";
import type { PayRule } from "./pay-rules";

/**
 * Driver pay for one load (decisions of 11/10/2026):
 *   owner-operator ('percent'): keeps `percent`% of the load value; the rest is the company fee
 *   company driver ('per_mile'): rate per mile × loaded miles, or × all miles
 *   plus driver extras on the load (e.g. unloading), paid in full.
 * Integer math throughout: percent in basis points, miles in tenths, half-up rounding.
 */

/** Integer division rounded half away from zero. */
export function roundDiv(numerator: number, denominator: number): number {
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  const q = Math.floor(n / d);
  return sign * (n - q * d >= d - (n - q * d) ? q + 1 : q);
}

export type LoadForPay = {
  valueCents: Cents;
  loaded_miles: number | null;
  deadhead_miles: number | null;
};

export type LoadPay = {
  /** Before extras: the driver's share of the value, or miles × rate. */
  baseCents: Cents;
  /** Owner-operators only: value − share. */
  companyFeeCents: Cents | null;
  extrasCents: Cents;
  totalCents: Cents;
  /** Miles paid for per-mile drivers. */
  paidMiles: number | null;
};

export function driverLoadPay(rule: Pick<PayRule, "pay_type" | "percent" | "rate_cents_per_mile" | "miles_basis" | "flat_cents">,
  load: LoadForPay, extras: readonly Cents[] = []): LoadPay {
  const extrasCents = sumCents(extras);
  let baseCents = 0;
  let companyFeeCents: Cents | null = null;
  let paidMiles: number | null = null;

  if (rule.pay_type === "percent") {
    const bp = Math.round((rule.percent ?? 0) * 100); // 88.00% → 8800
    baseCents = roundDiv(load.valueCents * bp, 10_000);
    companyFeeCents = load.valueCents - baseCents;
  } else if (rule.pay_type === "per_mile") {
    const tenths = Math.round((load.loaded_miles ?? 0) * 10) + (rule.miles_basis === "all" ? Math.round((load.deadhead_miles ?? 0) * 10) : 0);
    paidMiles = tenths / 10;
    baseCents = roundDiv((rule.rate_cents_per_mile ?? 0) * tenths, 10);
  } else {
    baseCents = rule.flat_cents ?? 0;
  }
  return { baseCents, companyFeeCents, extrasCents, totalCents: sumCents([baseCents, extrasCents]), paidMiles };
}

/** Company fee % shown for an owner-operator rule (100 − driver share). */
export const companyFeePercent = (driverSharePercent: number) => Math.round((100 - driverSharePercent) * 100) / 100;
