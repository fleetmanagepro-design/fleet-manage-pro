import { describe, expect, it } from "vitest";
import { addDays, boardDays, boardStart, filterBoard, packLanes, spanOnBoard } from "@/modules/dispatch/board";

const TZ = "America/Chicago";
const at = (iso: string) => Date.parse(iso);

describe("board days", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(boardDays("2026-11-10")).toEqual([
      "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16",
    ]);
  });

  it("accepts a valid start parameter and falls back to today", () => {
    expect(boardStart("2026-11-03", "2026-11-10")).toBe("2026-11-03");
    expect(boardStart("not-a-date", "2026-11-10")).toBe("2026-11-10");
    expect(boardStart("2020-01-01", "2026-11-10")).toBe("2026-11-10"); // more than 5 years away
    expect(boardStart("2023-03-15", "2026-11-10")).toBe("2023-03-15"); // any day within 5 years
    expect(boardStart(undefined, "2026-11-10")).toBe("2026-11-10");
  });
});

describe("spanOnBoard", () => {
  const days = boardDays("2026-11-10");

  it("maps a window to the days it covers in the company's time zone", () => {
    // 11/10 14:00 UTC (08:00 CST) → 11/12 03:00 UTC (11/11 21:00 CST)
    expect(spanOnBoard({ start: at("2026-11-10T14:00:00Z"), end: at("2026-11-12T03:00:00Z") }, days, TZ)).toEqual({
      firstCol: 0, lastCol: 1, startsBefore: false, endsAfter: false,
    });
  });

  it("clips windows that start before or end after the board", () => {
    expect(spanOnBoard({ start: at("2026-11-08T14:00:00Z"), end: at("2026-11-20T14:00:00Z") }, days, TZ)).toEqual({
      firstCol: 0, lastCol: 6, startsBefore: true, endsAfter: true,
    });
  });

  it("is null for windows off the board, and an end at midnight stays on the previous day", () => {
    expect(spanOnBoard({ start: at("2026-11-01T14:00:00Z"), end: at("2026-11-02T14:00:00Z") }, days, TZ)).toBeNull();
    // ends 11/11 00:00 CST = 06:00 UTC
    expect(spanOnBoard({ start: at("2026-11-10T14:00:00Z"), end: at("2026-11-11T06:00:00Z") }, days, TZ)?.lastCol).toBe(0);
  });
});

describe("packLanes", () => {
  const s = (firstCol: number, lastCol: number) => ({ firstCol, lastCol, startsBefore: false, endsAfter: false });

  it("puts non-overlapping blocks in one lane and overlapping ones in the next", () => {
    expect(packLanes([s(0, 1), s(2, 3), s(1, 2), s(4, 4)])).toEqual({ lanes: [0, 0, 1, 0], laneCount: 2 });
  });

  it("always has at least one lane", () => {
    expect(packLanes([])).toEqual({ lanes: [], laneCount: 1 });
  });
});

describe("filterBoard", () => {
  const load = (id: string, truck: string | null, o: Partial<{ city: string; customer: string; ref: string }> = {}) => ({
    id, truck_id: truck, load_number: id, customer_reference: null, customer: { name: o.customer ?? "Northline" },
    truck: truck ? { unit_number: truck } : null,
    stops: [{ city: o.city ?? "Joliet", facility_name: null, reference_number: o.ref ?? null }], drivers: [],
  });
  const data = {
    trucks: [
      { id: "101", unit_number: "101", drivers: ["James Carter"] },
      { id: "102", unit_number: "102", drivers: ["Maria Gonzalez"] },
    ],
    loads: [load("1001", "101"), load("1002", "102", { city: "Dallas" }), load("1003", "102")],
    unassigned: [load("1004", null, { ref: "PU-77" }), load("1005", null)],
  };

  it("keeps everything without a term", () => {
    expect(filterBoard(data, null)).toBe(data);
  });
  it("a matching driver keeps the truck with all its loads", () => {
    const r = filterBoard(data, "carter");
    expect(r.trucks.map((t) => t.id)).toEqual(["101"]);
    expect(r.loads.map((l) => l.id)).toEqual(["1001"]);
    expect(r.unassigned).toEqual([]);
  });
  it("a matching load keeps its truck with only the matching loads; unassigned by pickup #", () => {
    const r = filterBoard(data, "dallas");
    expect(r.trucks.map((t) => t.id)).toEqual(["102"]);
    expect(r.loads.map((l) => l.id)).toEqual(["1002"]);
    expect(filterBoard(data, "pu-77").unassigned.map((l) => l.id)).toEqual(["1004"]);
  });
});
