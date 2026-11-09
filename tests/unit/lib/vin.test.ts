import { describe, expect, it } from "vitest";
import { hasValidCheckDigit, isValidVinFormat, normalizeVin } from "@/lib/vin";

describe("VIN", () => {
  it("normalizes case, spaces and dashes", () => {
    expect(normalizeVin(" 1xkyd49x5kp-048347 ")).toBe("1XKYD49X5KP048347");
  });

  it("requires 17 characters without I, O or Q", () => {
    expect(isValidVinFormat("1XKYD49X5KP048347")).toBe(true);
    expect(isValidVinFormat("1XKYD49X5KP04834")).toBe(false);
    for (const bad of ["1XKYD49X5KP04834I", "1XKYD49X5KP04834O", "1XKYD49X5KP04834Q", "1XKYD49X5KP04834-"]) {
      expect(isValidVinFormat(bad)).toBe(false);
    }
  });

  it("checks the position-9 check digit", () => {
    expect(hasValidCheckDigit("1M8GDM9AXKP042788")).toBe(true); // NHTSA example, check digit X
    expect(hasValidCheckDigit("1XKYD49X5KP048347")).toBe(true); // seeded truck 101
    expect(hasValidCheckDigit("1XKYD49X6KP048347")).toBe(false);
    expect(hasValidCheckDigit("not a vin")).toBe(false);
  });
});
