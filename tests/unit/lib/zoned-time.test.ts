import { describe, expect, it } from "vitest";
import { formatInZone, isLocalDateTime, utcToZonedLocal, zonedLocalToUtc } from "@/lib/zoned-time";

describe("zonedLocalToUtc", () => {
  it("converts facility-local wall time to UTC", () => {
    expect(zonedLocalToUtc("2026-11-12T08:00", "America/Chicago")).toBe("2026-11-12T14:00:00.000Z"); // CST
    expect(zonedLocalToUtc("2026-07-12T08:00", "America/Chicago")).toBe("2026-07-12T13:00:00.000Z"); // CDT
    expect(zonedLocalToUtc("2026-07-12T08:00", "America/Phoenix")).toBe("2026-07-12T15:00:00.000Z"); // no DST
    expect(zonedLocalToUtc("2026-01-05T23:30", "America/Los_Angeles")).toBe("2026-01-06T07:30:00.000Z"); // next UTC day
  });

  it("handles DST transitions", () => {
    // 03/08/2026: 02:00 → 03:00 in Chicago. 01:30 CST, 03:30 CDT.
    expect(zonedLocalToUtc("2026-03-08T01:30", "America/Chicago")).toBe("2026-03-08T07:30:00.000Z");
    expect(zonedLocalToUtc("2026-03-08T03:30", "America/Chicago")).toBe("2026-03-08T08:30:00.000Z");
    // 11/01/2026: 01:00–02:00 happens twice; the earlier (CDT) instant is used.
    expect(zonedLocalToUtc("2026-11-01T01:30", "America/Chicago")).toBe("2026-11-01T06:30:00.000Z");
  });

  it("round-trips with utcToZonedLocal", () => {
    for (const [local, tz] of [
      ["2026-11-12T08:00", "America/New_York"],
      ["2026-06-30T17:45", "America/Denver"],
      ["2026-12-31T23:59", "Pacific/Honolulu"],
    ] as const) {
      expect(utcToZonedLocal(zonedLocalToUtc(local, tz), tz)).toBe(local);
    }
  });

  it("rejects malformed input", () => {
    expect(() => zonedLocalToUtc("11/12/2026 08:00", "America/Chicago")).toThrow(RangeError);
    expect(isLocalDateTime("2026-11-12T08:00")).toBe(true);
    expect(isLocalDateTime("2026-11-12")).toBe(false);
  });
});

describe("formatInZone", () => {
  it("shows MM/DD/YYYY HH:mm with the zone abbreviation", () => {
    expect(formatInZone("2026-11-12T14:00:00Z", "America/Chicago")).toBe("11/12/2026 08:00 CST");
    expect(formatInZone("2026-11-12T14:00:00Z", "America/New_York")).toBe("11/12/2026 09:00 EST");
  });
});
