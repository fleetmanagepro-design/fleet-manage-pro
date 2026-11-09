import { describe, expect, it } from "vitest";
import { complianceItems, worstState } from "@/modules/fleet/compliance";

const TODAY = "2026-11-09";

describe("complianceItems", () => {
  it("flags expired, due within 30 days, ok and missing", () => {
    const items = complianceItems(
      { registration_expires_on: "2026-11-01", annual_inspection_on: "2025-12-01", annual_inspection_valid_months: 12, insurance_expires_on: null },
      TODAY,
    );
    expect(items.map((i) => [i.key, i.state, i.daysLeft])).toEqual([
      ["registration", "expired", -8],
      ["annual_inspection", "due_soon", 22], // due 12/01/2026
      ["insurance", "missing", null],
    ]);
  });

  it("treats exactly 30 days as due soon, 31 as ok, and today as still valid", () => {
    const at = (d: string) => complianceItems({ registration_expires_on: d, annual_inspection_on: null, annual_inspection_valid_months: 12 }, TODAY)[0];
    expect(at("2026-12-09").state).toBe("due_soon");
    expect(at("2026-12-10").state).toBe("ok");
    expect(at(TODAY).state).toBe("due_soon");
    expect(at("2026-11-08").state).toBe("expired");
  });

  it("uses the inspection validity the user chose", () => {
    const due = (months: number) =>
      complianceItems({ registration_expires_on: null, annual_inspection_on: "2026-05-31", annual_inspection_valid_months: months }, TODAY)[1];
    expect(due(3)).toMatchObject({ dueOn: "2026-08-31", state: "expired" });
    expect(due(6)).toMatchObject({ dueOn: "2026-11-30", state: "due_soon", note: "last 05/31/2026, valid 6 months" });
    expect(due(9)).toMatchObject({ dueOn: "2027-02-28", state: "ok" });
    expect(due(12)).toMatchObject({ dueOn: "2027-05-31", state: "ok" });
  });

  it("omits insurance for trailers", () => {
    const items = complianceItems({ registration_expires_on: null, annual_inspection_on: null, annual_inspection_valid_months: 12 }, TODAY);
    expect(items.map((i) => i.key)).toEqual(["registration", "annual_inspection"]);
  });
});

describe("worstState", () => {
  it("ranks expired > due soon > ok > missing", () => {
    const items = complianceItems(
      { registration_expires_on: "2027-06-01", annual_inspection_on: "2026-01-01", annual_inspection_valid_months: 12, insurance_expires_on: null },
      TODAY,
    );
    expect(worstState(items)).toBe("ok");
    expect(worstState([])).toBe("missing");
    expect(
      worstState(complianceItems({ registration_expires_on: "2026-01-01", annual_inspection_on: "2026-01-01", annual_inspection_valid_months: 12 }, TODAY)),
    ).toBe("expired");
  });
});
