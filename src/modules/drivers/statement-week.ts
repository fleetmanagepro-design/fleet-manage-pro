import { addDays, isCalendarDate, mondayOf } from "@/lib/dates";

/** The pay week to show: ?week=YYYY-MM-DD (any day, snapped to its Monday), else last week (the one to finalize). */
export function pickPayWeek(param: string | string[] | undefined, today: string): string {
  if (typeof param === "string" && isCalendarDate(param)) {
    const monday = mondayOf(param);
    if (monday >= "2000-01-03" && monday <= addDays(today, 366)) return monday;
  }
  return addDays(mondayOf(today), -7);
}
