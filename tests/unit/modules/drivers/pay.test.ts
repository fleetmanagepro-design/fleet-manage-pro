import { describe, expect, it } from "vitest";
import { companyFeePercent, driverLoadPay } from "@/modules/drivers/pay";

const owner = { pay_type: "percent" as const, percent: 88, rate_cents_per_mile: null, miles_basis: null, flat_cents: null };
const company = (basis: "loaded" | "all") => ({ pay_type: "per_mile" as const, percent: null, rate_cents_per_mile: 58, miles_basis: basis, flat_cents: null });

describe("driverLoadPay — owner-operator", () => {
  it("keeps 88% of the load value; 12% is the company fee (the user's example)", () => {
    // $3,600 rate + $200 on-time bonus = $3,800 value; unloaded himself +$100
    const pay = driverLoadPay(owner, { valueCents: 380000, loaded_miles: 1000, deadhead_miles: 0 }, [10000]);
    expect(pay).toEqual({ baseCents: 334400, companyFeeCents: 45600, extrasCents: 10000, totalCents: 344400, paidMiles: null });
  });

  it("applies the percentage to the value after a late penalty", () => {
    const pay = driverLoadPay(owner, { valueCents: 340000, loaded_miles: 1000, deadhead_miles: 0 });
    expect(pay.baseCents).toBe(299200);
    expect(pay.companyFeeCents).toBe(40800);
  });

  it("rounds half up to whole cents and handles fractional percentages", () => {
    expect(driverLoadPay({ ...owner, percent: 87.5 }, { valueCents: 101, loaded_miles: 0, deadhead_miles: 0 }).baseCents).toBe(88); // 88.375
    expect(driverLoadPay(owner, { valueCents: 125, loaded_miles: 0, deadhead_miles: 0 }).baseCents).toBe(110); // 110.0
    expect(driverLoadPay(owner, { valueCents: 0, loaded_miles: 0, deadhead_miles: 0 }).totalCents).toBe(0);
  });
});

describe("driverLoadPay — company driver", () => {
  it("pays per loaded mile or per total mile", () => {
    const load = { valueCents: 360000, loaded_miles: 1000.5, deadhead_miles: 49.5 };
    expect(driverLoadPay(company("loaded"), load)).toMatchObject({ baseCents: 58029, paidMiles: 1000.5, companyFeeCents: null }); // 580.29
    expect(driverLoadPay(company("all"), load)).toMatchObject({ baseCents: 60900, paidMiles: 1050 });
  });

  it("pays nothing without miles, plus extras in full", () => {
    expect(driverLoadPay(company("loaded"), { valueCents: 0, loaded_miles: null, deadhead_miles: null }, [10000, 5000]).totalCents).toBe(15000);
  });
});

describe("companyFeePercent", () => {
  it("is 100 minus the driver's share", () => {
    expect(companyFeePercent(88)).toBe(12);
    expect(companyFeePercent(87.5)).toBe(12.5);
  });
});
