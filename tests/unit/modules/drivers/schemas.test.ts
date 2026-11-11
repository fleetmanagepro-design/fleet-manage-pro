import { describe, expect, it } from "vitest";
import { deductionSchema, driverSchema, payRuleSchema } from "@/modules/drivers/schemas";

const DRIVER = "a0000000-0000-4000-8000-000000000001";

describe("payRuleSchema", () => {
  const base = { driverId: DRIVER, effectiveFrom: "2026-12-01", notes: "" };

  it("parses company-driver pay per mile into cents", () => {
    const r = payRuleSchema.parse({ ...base, payType: "per_mile", ratePerMile: "0.58", milesBasis: "loaded" });
    expect(r).toMatchObject({ payType: "per_mile", ratePerMile: 58, milesBasis: "loaded" });
  });

  it("parses the owner-operator company fee", () => {
    expect(payRuleSchema.parse({ ...base, payType: "percent", companyFeePercent: "12" })).toMatchObject({ companyFeePercent: 12 });
    expect(payRuleSchema.parse({ ...base, payType: "percent", companyFeePercent: "12.5" })).toMatchObject({ companyFeePercent: 12.5 });
  });

  it.each([
    [{ payType: "per_mile", ratePerMile: "0", milesBasis: "loaded" }, "ratePerMile"],
    [{ payType: "per_mile", ratePerMile: "0.585", milesBasis: "loaded" }, "ratePerMile"],
    [{ payType: "per_mile", ratePerMile: "0.58" }, "milesBasis"],
    [{ payType: "percent", companyFeePercent: "100" }, "companyFeePercent"],
    [{ payType: "percent", companyFeePercent: "-1" }, "companyFeePercent"],
    [{ payType: "percent", companyFeePercent: "12", effectiveFrom: "12/01/2026" }, "effectiveFrom"],
    [{ payType: "flat" }, "payType"],
  ])("rejects %j", (o, field) => {
    const r = payRuleSchema.safeParse({ ...base, ...o });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toContain(field);
  });
});

describe("deductionSchema", () => {
  const base = { driverId: DRIVER, name: "Truck rent", startsOn: "2026-11-09" };
  it("accepts % of gross or a fixed weekly amount", () => {
    expect(deductionSchema.parse({ ...base, kind: "percent_of_gross", percent: "10" })).toMatchObject({ percent: 10 });
    expect(deductionSchema.parse({ ...base, kind: "fixed_weekly", amount: "250" })).toMatchObject({ amount: 25000 });
  });
  it("accepts weekly + per mile over free miles; the weekly part and free miles are optional", () => {
    expect(deductionSchema.parse({ ...base, kind: "per_mile", amount: "300", ratePerMile: "0.10", freeMiles: "2,000" }))
      .toMatchObject({ amount: 30000, ratePerMile: 10, freeMiles: 2000 });
    expect(deductionSchema.parse({ ...base, kind: "per_mile", amount: "", ratePerMile: "0.05", freeMiles: "" }))
      .toMatchObject({ amount: undefined, ratePerMile: 5, freeMiles: 0 });
    expect(deductionSchema.safeParse({ ...base, kind: "per_mile", ratePerMile: "0", freeMiles: "0" }).success).toBe(false);
    expect(deductionSchema.safeParse({ ...base, kind: "per_mile", ratePerMile: "0.10", freeMiles: "-5" }).success).toBe(false);
  });
  it("rejects missing amounts and names", () => {
    expect(deductionSchema.safeParse({ ...base, kind: "fixed_weekly", amount: "" }).success).toBe(false);
    expect(deductionSchema.safeParse({ ...base, name: "", kind: "percent_of_gross", percent: "10" }).success).toBe(false);
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
