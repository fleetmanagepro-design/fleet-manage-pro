/**
 * Vehicle Identification Numbers (49 CFR 565). 17 characters, no I, O or Q.
 * Format is enforced (also in the database); the check digit is advisory only,
 * because older and imported trailers often carry VINs that fail it.
 */
const VIN_FORMAT = /^[A-HJ-NPR-Z0-9]{17}$/;
const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** Uppercase and drop spaces/dashes people paste in. */
export function normalizeVin(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidVinFormat(vin: string): boolean {
  return VIN_FORMAT.test(vin);
}

/** True when position 9 matches the computed check digit. Assumes a valid format. */
export function hasValidCheckDigit(vin: string): boolean {
  if (!isValidVinFormat(vin)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const value = /\d/.test(ch) ? Number(ch) : TRANSLITERATION[ch];
    sum += value * WEIGHTS[i];
  }
  const remainder = sum % 11;
  return vin[8] === (remainder === 10 ? "X" : String(remainder));
}
