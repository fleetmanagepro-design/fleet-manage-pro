import { z } from "zod";
import {
  checkbox,
  meterValue,
  optionalCalendarDate,
  optionalDollarsAsCents,
  optionalInt,
  optionalMeterValue,
  optionalText,
  optionalUpperText,
  optionalUsState,
} from "@/lib/form-fields";
import { isValidVinFormat, normalizeVin } from "@/lib/vin";
import { ASSET_STATUSES, INSPECTION_VALIDITY_MONTHS, OWNERSHIP_TYPES, TRAILER_TYPES } from "./labels";

const unitNumber = z.string().trim().min(1, { error: "Enter a unit number" }).max(20, { error: "Keep it under 20 characters" });

const vinFormat = z
  .string()
  .transform(normalizeVin)
  .refine(isValidVinFormat, { error: "A VIN has 17 letters and digits (no I, O or Q)" });

const optionalVin = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  vinFormat.optional(),
);

/** Model years: 1950 up to next year's models. */
const modelYear = () => optionalInt(1950, new Date().getFullYear() + 1, "Year");

/** Status on create/edit; selling goes through its own action (owner/admin only). */
const editableStatus = z.enum(ASSET_STATUSES.filter((s) => s !== "sold") as ["active", "in_shop", "out_of_service"], {
  error: "Choose a status",
});

const assetCommon = {
  unitNumber,
  year: modelYear(),
  make: optionalText(50),
  plate: optionalUpperText(15),
  plateState: optionalUsState,
  ownership: z.enum(OWNERSHIP_TYPES, { error: "Choose ownership" }),
  purchaseDate: optionalCalendarDate,
  purchasePriceCents: optionalDollarsAsCents,
  registrationExpiresOn: optionalCalendarDate,
  annualInspectionOn: optionalCalendarDate,
  inspectionValidMonths: z.coerce
    .number()
    .refine((n) => (INSPECTION_VALIDITY_MONTHS as readonly number[]).includes(n), {
      error: "Choose 3, 6, 9 or 12 months",
    }),
  notes: optionalText(5000),
};

export const truckSchema = z.object({
  ...assetCommon,
  vin: vinFormat,
  model: optionalText(50),
  insuranceExpiresOn: optionalCalendarDate,
  status: editableStatus,
});

/** Starting odometer can only be given when the truck is created. */
export const createTruckSchema = truckSchema.extend({ currentOdometer: optionalMeterValue });

export const trailerSchema = z.object({
  ...assetCommon,
  vin: optionalVin,
  trailerType: z.enum(TRAILER_TYPES, { error: "Choose a trailer type" }),
  lengthFt: optionalInt(10, 65, "Length"),
  status: editableStatus,
});

export const createTrailerSchema = trailerSchema
  .extend({ hubodometer: optionalMeterValue, reeferHours: optionalMeterValue })
  .refine((t) => t.reeferHours === undefined || t.trailerType === "reefer", {
    error: "Reefer hours apply to reefer trailers only",
    path: ["reeferHours"],
  });

export const assetIdSchema = z.object({ id: z.uuid() });

export const changeStatusSchema = z.object({ id: z.uuid(), status: z.enum(ASSET_STATUSES, { error: "Choose a status" }) });

export const archiveSchema = z.object({ id: z.uuid(), archive: checkbox });

export const recordReadingSchema = z
  .object({
    id: z.uuid(),
    readingType: z.enum(["odometer", "hubodometer", "reefer_hours"]),
    reading: meterValue,
    readOn: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), { error: "Enter a valid date" }),
    isCorrection: checkbox,
    note: optionalText(500),
  })
  .refine((r) => !r.isCorrection || (r.note?.length ?? 0) > 0, {
    error: "Explain why the reading is being corrected",
    path: ["note"],
  });
