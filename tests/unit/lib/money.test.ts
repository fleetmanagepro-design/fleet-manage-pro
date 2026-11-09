import { describe, expect, it } from "vitest";
import {
  MoneyError,
  assertCents,
  formatCents,
  isCents,
  parseDollarsToCents,
  sumCents,
} from "@/lib/money";

describe("isCents / assertCents", () => {
  it("accepts safe integers", () => {
    expect(isCents(0)).toBe(true);
    expect(isCents(-150)).toBe(true);
    expect(isCents(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("rejects floats, NaN, Infinity, strings and unsafe integers", () => {
    for (const v of [1.5, Number.NaN, Infinity, "100", null, undefined, 2 ** 53]) {
      expect(isCents(v)).toBe(false);
    }
    expect(() => assertCents(0.1, "fuel")).toThrow(/fuel must be a whole number of cents/);
  });
});

describe("sumCents", () => {
  it("sums exactly where floats would drift", () => {
    expect(sumCents([10, 20])).toBe(30); // $0.10 + $0.20, the classic 0.30000000000000004
    expect(sumCents(Array(1000).fill(1))).toBe(1000);
  });

  it("handles empty input and negative values", () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents([5000, -7500])).toBe(-2500);
  });

  it("throws on non-integer input or overflow", () => {
    expect(() => sumCents([1, 0.5])).toThrow(MoneyError);
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(MoneyError);
  });
});

describe("parseDollarsToCents", () => {
  it.each([
    ["0", 0],
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["0.01", 1],
    [".99", 99],
    ["12.", 1200],
    ["1,234.56", 123456],
    ["$1,234,567.89", 123456789],
    ["  $45.10 ", 4510],
    ["-12.34", -1234],
    ["-$12.34", -1234],
    ["$-12.34", -1234],
    ["-0.00", 0],
    ["0.29", 29], // 0.29 * 100 = 28.999999999999996 in float math
    ["1.005", null],
  ])("%s → %s", (input, expected) => {
    if (expected === null) {
      expect(() => parseDollarsToCents(input)).toThrow(MoneyError);
    } else {
      expect(parseDollarsToCents(input)).toBe(expected);
    }
  });

  it.each(["", " ", "$", ".", "abc", "1,23", "12,34.00", "1.2.3", "--5", "5-", "1e5", "Infinity"])(
    "rejects %j",
    (input) => {
      expect(() => parseDollarsToCents(input)).toThrow(MoneyError);
    },
  );

  it("rejects amounts too large to represent exactly", () => {
    expect(() => parseDollarsToCents("999999999999999999")).toThrow(/too large/);
  });
});

describe("formatCents", () => {
  it.each([
    [0, "$0.00"],
    [1, "$0.01"],
    [99, "$0.99"],
    [100, "$1.00"],
    [123456, "$1,234.56"],
    [-500, "-$5.00"],
    [-123456789, "-$1,234,567.89"],
  ])("%d → %s", (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it("round-trips with parseDollarsToCents", () => {
    for (const c of [0, 7, 1050, 99999, -2501, 123456789]) {
      expect(parseDollarsToCents(formatCents(c))).toBe(c);
    }
  });

  it("rejects non-integer cents", () => {
    expect(() => formatCents(10.5)).toThrow(MoneyError);
  });
});
