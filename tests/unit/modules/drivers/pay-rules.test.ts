import { describe, expect, it } from "vitest";
import { describeExtras, describePayRule, isRuleLocked, ruleInEffect, type PayRule } from "@/modules/drivers/pay-rules";

const rule = (o: Partial<PayRule>): PayRule => ({
  id: o.effective_from ?? "r",
  effective_from: "2026-01-01",
  pay_type: "per_mile",
  rate_cents_per_mile: 55,
  miles_basis: "loaded",
  percent: null,
  percent_basis: null,
  flat_cents: null,
  stop_pay_cents: 0,
  detention_pay_cents_per_hour: 0,
  ...o,
});

describe("ruleInEffect", () => {
  const rules = [rule({ effective_from: "2025-03-01" }), rule({ effective_from: "2026-09-10" }), rule({ effective_from: "2026-11-30" })];

  it("picks the latest rule starting on or before the date, in any order", () => {
    expect(ruleInEffect(rules, "2026-11-09")?.effective_from).toBe("2026-09-10");
    expect(ruleInEffect([...rules].reverse(), "2026-09-10")?.effective_from).toBe("2026-09-10");
    expect(ruleInEffect(rules, "2026-12-01")?.effective_from).toBe("2026-11-30");
  });

  it("returns null before the first rule or with no rules", () => {
    expect(ruleInEffect(rules, "2025-02-28")).toBeNull();
    expect(ruleInEffect([], "2026-01-01")).toBeNull();
  });
});

describe("isRuleLocked", () => {
  it("locks rules that started today or earlier", () => {
    expect(isRuleLocked({ effective_from: "2026-11-09" }, "2026-11-09")).toBe(true);
    expect(isRuleLocked({ effective_from: "2026-11-10" }, "2026-11-09")).toBe(false);
  });
});

describe("describePayRule", () => {
  it("describes each pay type", () => {
    expect(describePayRule(rule({ rate_cents_per_mile: 58 }))).toBe("$0.58/mi on loaded miles");
    expect(describePayRule(rule({ rate_cents_per_mile: 32, miles_basis: "all" }))).toBe("$0.32/mi on all miles");
    expect(
      describePayRule(rule({ pay_type: "percent", rate_cents_per_mile: null, miles_basis: null, percent: 72.5, percent_basis: "linehaul_fsc" })),
    ).toBe("72.5% of linehaul + fuel surcharge");
    expect(describePayRule(rule({ pay_type: "flat", rate_cents_per_mile: null, miles_basis: null, flat_cents: 45000 }))).toBe(
      "$450.00 per load",
    );
  });

  it("lists extras", () => {
    expect(describeExtras(rule({ stop_pay_cents: 5000, detention_pay_cents_per_hour: 2500 }))).toBe(
      "Stop pay $50.00 · Detention $25.00/h",
    );
    expect(describeExtras(rule({}))).toBe("");
  });
});
