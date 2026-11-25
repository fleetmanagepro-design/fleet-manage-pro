import { describe, expect, it } from "vitest";
import {
  type DeliveredLoad, dashboardPeriod, granularityFor, niceScale, periodBuckets, summarize, topAndBottom,
} from "@/modules/analytics/calculations";

const TODAY = "2026-11-25"; // a Wednesday

describe("dashboardPeriod", () => {
  it("resolves each preset in company days", () => {
    expect(dashboardPeriod("week", null, null, TODAY)).toMatchObject({ from: "2026-11-23", to: "2026-11-29" });
    expect(dashboardPeriod("month", null, null, TODAY)).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
    expect(dashboardPeriod("last_month", null, null, TODAY)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(dashboardPeriod("quarter", null, null, TODAY)).toMatchObject({ from: "2026-10-01", to: "2026-12-31" });
    expect(dashboardPeriod("year", null, null, TODAY)).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
    expect(dashboardPeriod("last_month", null, null, "2027-01-15")).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("custom: any two days, swapped if reversed; otherwise this month; unknown → this month", () => {
    expect(dashboardPeriod("custom", "2026-06-30", "2026-06-01", TODAY)).toMatchObject({ key: "custom", from: "2026-06-01", to: "2026-06-30" });
    expect(dashboardPeriod("custom", "x", null, TODAY)).toMatchObject({ key: "custom", from: "2026-11-01" });
    expect(dashboardPeriod("bogus", null, null, TODAY)).toMatchObject({ key: "month", label: "11/01/2026 – 11/30/2026" });
  });
});

describe("buckets", () => {
  it("days up to a month, weeks up to a quarter, months beyond — with empty buckets kept", () => {
    expect(granularityFor({ from: "2026-11-01", to: "2026-11-30" })).toBe("day");
    expect(granularityFor({ from: "2026-10-01", to: "2026-12-31" })).toBe("week");
    expect(granularityFor({ from: "2026-01-01", to: "2026-12-31" })).toBe("month");
    expect(periodBuckets({ from: "2026-11-23", to: "2026-11-29" })).toHaveLength(7);
    expect(periodBuckets({ from: "2026-01-01", to: "2026-12-31" }).map((b) => b.label).slice(0, 2)).toEqual(["Jan 26", "Feb 26"]);
    const weeks = periodBuckets({ from: "2026-10-01", to: "2026-12-31" });
    expect(weeks[0].key).toBe("2026-09-28"); // the Monday of the first day's week
  });
});

const load = (o: Partial<DeliveredLoad>): DeliveredLoad => ({
  id: "l", deliveredDay: "2026-11-24", valueCents: 100000, loaded_miles: 400, deadhead_miles: 100,
  truck: { id: "t1", unit_number: "101" }, driverPayCents: 50000, ...o,
});

describe("summarize", () => {
  it("totals, RPM, empty %, driver pay, contribution and the daily series", () => {
    const s = summarize([load({}), load({ id: "b", valueCents: 300000, deliveredDay: "2026-11-25", truck: { id: "t2", unit_number: "102" } })],
      { from: "2026-11-23", to: "2026-11-29" });
    expect(s).toMatchObject({ loadsDelivered: 2, revenueCents: 400000, miles: 1000, loadedMiles: 800, rpmCents: 400, emptyPercent: 20,
      driverPayCents: 100000, contributionCents: 300000 });
    expect(s.series.map((b) => b.revenueCents)).toEqual([0, 100000, 300000, 0, 0, 0, 0]);
    expect(s.trucks.map((t) => [t.unit, t.revenueCents, t.rpmCents])).toEqual([["102", 300000, 600], ["101", 100000, 200]]);
  });
  it("no loads: zeros, no RPM or empty %; unknown pay hides pay and contribution", () => {
    expect(summarize([], { from: "2026-11-01", to: "2026-11-30" })).toMatchObject({ revenueCents: 0, rpmCents: null, emptyPercent: null, driverPayCents: 0 });
    expect(summarize([load({ driverPayCents: null })], { from: "2026-11-01", to: "2026-11-30" })).toMatchObject({ driverPayCents: null, contributionCents: null });
  });
  it("negative contribution is shown as negative", () => {
    expect(summarize([load({ valueCents: 10000, driverPayCents: 25000 })], { from: "2026-11-01", to: "2026-11-30" }).contributionCents).toBe(-15000);
  });
});

describe("helpers", () => {
  it("top and bottom never overlap", () => {
    expect(topAndBottom([1, 2, 3, 4, 5, 6, 7], 5)).toEqual({ top: [1, 2, 3, 4, 5], bottom: [7, 6] });
    expect(topAndBottom([1, 2], 5)).toEqual({ top: [1, 2], bottom: [] });
  });
  it("round axis tops", () => {
    expect(niceScale(9300)).toEqual({ top: 10000, step: 2500 });
    expect(niceScale(0)).toEqual({ top: 4, step: 1 });
    expect(niceScale(410000).top).toBe(500000);
  });
});
