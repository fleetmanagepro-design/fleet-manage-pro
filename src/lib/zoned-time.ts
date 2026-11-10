/**
 * Wall-clock times in a given IANA time zone, without a date library.
 * Used for stop appointments: entered and shown in the facility's local time,
 * stored as UTC instants.
 */

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (Chicago in winter → -360). */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

export function isLocalDateTime(value: string): boolean {
  return LOCAL_INPUT.test(value);
}

/**
 * "2026-11-12T08:00" in "America/Chicago" → the UTC instant as ISO string.
 * In a DST gap (a time that doesn't exist) the result moves forward by the gap;
 * in the repeated hour the earlier (DST) instant is used.
 */
export function zonedLocalToUtc(local: string, timeZone: string): string {
  const m = LOCAL_INPUT.exec(local);
  if (!m) throw new RangeError(`Invalid local date-time: ${local}`);
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  // Two passes settle the offset across DST transitions.
  let guess = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  guess = wall - offsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess).toISOString();
}

/** UTC instant → "2026-11-12T08:00" in `timeZone` (for datetime-local inputs). */
export function utcToZonedLocal(iso: string, timeZone: string): string {
  const p = partsInZone(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/** UTC instant → "11/12/2026 08:00 CST" in `timeZone`. */
export function formatInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const main = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(",", "");
  const zone =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${main} ${zone}`.trim();
}
