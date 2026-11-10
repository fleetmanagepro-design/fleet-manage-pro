import { type Cents, sumCents } from "@/lib/money";

/**
 * Load money and miles (PRODUCT_SPEC.md §3). Pure functions; every caller uses these.
 * Miles are numeric(10,1); they're converted to tenths so division stays exact.
 */

export type AccessorialLike = { amount_cents: Cents; billable_to_customer: boolean };

export type LoadMoney = {
  linehaul_cents: Cents;
  fuel_surcharge_cents: Cents;
  loaded_miles: number | null;
  deadhead_miles: number | null;
};

const toTenths = (miles: number | null | undefined) => Math.round((miles ?? 0) * 10);

/** Revenue = linehaul + fuel surcharge + accessorials billed to the customer. */
export function loadRevenueCents(load: LoadMoney, accessorials: readonly AccessorialLike[] = []): Cents {
  return sumCents([
    load.linehaul_cents,
    load.fuel_surcharge_cents,
    ...accessorials.filter((a) => a.billable_to_customer).map((a) => a.amount_cents),
  ]);
}

/** Loaded + deadhead, to one decimal. */
export function totalMiles(load: Pick<LoadMoney, "loaded_miles" | "deadhead_miles">): number {
  return (toTenths(load.loaded_miles) + toTenths(load.deadhead_miles)) / 10;
}

/** Revenue per total mile in cents (rounded half up); null without miles. */
export function revenuePerMileCents(revenueCents: Cents, miles: number): Cents | null {
  const tenths = toTenths(miles);
  if (tenths <= 0) return null;
  // cents / (tenths / 10) = cents * 10 / tenths
  const numerator = revenueCents * 10;
  const q = Math.floor(numerator / tenths);
  const r = numerator - q * tenths;
  return r * 2 >= tenths ? q + 1 : q;
}

/** Deadhead ÷ total miles as a percentage with one decimal; null without miles. */
export function emptyMilePercent(load: Pick<LoadMoney, "loaded_miles" | "deadhead_miles">): number | null {
  const dead = toTenths(load.deadhead_miles);
  const total = toTenths(load.loaded_miles) + dead;
  if (total <= 0) return null;
  return Math.round((dead * 1000) / total) / 10;
}
