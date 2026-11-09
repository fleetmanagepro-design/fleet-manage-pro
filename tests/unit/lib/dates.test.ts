import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/dates";

describe("formatDate", () => {
  it("formats MM/DD/YYYY in the organization's time zone", () => {
    // 03:30 UTC on Mar 10 is still Mar 9 in Chicago
    expect(formatDate("2026-03-10T03:30:00Z", "America/Chicago")).toBe("03/09/2026");
    expect(formatDate("2026-03-10T03:30:00Z", "America/New_York")).toBe("03/09/2026");
    expect(formatDate("2026-03-10T05:30:00Z", "America/New_York")).toBe("03/10/2026");
  });

  it("throws on invalid input", () => {
    expect(() => formatDate("not a date", "America/Chicago")).toThrow(RangeError);
  });
});
