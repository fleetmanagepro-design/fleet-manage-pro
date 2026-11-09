import { describe, expect, it } from "vitest";
import { MilesError, formatMiles, parseMiles } from "@/lib/miles";

describe("parseMiles", () => {
  it.each([
    ["0", 0],
    ["123456", 123456],
    ["123,456.7", 123456.7],
    [" 1,000 ", 1000],
    ["0.1", 0.1],
    ["999999999.9", 999999999.9],
  ])("%s → %s", (input, expected) => {
    expect(parseMiles(input)).toBe(expected);
  });

  it.each(["", "-5", "1.25", "1,23", "abc", "1e5", "1000000000"])("rejects %j", (input) => {
    expect(() => parseMiles(input)).toThrow(MilesError);
  });
});

describe("formatMiles", () => {
  it("formats with separators and at most one decimal", () => {
    expect(formatMiles(123456.7)).toBe("123,456.7");
    expect(formatMiles(1000)).toBe("1,000");
    expect(formatMiles(0)).toBe("0");
    expect(formatMiles(null)).toBe("—");
  });
});
