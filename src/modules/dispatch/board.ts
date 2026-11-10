import { addMonths, daysBetween, isCalendarDate, todayIn } from "@/lib/dates";
import type { Window } from "./overlap";

/** Dispatch board layout (PRODUCT_SPEC §4.4): trucks × days, loads as blocks. Pure functions. */

export const BOARD_DAYS = 7;

/** "YYYY-MM-DD" + n days. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** The board's first day: ?start=YYYY-MM-DD if valid and within ±2 years, else today. */
export function boardStart(param: string | undefined, today: string): string {
  if (!param || !isCalendarDate(param)) return today;
  const span = Math.abs(daysBetween(today, param));
  return span <= daysBetween(addMonths(today, -24), today) ? param : today;
}

export function boardDays(start: string, count = BOARD_DAYS): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Calendar day of an instant in the organization's time zone. */
export const dayOf = (ms: number, timeZone: string) => todayIn(timeZone, new Date(ms));

export type Span = { firstCol: number; lastCol: number; startsBefore: boolean; endsAfter: boolean };

/** Columns (0-based, inclusive) a load window covers on the board, or null if it's off the board. */
export function spanOnBoard(window: Window, days: readonly string[], timeZone: string): Span | null {
  const first = dayOf(window.start, timeZone);
  // An end exactly at midnight belongs to the previous day.
  const last = dayOf(Math.max(window.start, window.end - 1), timeZone);
  if (last < days[0] || first > days[days.length - 1]) return null;
  const firstCol = first < days[0] ? 0 : days.indexOf(first);
  const lastCol = last > days[days.length - 1] ? days.length - 1 : days.indexOf(last);
  return { firstCol, lastCol, startsBefore: first < days[0], endsAfter: last > days[days.length - 1] };
}

/**
 * Stack blocks that share days into lanes (greedy, by first column): each item gets the
 * lowest lane whose previous block ended before it starts. Returns lane per item and lane count.
 */
export function packLanes(spans: readonly Span[]): { lanes: number[]; laneCount: number } {
  const order = spans.map((s, i) => i).sort((a, b) => spans[a].firstCol - spans[b].firstCol || spans[a].lastCol - spans[b].lastCol);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(spans.length);
  for (const i of order) {
    let lane = laneEnds.findIndex((end) => end < spans[i].firstCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(spans[i].lastCol);
    } else {
      laneEnds[lane] = spans[i].lastCol;
    }
    lanes[i] = lane;
  }
  return { lanes, laneCount: Math.max(1, laneEnds.length) };
}
