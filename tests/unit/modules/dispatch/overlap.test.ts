import { describe, expect, it } from "vitest";
import { findConflicts, loadWindow, windowsOverlap } from "@/modules/dispatch/overlap";

const stop = (start: string | null, end: string | null = null) => ({ appointment_start: start, appointment_end: end });

describe("loadWindow", () => {
  it("spans the earliest start to the latest end across stops", () => {
    const w = loadWindow([stop("2026-12-01T14:00:00Z", "2026-12-01T16:00:00Z"), stop("2026-12-02T15:00:00Z")]);
    expect(w).toEqual({ start: Date.parse("2026-12-01T14:00:00Z"), end: Date.parse("2026-12-02T15:00:00Z") });
  });
  it("is null without appointment times", () => {
    expect(loadWindow([stop(null), stop(null)])).toBeNull();
  });
});

describe("windowsOverlap", () => {
  it("treats touching windows as not overlapping", () => {
    expect(windowsOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    expect(windowsOverlap({ start: 0, end: 11 }, { start: 10, end: 20 })).toBe(true);
  });
});

describe("findConflicts", () => {
  const target = { id: "new", truck_id: "T1", driver_ids: ["D1"], stops: [stop("2026-12-01T12:00:00Z"), stop("2026-12-01T20:00:00Z")] };
  const other = (id: string, truck: string | null, drivers: string[], start: string, end: string) => ({
    id, load_number: id, truck_id: truck, driver_ids: drivers, stops: [stop(start), stop(end)],
  });

  it("finds truck and driver conflicts in overlapping windows only", () => {
    const conflicts = findConflicts(target, [
      other("A", "T1", [], "2026-12-01T10:00:00Z", "2026-12-01T13:00:00Z"),
      other("B", "T9", ["D1"], "2026-12-01T19:00:00Z", "2026-12-02T03:00:00Z"),
      other("C", "T1", ["D1"], "2026-12-02T08:00:00Z", "2026-12-02T12:00:00Z"),
      other("new", "T1", ["D1"], "2026-12-01T12:00:00Z", "2026-12-01T20:00:00Z"),
    ]);
    expect(conflicts).toEqual([
      { loadId: "A", loadNumber: "A", reason: "truck" },
      { loadId: "B", loadNumber: "B", reason: "driver" },
    ]);
  });

  it("finds nothing when the load has no times", () => {
    expect(findConflicts({ ...target, stops: [stop(null)] }, [other("A", "T1", [], "2026-12-01T10:00:00Z", "2026-12-01T13:00:00Z")])).toEqual([]);
  });
});
