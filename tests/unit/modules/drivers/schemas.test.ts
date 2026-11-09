import { describe, expect, it } from "vitest";
import { driverSchema, payRuleSchema } from "@/modules/drivers/schemas";

const DRIVER = "a0000000-0000-4000-8000-000000000001";

describe("payRuleSchema", () => {
  const base = { driverId: DRIVER, effectiveFrom: "2026-12-01", stopPayCents: "", detentionPayCentsPerHour: "", notes: "" };

  it("parses per-mile pay into cents", () => {
    const r = payRuleSchema.parse({ ...base, payType: "per_mile", ratePerMile: "0.58", milesBasis: "loaded", stopPayCents: "50" });
    expect(r).toMatchObject({ payType: "per_mile", ratePerMile: 58, milesBasis: "loaded", stopPayCents: 5000, detentionPayCentsPerHour: 0 });
  });

  it("parses percent and flat pay", () => {
    expect(payRuleSchema.parse({ ...base, payType: "percent", percent: "72.5", percentBasis: "linehaul_fsc" })).toMatchObject({ percent: 72.5 });
    expect(payRuleSchema.parse({ ...base, payType: "flat", flatAmount: "$450" })).toMatchObject({ flatAmount: 45000 });
  });

  it.each([
    [{ payType: "per_mile", ratePerMile: "0", milesBasis: "loaded" }, "ratePerMile"],
    [{ payType: "per_mile", ratePerMile: "0.585", milesBasis: "loaded" }, "ratePerMile"],
    [{ payType: "per_mile", ratePerMile: "0.58" }, "milesBasis"],
    [{ payType: "percent", percent: "0", percentBasis: "linehaul" }, "percent"],
    [{ payType: "percent", percent: "100.5", percentBasis: "linehaul" }, "percent"],
    [{ payType: "flat", flatAmount: "-10" }, "flatAmount"],
    [{ payType: "flat", flatAmount: "450", effectiveFrom: "12/01/2026" }, "effectiveFrom"],
    [{ payType: "hourly" }, "payType"],
  ])("rejects %j", (o, field) => {
    const r = payRuleSchema.safeParse({ ...base, ...o });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toContain(field);
  });
});

describe("driverSchema", () => {
  const d = (o: Record<string, string> = {}) =>
    driverSchema.safeParse({ firstName: "Ana", lastName: "Petrov", driverType: "company", status: "active", ...o });

  it("accepts a minimal driver and normalizes CDL and email", () => {
    const r = d({ cdlNumber: "l1234", cdlState: "il", email: " Ana@Example.com " });
    expect(r.data).toMatchObject({ cdlNumber: "L1234", cdlState: "IL", email: "ana@example.com" });
  });

  it("requires the CDL state when a CDL number is given", () => {
    const r = d({ cdlNumber: "L1234" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["cdlState"]);
  });

  it("rejects an invalid default truck id", () => {
    expect(d({ defaultTruckId: "101" }).success).toBe(false);
    expect(d({ defaultTruckId: "" }).success).toBe(true);
  });
});
