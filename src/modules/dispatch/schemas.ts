import { z } from "zod";
import { MilesError, parseMiles } from "@/lib/miles";
import { MoneyError, parseDollarsToCents } from "@/lib/money";
import { US_STATE_CODES } from "@/lib/us";
import { isLocalDateTime, zonedLocalToUtc } from "@/lib/zoned-time";
import { TRAILER_TYPES } from "@/modules/fleet/labels";
import { ACCESSORIAL_TYPES, LOAD_STATUSES } from "./labels";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const optUuid = z.preprocess(blank, z.uuid().optional());

const dollars = (label: string, required: boolean) =>
  z.preprocess(
    blank,
    (required ? z.string({ error: `Enter the ${label}` }) : z.string().optional()).transform((v, ctx) => {
      if (v === undefined) return 0;
      try {
        const c = parseDollarsToCents(v);
        if (c < 0) throw new MoneyError("negative");
        return c;
      } catch {
        ctx.addIssue({ code: "custom", message: `Enter the ${label} as a dollar amount` });
        return z.NEVER;
      }
    }),
  );

const miles = (label: string) =>
  z.preprocess(
    blank,
    z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (v === undefined) return undefined;
        try {
          return parseMiles(v);
        } catch (e) {
          ctx.addIssue({ code: "custom", message: e instanceof MilesError ? `Enter ${label} with at most one decimal` : "Invalid number" });
          return z.NEVER;
        }
      }),
  );

const localTime = z.preprocess(
  blank,
  z.string().refine(isLocalDateTime, { error: "Enter a date and time" }).optional(),
);

const stopSchema = z
  .object({
    stopType: z.enum(["pickup", "delivery"], { error: "Choose pickup or delivery" }),
    facilityName: optText(200),
    addressLine1: optText(200),
    city: z.string({ error: "Enter the city" }).trim().min(1, { error: "Enter the city" }).max(100),
    state: z
      .string({ error: "Choose a state" })
      .trim()
      .toUpperCase()
      .refine((v) => (US_STATE_CODES as readonly string[]).includes(v), { error: "Choose a state" }),
    zip: z.preprocess(blank, z.string().trim().regex(/^\d{5}(-\d{4})?$/, { error: "ZIP must be 12345 or 12345-6789" }).optional()),
    timezone: z.string().min(1, { error: "Choose a time zone" }),
    appointmentStart: localTime,
    appointmentEnd: localTime,
  })
  .transform((s, ctx) => {
    const toUtc = (v: string | undefined) => {
      if (!v) return null;
      try {
        return zonedLocalToUtc(v, s.timezone);
      } catch {
        ctx.addIssue({ code: "custom", message: "Choose a valid time zone", path: ["timezone"] });
        return null;
      }
    };
    const start = toUtc(s.appointmentStart);
    const end = toUtc(s.appointmentEnd);
    if (start && end && end < start) {
      ctx.addIssue({ code: "custom", message: "The window must end after it starts", path: ["appointmentEnd"] });
    }
    return { ...s, appointmentStartUtc: start, appointmentEndUtc: end };
  });

export const loadFormSchema = z
  .object({
    id: optUuid,
    loadNumber: optText(30),
    customerId: z.uuid({ error: "Choose a customer" }),
    customerReference: optText(100),
    linehaul: dollars("linehaul", true),
    loadedMiles: miles("loaded miles"),
    deadheadMiles: miles("deadhead miles"),
    commodity: optText(200),
    weightLbs: z.preprocess(
      blank,
      z.coerce.number({ error: "Weight must be a number" }).int({ error: "Weight must be whole pounds" }).min(0).max(200000, { error: "Weight must be at most 200,000 lbs" }).optional(),
    ),
    equipmentType: z.preprocess(blank, z.enum(TRAILER_TYPES).optional()),
    truckId: optUuid,
    trailerId: optUuid,
    driver1Id: optUuid,
    driver2Id: optUuid,
    notes: optText(5000),
    overrideReason: optText(1000),
    stops: z.array(stopSchema, { error: "Add the stops" }).min(2, { error: "Add at least a pickup and a delivery" }).max(50),
  })
  .superRefine((l, ctx) => {
    if (!l.stops.some((s) => s.stopType === "pickup") || !l.stops.some((s) => s.stopType === "delivery")) {
      ctx.addIssue({ code: "custom", message: "Add at least one pickup and one delivery", path: ["stops"] });
    }
    if (l.stops[0]?.stopType !== "pickup") {
      ctx.addIssue({ code: "custom", message: "The first stop must be a pickup", path: ["stops"] });
    }
    if (l.driver2Id && !l.driver1Id) {
      ctx.addIssue({ code: "custom", message: "Choose the first driver first", path: ["driver1Id"] });
    }
    if (l.driver1Id && l.driver1Id === l.driver2Id) {
      ctx.addIssue({ code: "custom", message: "Choose two different drivers", path: ["driver2Id"] });
    }
  });

export type LoadForm = z.infer<typeof loadFormSchema>;

export const changeStatusSchema = z
  .object({
    id: z.uuid(),
    to: z.enum(LOAD_STATUSES, { error: "Choose a status" }),
    reason: optText(1000),
    deliveredAt: localTime,
    loadedMiles: miles("loaded miles"),
    deadheadMiles: miles("deadhead miles"),
  })
  .superRefine((s, ctx) => {
    if (s.to === "delivered") {
      if (!s.deliveredAt) ctx.addIssue({ code: "custom", message: "Enter when it was delivered", path: ["deliveredAt"] });
      if (!s.loadedMiles || s.loadedMiles <= 0) {
        ctx.addIssue({ code: "custom", message: "Enter the loaded miles", path: ["loadedMiles"] });
      }
    }
  });

export const accessorialSchema = z.object({
  loadId: z.uuid(),
  type: z.enum(ACCESSORIAL_TYPES, { error: "Choose a type" }),
  amount: z.string().transform((v, ctx) => {
    try {
      const c = parseDollarsToCents(v);
      if (c <= 0) throw new MoneyError("not positive");
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter an amount greater than $0" });
      return z.NEVER;
    }
  }),
  billableToCustomer: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  notes: optText(500),
});

export const removeAccessorialSchema = z.object({ id: z.uuid(), loadId: z.uuid() });

export const assignLoadSchema = z
  .object({
    loadId: z.uuid(),
    truckId: z.uuid({ error: "Choose a truck" }),
    trailerId: optUuid,
    driver1Id: z.uuid({ error: "Choose a driver" }),
    driver2Id: optUuid,
    overrideReason: optText(1000),
  })
  .refine((a) => a.driver1Id !== a.driver2Id, { error: "Choose two different drivers", path: ["driver2Id"] });

export const driverItemSchema = z.object({
  loadId: z.uuid(),
  driverId: z.uuid({ error: "Choose the driver" }),
  description: z.string().trim().min(1, { error: "Say what it's for" }).max(200),
  amount: z.string().transform((v, ctx) => {
    try {
      const c = parseDollarsToCents(v);
      if (c <= 0) throw new MoneyError("not positive");
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter an amount greater than $0" });
      return z.NEVER;
    }
  }),
});

export const removeDriverItemSchema = z.object({ id: z.uuid(), loadId: z.uuid() });
