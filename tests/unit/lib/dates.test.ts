import { describe, expect, it } from "vitest";
import { addMonths, addYears, daysBetween, formatCalendarDate, formatDate, isCalendarDate, todayIn } from "@/lib/dates";

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



describe("calendar dates", () => {
  it("formats YYYY-MM-DD as MM/DD/YYYY without time-zone shifts", () => {
    expect(formatCalendarDate("2026-03-09")).toBe("03/09/2026");
    expect(formatCalendarDate(null)).toBe("—");
    expect(() => formatCalendarDate("2026-02-30")).toThrow(RangeError);
  });

  it("gives today's date in a time zone", () => {
    const instant = new Date("2026-03-10T03:30:00Z");
    expect(todayIn("America/Chicago", instant)).toBe("2026-03-09");
    expect(todayIn("America/New_York", new Date("2026-03-10T05:30:00Z"))).toBe("2026-03-10");
  });

  it("counts days across DST and year boundaries", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // DST starts 03/08
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-01-10", "2026-01-01")).toBe(-9);
  });

  it("adds months, clamping to the end of shorter months", () => {
    expect(addMonths("2026-01-15", 3)).toBe("2026-04-15");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2027-08-31", 6)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 9)).toBe("2027-08-30");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("adds years, clamping Feb 29", () => {
    expect(addYears("2025-06-15", 1)).toBe("2026-06-15");
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
    expect(addYears("2024-02-29", 4)).toBe("2028-02-29");
  });

  it("validates calendar dates", () => {
    expect(isCalendarDate("2026-11-09")).toBe(true);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("11/09/2026")).toBe(false);
  });
});
