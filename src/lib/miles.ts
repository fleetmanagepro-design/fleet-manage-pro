/**
 * Miles, hubodometer and reefer hours: numeric(10,1) in the database (CLAUDE.md rule 7).
 * Parsing is string-based so "123456.7" never picks up float noise.
 */
export class MilesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MilesError";
  }
}

const MILES_INPUT = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d))?$/;
/** Largest value numeric(10,1) can hold. */
export const MAX_METER = 999_999_999.9;

/** Parse "123,456.7" → 123456.7. Rejects negatives, more than one decimal and empty input. */
export function parseMiles(input: string): number {
  const m = MILES_INPUT.exec(input.trim());
  if (!m) throw new MilesError(`"${input}" is not a valid number (up to one decimal)`);
  const value = Number(`${m[1].replaceAll(",", "")}.${m[2] ?? "0"}`);
  if (value > MAX_METER) throw new MilesError(`"${input}" is too large`);
  return value;
}

const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** 123456.7 → "123,456.7"; 1000 → "1,000". */
export function formatMiles(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return fmt.format(value);
}
