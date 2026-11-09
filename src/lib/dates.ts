/**
 * Dates. Instants (timestamptz) are shown in the organization's time zone.
 * Calendar dates (Postgres `date`, "YYYY-MM-DD") have no time zone and are
 * handled as plain strings so they never shift by a day.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Format an instant as MM/DD/YYYY in the given IANA time zone (US format, CLAUDE.md). */
export function formatDate(value: string | Date, timeZone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function parseIsoDate(value: string): [number, number, number] {
  const m = ISO_DATE.exec(value);
  if (!m) throw new RangeError(`Invalid calendar date: ${value}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new RangeError(`Invalid calendar date: ${value}`);
  }
  return [y, mo, d];
}

/** "2026-03-09" → "03/09/2026". */
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = parseIsoDate(value);
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

/** Today's calendar date in a time zone, as "YYYY-MM-DD". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parseIsoDate(from);
  const [y2, m2, d2] = parseIsoDate(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Add whole months, clamping to the end of a shorter month (08/31 + 6 months → 02/28). */
export function addMonths(value: string, months: number): string {
  const [y, m, d] = parseIsoDate(value);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/** Add whole years; Feb 29 becomes Feb 28 in non-leap years. */
export function addYears(value: string, years: number): string {
  return addMonths(value, years * 12);
}

/** Validate a "YYYY-MM-DD" string (form input type="date"). */
export function isCalendarDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}
