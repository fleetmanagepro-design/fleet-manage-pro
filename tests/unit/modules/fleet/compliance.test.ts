import { describe, expect, it } from "vitest";
import { complianceItems, worstState } from "@/modules/fleet/compliance";

const TODAY = "2026-11-09";

describe("complianceItems", () => {
  it("flags expired, due within 30 days, ok and missing", () => {
    const items = complianceItems(
      { registration_expires_on: "2026-11-01", annual_inspection_on: "2025-12-01", insurance_expires_on: null },
      TODAY,
    );
    expect(items.map((i) => [i.key, i.state, i.daysLeft])).toEqual([
      ["registration", "expired", -8],
      ["annual_inspection", "due_soon", 22], // due 12/01/2026
      ["insurance", "missing", null],
    ]);
  });

  it("treats exactly 30 days as due soon, 31 as ok, and today as still valid", () => {
    const at = (d: string) => complianceItems({ registration_expires_on: d, annual_inspection_on: null }, TODAY)[0];
    expect(at("2026-12-09").state).toBe("due_soon");
    expect(at("2026-12-10").state).toBe("ok");
    expect(at(TODAY).state).toBe("due_soon");
    expect(at("2026-11-08").state).toBe("expired");
  });

  it("omits insurance for trailers", () => {
    const items = complianceItems({ registration_expires_on: null, annual_inspection_on: null }, TODAY);
    expect(items.map((i) => i.key)).toEqual(["registration", "annual_inspection"]);
  });
});

describe("worstState", () => {
  it("ranks expired > due soon > ok > missing", () => {
    const items = complianceItems(
      { registration_expires_on: "2027-06-01", annual_inspection_on: "2026-01-01", insurance_expires_on: null },
      TODAY,
    );
    expect(worstState(items)).toBe("ok");
    expect(worstState([])).toBe("missing");
    expect(
      worstState(complianceItems({ registration_expires_on: "2026-01-01", annual_inspection_on: "2026-01-01" }, TODAY)),
    ).toBe("expired");
  });
});
