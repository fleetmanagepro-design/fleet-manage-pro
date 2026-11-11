import { z } from "zod";
import { isCalendarDate, mondayOf } from "@/lib/dates";
import {
  optionalCalendarDate,
  optionalText,
  optionalUpperText,
  optionalUsState,
} from "@/lib/form-fields";
import { parseMiles } from "@/lib/miles";
import { MoneyError, parseDollarsToCents } from "@/lib/money";
import {
  CDL_CLASSES,
  DRIVER_STATUSES,
  DRIVER_TYPES,
  MILES_BASES,
  PAY_TYPES,
} from "./labels";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const optionalEmail = z.preprocess(
  blank,
  z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address" }).max(254)).optional(),
);

export const driverSchema = z
  .object({
    firstName: z.string().trim().min(1, { error: "Enter a first name" }).max(100),
    lastName: z.string().trim().min(1, { error: "Enter a last name" }).max(100),
    phone: optionalText(30),
    email: optionalEmail,
    driverType: z.enum(DRIVER_TYPES, { error: "Choose a driver type" }),
    hireDate: optionalCalendarDate,
    status: z.enum(DRIVER_STATUSES, { error: "Choose a status" }),
    cdlNumber: optionalUpperText(30),
    cdlState: optionalUsState,
    cdlClass: z.preprocess(blank, z.enum(CDL_CLASSES).optional()),
    cdlExpiresOn: optionalCalendarDate,
    medicalCardExpiresOn: optionalCalendarDate,
    defaultTruckId: z.preprocess(blank, z.uuid().optional()),
    emergencyContactName: optionalText(200),
    emergencyContactPhone: optionalText(30),
    notes: optionalText(5000),
  })
  .refine((d) => !d.cdlNumber || d.cdlState, { error: "Choose the state that issued the CDL", path: ["cdlState"] });

/** "$0.58" → 58 cents. Required, positive. */
const requiredCents = (label: string) =>
  z.string().transform((v, ctx) => {
    try {
      const cents = parseDollarsToCents(v);
      if (cents <= 0) throw new MoneyError("not positive");
      return cents;
    } catch {
      ctx.addIssue({ code: "custom", message: `Enter ${label} as a dollar amount greater than 0` });
      return z.NEVER;
    }
  });

const percentValue = z
  .string()
  .trim()
  .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 100, {
    error: "Enter a percentage between 0.01 and 100",
  })
  .transform(Number);

const payRuleBase = z.object({
  driverId: z.uuid(),
  effectiveFrom: z.string().refine(isCalendarDate, { error: "Enter a valid date" }),
  notes: optionalText(1000),
});

/** Two ways drivers are paid (decision of 11/10/2026). Mirrors the database check constraint. */
export const payRuleSchema = z.discriminatedUnion("payType", [
  payRuleBase.extend({
    payType: z.literal("per_mile"),
    ratePerMile: requiredCents("the rate per mile"),
    milesBasis: z.enum(MILES_BASES, { error: "Choose which miles are paid" }),
  }),
  payRuleBase.extend({
    payType: z.literal("percent"),
    companyFeePercent: z
      .string()
      .trim()
      .refine((v) => /^\d{1,2}(\.\d{1,2})?$/.test(v) && Number(v) >= 0 && Number(v) < 100, {
        error: "Enter the company fee as a percentage from 0 to 99.99",
      })
      .transform(Number),
  }),
], { error: "Choose how the driver is paid" });

const deductionBase = z.object({
  driverId: z.uuid(),
  name: z.string().trim().min(1, { error: "Name the deduction" }).max(100),
  startsOn: z.string().refine(isCalendarDate, { error: "Enter a valid date" }),
  notes: optionalText(500),
});

export const deductionSchema = z.discriminatedUnion("kind", [
  deductionBase.extend({ kind: z.literal("percent_of_gross"), percent: percentValue }),
  deductionBase.extend({ kind: z.literal("fixed_weekly"), amount: requiredCents("the weekly amount") }),
  // Truck / trailer rent by agreement: optional fixed weekly part + rate per mile over free miles a week (decision of 11/11/2026)
  deductionBase.extend({
    kind: z.literal("per_mile"),
    amount: z.preprocess(blank, requiredCents("the weekly amount").optional()),
    ratePerMile: requiredCents("the rate per mile"),
    freeMiles: z.preprocess((v) => blank(v) ?? "0", z.string().transform((v, ctx) => {
      try {
        return parseMiles(v);
      } catch {
        ctx.addIssue({ code: "custom", message: "Enter the free miles as a number (0 if every mile counts)" });
        return z.NEVER;
      }
    })),
  }),
], { error: "Choose how the deduction is calculated" });

export const endDeductionSchema = z.object({ id: z.uuid(), driverId: z.uuid() });

/** A pay week, identified by its Monday ("YYYY-MM-DD"). */
export const payWeekSchema = z.string().refine((v) => isCalendarDate(v) && mondayOf(v) === v, "A pay week starts on a Monday.");

export const finalizeStatementSchema = z.object({ driverId: z.uuid(), week: payWeekSchema });

export const voidStatementSchema = z.object({
  statementId: z.uuid(),
  reason: z.string().trim().min(1, "Say why the statement is voided.").max(500, "Keep the reason under 500 characters."),
});

export const PAY_TYPE_VALUES = PAY_TYPES;

export const driverIdSchema = z.object({ id: z.uuid() });
export const deletePayRuleSchema = z.object({ id: z.uuid(), driverId: z.uuid() });
