import { z } from "zod";
import { isCalendarDate } from "@/lib/dates";
import {
  optionalCalendarDate,
  optionalDollarsAsCents,
  optionalText,
  optionalUpperText,
  optionalUsState,
} from "@/lib/form-fields";
import { MoneyError, parseDollarsToCents } from "@/lib/money";
import {
  CDL_CLASSES,
  DRIVER_STATUSES,
  DRIVER_TYPES,
  MILES_BASES,
  PAY_TYPES,
  PERCENT_BASES,
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
  stopPayCents: optionalDollarsAsCents.transform((v) => v ?? 0),
  detentionPayCentsPerHour: optionalDollarsAsCents.transform((v) => v ?? 0),
  notes: optionalText(1000),
});

/** One shape per pay type, mirroring the database check constraint. */
export const payRuleSchema = z.discriminatedUnion("payType", [
  payRuleBase.extend({
    payType: z.literal("per_mile"),
    ratePerMile: requiredCents("the rate per mile"),
    milesBasis: z.enum(MILES_BASES, { error: "Choose which miles are paid" }),
  }),
  payRuleBase.extend({
    payType: z.literal("percent"),
    percent: percentValue,
    percentBasis: z.enum(PERCENT_BASES, { error: "Choose what the percentage is of" }),
  }),
  payRuleBase.extend({
    payType: z.literal("flat"),
    flatAmount: requiredCents("the amount per load"),
  }),
], { error: "Choose how the driver is paid" });

export const PAY_TYPE_VALUES = PAY_TYPES;

export const driverIdSchema = z.object({ id: z.uuid() });
export const deletePayRuleSchema = z.object({ id: z.uuid(), driverId: z.uuid() });
