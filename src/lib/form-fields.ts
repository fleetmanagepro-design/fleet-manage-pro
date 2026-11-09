import { z } from "zod";
import { isCalendarDate } from "@/lib/dates";
import { MilesError, parseMiles } from "@/lib/miles";
import { MoneyError, parseDollarsToCents } from "@/lib/money";
import { US_STATE_CODES } from "@/lib/us";

/**
 * Zod building blocks for HTML form input. Browsers send "" for empty fields;
 * every optional helper turns "" (or a missing field) into undefined.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, { error: `Keep it under ${max} characters` }).optional());

export const optionalUpperText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().toUpperCase().max(max, { error: `Keep it under ${max} characters` }).optional());

export const optionalCalendarDate = z.preprocess(
  blankToUndefined,
  z.string().refine(isCalendarDate, { error: "Enter a valid date" }).optional(),
);

export const optionalUsState = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => (US_STATE_CODES as readonly string[]).includes(v), { error: "Choose a US state" })
    .optional(),
);

export const optionalInt = (min: number, max: number, label: string) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: `${label} must be a number` })
      .int({ error: `${label} must be a whole number` })
      .min(min, { error: `${label} must be ${min}–${max}` })
      .max(max, { error: `${label} must be ${min}–${max}` })
      .optional(),
  );

/** "$12,500.00" → 1250000 cents; must not be negative. */
export const optionalDollarsAsCents = z.preprocess(
  blankToUndefined,
  z
    .string()
    .transform((v, ctx) => {
      try {
        const cents = parseDollarsToCents(v);
        if (cents < 0) {
          ctx.addIssue({ code: "custom", message: "Amount cannot be negative" });
          return z.NEVER;
        }
        return cents;
      } catch (e) {
        ctx.addIssue({ code: "custom", message: e instanceof MoneyError ? "Enter a dollar amount like 12,500.00" : "Invalid amount" });
        return z.NEVER;
      }
    })
    .optional(),
);

/** Miles / hours with up to one decimal. */
export const meterValue = z.string().transform((v, ctx) => {
  try {
    return parseMiles(v);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: e instanceof MilesError ? "Enter a number with at most one decimal" : "Invalid number" });
    return z.NEVER;
  }
});

export const optionalMeterValue = z.preprocess(blankToUndefined, meterValue.optional());

/** HTML checkbox: present ("on") or absent. */
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
