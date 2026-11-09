/**
 * Money helpers. All money is integer cents (CLAUDE.md rule 6).
 *
 * Postgres stores cents as `bigint`; supabase-js returns them as JS numbers.
 * Values are safe up to Number.MAX_SAFE_INTEGER cents (~$90 trillion), and
 * every helper rejects anything that is not a safe integer instead of
 * silently producing a float.
 */

/** Integer number of US cents. */
export type Cents = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function isCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertCents(value: unknown, label = "amount"): asserts value is Cents {
  if (!isCents(value)) {
    throw new MoneyError(`${label} must be a whole number of cents, got ${String(value)}`);
  }
}

/** Sum of cents; throws if the result leaves the safe-integer range. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  assertCents(total, "total");
  return total;
}

const DOLLAR_INPUT = /^(-)?\$?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{0,2}))?$/;

/**
 * Parse user-entered dollars into cents without floating point.
 * Accepts "1234", "1,234.5", "$1,234.56", "-12.00", ".99".
 * Rejects more than two decimals, malformed thousands separators and empty input.
 */
export function parseDollarsToCents(input: string): Cents {
  const s = input.trim().replace(/^-\s*\$/, "-$").replace(/^\$\s*-/, "-$");
  const m = DOLLAR_INPUT.exec(s);
  if (!m || (m[2] === undefined && (m[3] === undefined || m[3] === ""))) {
    throw new MoneyError(`"${input}" is not a valid dollar amount`);
  }
  const [, sign, wholeRaw = "0", frac = ""] = m;
  const whole = wholeRaw.replaceAll(",", "");
  const digits = `${whole}${frac.padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
  if (digits.length > 16) {
    throw new MoneyError(`"${input}" is too large`);
  }
  const cents = Number(digits);
  assertCents(cents);
  return sign && cents !== 0 ? -cents : cents;
}

const usdWholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Format cents as US dollars, e.g. 123456 → "$1,234.56", -500 → "-$5.00". */
export function formatCents(cents: Cents): string {
  assertCents(cents);
  // Integer math keeps the conversion exact; Intl only adds "$" and separators.
  const abs = Math.abs(cents);
  const dollars = usdWholeDollars.format(Math.trunc(abs / 100));
  const rest = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${dollars}.${rest}`;
}
