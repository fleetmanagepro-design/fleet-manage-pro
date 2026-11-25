import { describe, expect, it } from "vitest";
import { pickupDateRange } from "@/modules/dispatch/load-filters";

describe("pickupDateRange", () => {
  it("keeps valid days, drops anything else, swaps a reversed range", () => {
    expect(pickupDateRange("2026-11-01", "2026-11-30")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(pickupDateRange("2026-11-30", "2026-11-01")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(pickupDateRange("", "2026-02-30")).toEqual({ from: undefined, to: undefined });
    expect(pickupDateRange(["2026-11-05", "x"], undefined)).toEqual({ from: "2026-11-05", to: undefined });
  });
});
