"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { type ActionState, errorState, validationError } from "@/lib/action-state";
import { authorizeAction } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { ASSET_EDITORS, STATUS_EDITORS, canCorrectReadings, canSetSold } from "./permissions";
import {
  archiveSchema,
  changeStatusSchema,
  createTrailerSchema,
  createTruckSchema,
  recordReadingSchema,
  trailerSchema,
  truckSchema,
} from "./schemas";

const NO_PERMISSION = "You don't have permission to do that.";
const UNEXPECTED = "Something went wrong. Please try again.";

const kindSchema = z.enum(["truck", "trailer"]);
type Kind = z.infer<typeof kindSchema>;
const TABLE = { truck: "trucks", trailer: "trailers" } as const;
const PATH = { truck: "/trucks", trailer: "/trailers" } as const;

function logError(action: string, error: unknown, context: Record<string, unknown> = {}) {
  console.error(`[fleet.${action}]`, { ...context, error });
}

/** Turn database errors from 0003_fleet into form feedback. */
function dbError(error: PostgrestError, formData: FormData, kind: Kind): ActionState {
  if (error.code === "23505") {
    const field = error.message.includes("vin") ? "vin" : "unitNumber";
    const message =
      field === "vin"
        ? `Another active ${kind} already has this VIN.`
        : `Another active ${kind} already uses this unit number.`;
    return { ...validationErrorFor(field, message), values: valuesOf(formData) };
  }
  switch (error.hint) {
    case "sold_read_only":
      return errorState(`This ${kind} is sold and can't be changed. An owner or admin can change its status first.`, formData);
    case "sold_status":
      return errorState("Only an owner or admin can mark an asset sold or change a sold status.", formData);
    case "meter_decrease":
      return { ...validationErrorFor("reading", "The reading is lower than the current value. Readings only go up."), values: valuesOf(formData) };
    case "archived":
      return errorState(`Restore this ${kind} before recording readings.`, formData);
  }
  if (error.code === "42501") return errorState(NO_PERMISSION, formData);
  logError("db", error);
  return errorState(UNEXPECTED, formData);
}

function validationErrorFor(field: string, message: string): ActionState {
  return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { [field]: [message] } };
}

function valuesOf(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

const nullable = <T,>(v: T | undefined) => (v === undefined ? null : v);

function truckColumns(t: z.infer<typeof truckSchema>) {
  return {
    unit_number: t.unitNumber,
    vin: t.vin,
    year: nullable(t.year),
    make: nullable(t.make),
    model: nullable(t.model),
    plate: nullable(t.plate),
    plate_state: nullable(t.plateState),
    ownership: t.ownership,
    purchase_date: nullable(t.purchaseDate),
    purchase_price_cents: nullable(t.purchasePriceCents),
    status: t.status,
    registration_expires_on: nullable(t.registrationExpiresOn),
    annual_inspection_on: nullable(t.annualInspectionOn),
    annual_inspection_valid_months: t.inspectionValidMonths,
    insurance_expires_on: nullable(t.insuranceExpiresOn),
    notes: nullable(t.notes),
  };
}

function trailerColumns(t: z.infer<typeof trailerSchema>) {
  return {
    unit_number: t.unitNumber,
    vin: nullable(t.vin),
    year: nullable(t.year),
    make: nullable(t.make),
    trailer_type: t.trailerType,
    length_ft: nullable(t.lengthFt),
    plate: nullable(t.plate),
    plate_state: nullable(t.plateState),
    ownership: t.ownership,
    purchase_date: nullable(t.purchaseDate),
    purchase_price_cents: nullable(t.purchasePriceCents),
    status: t.status,
    registration_expires_on: nullable(t.registrationExpiresOn),
    annual_inspection_on: nullable(t.annualInspectionOn),
    annual_inspection_valid_months: t.inspectionValidMonths,
    notes: nullable(t.notes),
  };
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export async function createTruck(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(ASSET_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = createTruckSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trucks")
    .insert({
      organization_id: ctx.active.organizationId,
      ...truckColumns(parsed.data),
      current_odometer: nullable(parsed.data.currentOdometer),
    })
    .select("id")
    .single();
  if (error) return dbError(error, formData, "truck");
  revalidatePath(PATH.truck);
  redirect(`/trucks/${data.id}`);
}

export async function updateTruck(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(ASSET_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = truckSchema.safeParse(Object.fromEntries(formData));
  if (!id.success) return errorState(UNEXPECTED);
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trucks")
    .update(truckColumns(parsed.data))
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", id.data)
    .select("id");
  if (error) return dbError(error, formData, "truck");
  if (!data?.length) return errorState(NO_PERMISSION, formData);
  revalidatePath(PATH.truck);
  redirect(`/trucks/${id.data}`);
}

export async function createTrailer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(ASSET_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = createTrailerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trailers")
    .insert({
      organization_id: ctx.active.organizationId,
      ...trailerColumns(parsed.data),
      hubodometer: nullable(parsed.data.hubodometer),
      reefer_hours: nullable(parsed.data.reeferHours),
    })
    .select("id")
    .single();
  if (error) return dbError(error, formData, "trailer");
  revalidatePath(PATH.trailer);
  redirect(`/trailers/${data.id}`);
}

export async function updateTrailer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(ASSET_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = trailerSchema.safeParse(Object.fromEntries(formData));
  if (!id.success) return errorState(UNEXPECTED);
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trailers")
    .update(trailerColumns(parsed.data))
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", id.data)
    .select("id");
  if (error) {
    if (error.code === "23514" && error.message.includes("reefer")) {
      return { ...validationErrorFor("trailerType", "This trailer has reefer hours recorded, so it must stay a reefer."), values: valuesOf(formData) };
    }
    return dbError(error, formData, "trailer");
  }
  if (!data?.length) return errorState(NO_PERMISSION, formData);
  revalidatePath(PATH.trailer);
  redirect(`/trailers/${id.data}`);
}

// ---------------------------------------------------------------------------
// Status, archive, readings (shared by trucks and trailers)
// ---------------------------------------------------------------------------

export async function changeAssetStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(STATUS_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const kind = kindSchema.safeParse(formData.get("kind"));
  const parsed = changeStatusSchema.safeParse(Object.fromEntries(formData));
  if (!kind.success || !parsed.success) return errorState("Choose a valid status.");
  if (parsed.data.status === "sold" && !canSetSold(ctx.active.role)) {
    return errorState("Only an owner or admin can mark an asset sold.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE[kind.data])
    .update({ status: parsed.data.status })
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return dbError(error, formData, kind.data);
  if (!data?.length) return errorState(NO_PERMISSION);
  revalidatePath(`${PATH[kind.data]}/${parsed.data.id}`);
  revalidatePath(PATH[kind.data]);
  refresh();
  return { status: "success", message: "Status updated." };
}

export async function setAssetArchived(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(ASSET_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const kind = kindSchema.safeParse(formData.get("kind"));
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData));
  if (!kind.success || !parsed.success) return errorState(UNEXPECTED);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE[kind.data])
    .update({ archived_at: parsed.data.archive ? new Date().toISOString() : null })
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) {
    if (error.code === "23505") {
      return errorState(`Can't restore: another active ${kind.data} now uses the same unit number or VIN.`);
    }
    return dbError(error, formData, kind.data);
  }
  if (!data?.length) return errorState(NO_PERMISSION);
  revalidatePath(`${PATH[kind.data]}/${parsed.data.id}`);
  revalidatePath(PATH[kind.data]);
  refresh();
  return { status: "success", message: parsed.data.archive ? "Archived." : "Restored." };
}

export async function recordReading(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(ASSET_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = recordReadingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const r = parsed.data;

  if (r.isCorrection && !canCorrectReadings(ctx.active.role)) {
    return errorState("Only an owner or admin can correct a reading.", formData);
  }
  if (r.readOn > todayIn(ctx.active.timezone)) {
    return { ...validationErrorFor("readOn", "The date can't be in the future."), values: valuesOf(formData) };
  }

  const kind: Kind = r.readingType === "odometer" ? "truck" : "trailer";
  const supabase = await createClient();
  const { error } = await supabase.from("odometer_readings").insert({
    organization_id: ctx.active.organizationId,
    asset_type: kind,
    truck_id: kind === "truck" ? r.id : null,
    trailer_id: kind === "trailer" ? r.id : null,
    reading: r.reading,
    reading_type: r.readingType,
    read_on: r.readOn,
    source: "manual",
    is_correction: r.isCorrection,
    note: nullable(r.note),
  });
  if (error) {
    if (error.code === "23514" && error.message.includes("reefer")) {
      return errorState("Reefer hours can only be recorded for reefer trailers.", formData);
    }
    return dbError(error, formData, kind);
  }
  revalidatePath(`${PATH[kind]}/${r.id}`);
  revalidatePath(PATH[kind]);
  refresh();
  return { status: "success", message: r.isCorrection ? "Correction saved." : "Reading saved." };
}
