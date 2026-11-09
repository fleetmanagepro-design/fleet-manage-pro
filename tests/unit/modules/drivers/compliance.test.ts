import { describe, expect, it } from "vitest";
import { driverCompliance, isBlockedFromDriving } from "@/modules/drivers/compliance";

const T = "2026-11-09";

describe("driverCompliance", () => {
  it("warns at 60 and 30 days and on expiry (PRODUCT_SPEC §4.7)", () => {
    const at = (cdl: string) => driverCompliance({ cdl_expires_on: cdl, medical_card_expires_on: null }, T)[0].state;
    expect(at("2027-02-01")).toBe("ok");
    expect(at("2026-12-25")).toBe("upcoming"); // 46 days
    expect(at("2026-11-30")).toBe("due_soon"); // 21 days
    expect(at(T)).toBe("due_soon");
    expect(at("2026-11-01")).toBe("expired");
  });

  it("blocks dispatch only when a document has expired", () => {
    expect(isBlockedFromDriving(driverCompliance({ cdl_expires_on: "2026-11-30", medical_card_expires_on: null }, T))).toBe(false);
    expect(isBlockedFromDriving(driverCompliance({ cdl_expires_on: "2027-11-30", medical_card_expires_on: "2026-11-01" }, T))).toBe(true);
  });
});
