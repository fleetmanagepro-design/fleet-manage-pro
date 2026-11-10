import { describe, expect, it } from "vitest";
import { emptyMilePercent, loadRevenueCents, revenuePerMileCents, totalMiles } from "@/modules/dispatch/calculations";

const load = { linehaul_cents: 120000, fuel_surcharge_cents: 18000, loaded_miles: 355, deadhead_miles: 45 };

describe("loadRevenueCents", () => {
  it("adds linehaul, fuel surcharge and billable accessorials only", () => {
    expect(loadRevenueCents(load)).toBe(138000);
    expect(
      loadRevenueCents(load, [
        { amount_cents: 15000, billable_to_customer: true },
        { amount_cents: 9000, billable_to_customer: false },
      ]),
    ).toBe(153000);
  });

  it("is zero for a load with no revenue (e.g. TONU not billed yet)", () => {
    expect(loadRevenueCents({ ...load, linehaul_cents: 0, fuel_surcharge_cents: 0 })).toBe(0);
  });
});

describe("miles", () => {
  it("adds loaded and deadhead without float noise", () => {
    expect(totalMiles({ loaded_miles: 362.3, deadhead_miles: 40.1 })).toBe(402.4);
    expect(totalMiles({ loaded_miles: null, deadhead_miles: null })).toBe(0);
  });

  it("computes empty mile %", () => {
    expect(emptyMilePercent(load)).toBe(11.3); // 45 / 400
    expect(emptyMilePercent({ loaded_miles: 100, deadhead_miles: 0 })).toBe(0);
    expect(emptyMilePercent({ loaded_miles: 0, deadhead_miles: 0 })).toBeNull();
  });
});

describe("revenuePerMileCents", () => {
  it("rounds half up to whole cents", () => {
    expect(revenuePerMileCents(138000, 400)).toBe(345); // $3.45/mi
    expect(revenuePerMileCents(100, 3)).toBe(33); // 33.33…
    expect(revenuePerMileCents(200, 3)).toBe(67); // 66.67…
    expect(revenuePerMileCents(150, 100)).toBe(2); // 1.5 → 2
    expect(revenuePerMileCents(100000, 402.4)).toBe(249); // 248.51…
  });

  it("is null without miles and handles zero revenue", () => {
    expect(revenuePerMileCents(138000, 0)).toBeNull();
    expect(revenuePerMileCents(0, 500)).toBe(0);
  });
});
