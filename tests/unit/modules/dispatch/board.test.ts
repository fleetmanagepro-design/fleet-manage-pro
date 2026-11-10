import { describe, expect, it } from "vitest";
import { addDays, boardDays, boardStart, packLanes, spanOnBoard } from "@/modules/dispatch/board";

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
    expect(boardStart("2020-01-01", "2026-11-10")).toBe("2026-11-10");
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
