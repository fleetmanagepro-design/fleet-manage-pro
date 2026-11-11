import { describe, expect, it } from "vitest";
import {
  type StatementDeduction, type StatementLoad, buildStatement, carriedIn, deductionAmount, describeDeduction, finalizeBlockers, hasWeekActivity,
  isDeductionActive, isInWeek, loadPayDay,
} from "@/modules/drivers/calculations";
import type { PayRule } from "@/modules/drivers/pay-rules";

const base = { id: "r", effective_from: "2026-01-01", stop_pay_cents: 0, detention_pay_cents_per_hour: 0, flat_cents: null };
const owner: PayRule = { ...base, pay_type: "percent", percent: 88, percent_basis: "total", rate_cents_per_mile: null, miles_basis: null };
const company: PayRule = { ...base, pay_type: "per_mile", percent: null, percent_basis: null, rate_cents_per_mile: 58, miles_basis: "loaded" };

const WEEK = "2026-11-02"; // Monday
const load = (o: Partial<StatementLoad> = {}): StatementLoad => ({
  loadId: "l1", loadNumber: "1042", status: "delivered", route: "Joliet, IL → Columbus, OH",
  valueCents: 380000, loaded_miles: 1000, deadhead_miles: 50, rule: owner, extras: [], ...o,
});
const truckRent: StatementDeduction = { id: "d1", name: "Truck rent", kind: "percent_of_gross", percent: 10, amount_cents: null, rate_cents_per_mile: null, free_miles: null, starts_on: "2026-01-01", ends_on: null };
const trailerRent: StatementDeduction = { id: "d2", name: "Trailer rent", kind: "fixed_weekly", percent: null, amount_cents: 25000, rate_cents_per_mile: null, free_miles: null, starts_on: "2026-01-01", ends_on: null };

describe("buildStatement — owner-operator", () => {
  it("value − company fee + extras − deductions (the user's example)", () => {
    const s = buildStatement({
      weekStart: WEEK,
      loads: [load({ extras: [{ description: "Unloaded the trailer", amountCents: 10000 }] })],
      deductions: [truckRent, trailerRent],
      carriedInCents: 0,
    });
    expect(s).toMatchObject({ loadCount: 1, grossCents: 380000, companyFeeCents: 45600, extrasCents: 10000, deductionsCents: 63000, carriedInCents: 0 });
    // 3,800 − 456 + 100 − 380 (10% of 3,800) − 250 = 2,814
    expect(s.netCents).toBe(281400);
    expect(s.lines.map((l) => [l.line_type, l.amount_cents])).toEqual([
      ["load", 334400], ["extra", 10000], ["deduction", -25000], ["deduction", -38000], // by start date, then name
    ]);
    expect(s.lines.reduce((a, l) => a + l.amount_cents, 0)).toBe(s.netCents);
    expect(s.lines[0]).toMatchObject({ value_cents: 380000, fee_cents: 45600, description: "Load 1042 · Joliet, IL → Columbus, OH" });
  });

  it("a percent deduction is taken from the gross load value, before the company fee (decision 1a)", () => {
    const s = buildStatement({ weekStart: WEEK, loads: [load(), load({ loadId: "l2", loadNumber: "1043", valueCents: 120000 })], deductions: [truckRent], carriedInCents: 0 });
    expect(s.grossCents).toBe(500000);
    expect(s.deductionsCents).toBe(50000);
    expect(s.lines.find((l) => l.line_type === "deduction")).toMatchObject({ value_cents: 500000, detail: "10% of gross" });
  });
});

describe("buildStatement — company driver", () => {
  it("miles × rate is the gross; no company fee; deductions apply too (decision 3)", () => {
    const advance: StatementDeduction = { ...trailerRent, id: "d3", name: "Advance repayment", amount_cents: 10000 };
    const s = buildStatement({ weekStart: WEEK, loads: [load({ rule: company })], deductions: [advance], carriedInCents: 0 });
    expect(s).toMatchObject({ grossCents: 58000, companyFeeCents: 0, deductionsCents: 10000, netCents: 48000 });
    expect(s.lines[0]).toMatchObject({ miles: 1000, value_cents: null, fee_cents: null, amount_cents: 58000 });
  });
});

describe("buildStatement — edge cases", () => {
  it("no loads: weekly deductions still apply and the net goes negative (decision 2a)", () => {
    const s = buildStatement({ weekStart: WEEK, loads: [], deductions: [truckRent, trailerRent], carriedInCents: 0 });
    expect(s).toMatchObject({ grossCents: 0, deductionsCents: 25000, netCents: -25000 });
    expect(s.lines.find((l) => l.description === "Truck rent")?.amount_cents).toBe(0);
  });

  it("a debt from the previous statement is carried in", () => {
    const s = buildStatement({ weekStart: WEEK, loads: [load()], deductions: [], carriedInCents: -25000 });
    expect(s.netCents).toBe(334400 - 25000);
    expect(s.lines.at(-1)).toMatchObject({ line_type: "carryover", amount_cents: -25000 });
    expect(carriedIn(12000)).toBe(0);
    expect(carriedIn(null)).toBe(0);
    expect(carriedIn(-500)).toBe(-500);
  });

  it("undelivered loads are pending; cancelled loads are left out; loads without a rule are flagged", () => {
    const s = buildStatement({
      weekStart: WEEK,
      loads: [load({ status: "in_transit" }), load({ loadId: "c", loadNumber: "9", status: "cancelled" }), load({ loadId: "n", loadNumber: "7", rule: null })],
      deductions: [], carriedInCents: 0,
    });
    expect(s.loadCount).toBe(0);
    expect(s.pending).toEqual([{ loadId: "l1", loadNumber: "1042", status: "in_transit" }]);
    expect(s.missingRule).toEqual([{ loadId: "n", loadNumber: "7" }]);
    expect(hasWeekActivity(s)).toBe(true);
    expect(finalizeBlockers(s, "2026-11-20")).toEqual(["Not delivered yet: load 1042.", "No pay rule on the pickup day: load 7."]);
  });

  it("a penalty that wipes out the value gives zero pay, never negative fee rounding", () => {
    const s = buildStatement({ weekStart: WEEK, loads: [load({ valueCents: 0 })], deductions: [], carriedInCents: 0 });
    expect(s).toMatchObject({ grossCents: 0, companyFeeCents: 0, netCents: 0 });
  });

  it("an empty week with nothing applying has no activity", () => {
    expect(hasWeekActivity(buildStatement({ weekStart: WEEK, loads: [], deductions: [], carriedInCents: 0 }))).toBe(false);
  });
});

describe("weeks", () => {
  it("a deduction applies if it is active on any day of the week", () => {
    expect(isDeductionActive({ starts_on: "2026-11-08", ends_on: null }, WEEK)).toBe(true); // starts Sunday
    expect(isDeductionActive({ starts_on: "2026-11-09", ends_on: null }, WEEK)).toBe(false);
    expect(isDeductionActive({ starts_on: "2026-01-01", ends_on: "2026-11-02" }, WEEK)).toBe(true); // ended Monday
    expect(isDeductionActive({ starts_on: "2026-01-01", ends_on: "2026-11-01" }, WEEK)).toBe(false);
  });

  it("only finalizes a week that is over", () => {
    const s = { pending: [], missingRule: [], weekStart: WEEK };
    expect(finalizeBlockers(s, "2026-11-08")).toEqual(["This week isn't over yet."]);
    expect(finalizeBlockers(s, "2026-11-09")).toEqual([]);
  });

  it("a load belongs to the week of its first pickup in company time, not its delivery", () => {
    const stops = [
      { stop_type: "delivery", sequence: 3, appointment_start: "2026-11-10T15:00:00Z" },
      { stop_type: "pickup", sequence: 2, appointment_start: "2026-11-09T15:00:00Z" },
      // Sunday 11/08 10:30 pm in Chicago = Monday 04:30 UTC
      { stop_type: "pickup", sequence: 1, appointment_start: "2026-11-09T04:30:00Z" },
    ];
    const day = loadPayDay(stops, "2026-11-10T20:00:00Z", "America/Chicago");
    expect(day).toBe("2026-11-08");
    expect(isInWeek(day!, WEEK)).toBe(true);
    expect(isInWeek("2026-11-09", WEEK)).toBe(false);
  });

  it("falls back to the delivery day without a pickup appointment", () => {
    expect(loadPayDay([{ stop_type: "pickup", sequence: 1, appointment_start: null }], "2026-11-03T02:00:00Z", "America/Chicago")).toBe("2026-11-02");
    expect(loadPayDay([], null, "America/Chicago")).toBeNull();
  });
});

describe("per-mile deductions (truck / trailer rent by agreement)", () => {
  const truckRentPerMile: StatementDeduction = {
    id: "d9", name: "Truck rent", kind: "per_mile", percent: null, amount_cents: 30000, rate_cents_per_mile: 10, free_miles: 2000,
    starts_on: "2026-01-01", ends_on: null,
  };

  it("fixed weekly part + rate per mile over the free miles, counting loaded + empty miles", () => {
    // 2 loads: 1,000 + 50 and 1,500 + 50 = 2,600 mi; 600 over 2,000 → $60 + $300 = $360
    const s = buildStatement({
      weekStart: WEEK,
      loads: [load(), load({ loadId: "l2", loadNumber: "1043", loaded_miles: 1500, deadhead_miles: 50 })],
      deductions: [truckRentPerMile], carriedInCents: 0,
    });
    const line = s.lines.find((l) => l.line_type === "deduction")!;
    expect(line).toMatchObject({ amount_cents: -36000, miles: 600 });
    expect(line.detail).toBe("$300.00 weekly + 600 mi × $0.10 over 2,000 mi (2,600 mi this week)");
    expect(s.deductionsCents).toBe(36000);
  });

  it("under or exactly at the free miles: only the fixed part", () => {
    expect(deductionAmount(truckRentPerMile, 0, 19_999).amount).toBe(30000);
    expect(deductionAmount(truckRentPerMile, 0, 20_000).amount).toBe(30000);
    expect(deductionAmount(truckRentPerMile, 0, 20_001).amount).toBe(30001); // 0.1 mi × 10¢ = 1¢
  });

  it("no loads: the fixed part still applies; without a fixed part nothing is deducted", () => {
    expect(buildStatement({ weekStart: WEEK, loads: [], deductions: [truckRentPerMile], carriedInCents: 0 }).netCents).toBe(-30000);
    expect(deductionAmount({ ...truckRentPerMile, amount_cents: null }, 0, 0)).toMatchObject({ amount: 0, miles: 0 });
  });

  it("zero free miles charges every mile, rounding half up to the cent", () => {
    const d = { ...truckRentPerMile, amount_cents: null, free_miles: 0, rate_cents_per_mile: 5 };
    expect(deductionAmount(d, 0, 10_005).amount).toBe(5003); // 1,000.5 mi × 5¢ = 5,002.5¢
    expect(deductionAmount(d, 0, 10_005).detail).toBe("1,000.5 mi × $0.05 (1,000.5 mi this week)");
  });

  it("describes every kind for the driver page", () => {
    expect(describeDeduction(truckRent)).toBe("10% of gross");
    expect(describeDeduction(trailerRent)).toBe("$250.00 / week");
    expect(describeDeduction(truckRentPerMile)).toBe("$300.00 / week + $0.10/mi over 2,000 mi a week");
    expect(describeDeduction({ ...truckRentPerMile, amount_cents: null, free_miles: 0 })).toBe("$0.10/mi (all miles)");
  });
});
