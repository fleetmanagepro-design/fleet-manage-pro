"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { type ActionState, errorState, validationError } from "@/lib/action-state";
import { authorizeAction } from "@/lib/auth";
import { nestedFormValues } from "@/lib/nested-form";
import { createClient } from "@/lib/supabase/server";
import { zonedLocalToUtc } from "@/lib/zoned-time";
import { findConflicts } from "./overlap";
import { getLoad, listAssignmentCandidates, lookupZip } from "./queries";
import { type ZipInfo, zip5 } from "./stop-lookup";
import {
  accessorialSchema,
  assignLoadSchema,
  changeStatusSchema,
  driverItemSchema,
  loadFormSchema,
  removeAccessorialSchema,
  removeDriverItemSchema,
} from "./schemas";
import { DISPATCH_EDITORS, canOverrideOverlap } from "./status";

const NO_PERMISSION = "You don't have permission to do that.";
const UNEXPECTED = "Something went wrong. Please try again.";

/** Messages for the rules enforced in 0004_loads (matched on the error hint). */
const HINTS: Record<string, { field?: string; message: string }> = {
  customer_do_not_use: { field: "customerId", message: "This customer is marked do not use." },
  customer_archived: { field: "customerId", message: "This customer is archived." },
  truck_unavailable: { field: "truckId", message: "This truck is sold or archived." },
  trailer_unavailable: { field: "trailerId", message: "This trailer is sold or archived." },
  driver_inactive: { field: "driver1Id", message: "One of the drivers isn't active." },
  driver_expired: { field: "driver1Id", message: "A driver's CDL or medical card has expired. Renew it before dispatching them." },
  too_many_drivers: { field: "driver2Id", message: "A load can have at most two drivers." },
  reason_required: { field: "reason", message: "Give a reason." },
  not_ready_to_dispatch: { message: "Assign a truck and a driver, and add a pickup and a delivery, before dispatching." },
  delivery_details_required: { field: "loadedMiles", message: "Delivered needs the delivery time and loaded miles." },
  invoicing_not_built: { message: "Invoicing isn't built yet, so loads can't be marked invoiced or paid." },
  cancel_delivered: { message: "A delivered load can't be cancelled. Move it back first (with a reason)." },
  driver_not_on_load: { field: "driverId", message: "This driver isn't on the load." },
};

function dbError(action: string, error: PostgrestError): ActionState {
  const known = error.hint ? HINTS[error.hint] : undefined;
  if (known) {
    return known.field
      ? { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { [known.field]: [known.message] } }
      : errorState(known.message);
  }
  if (error.code === "42501") return errorState(NO_PERMISSION);
  console.error(`[dispatch.${action}]`, { error });
  return errorState(UNEXPECTED);
}

export async function saveLoad(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DISPATCH_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = loadFormSchema.safeParse(nestedFormValues(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const l = parsed.data;
  const orgId = ctx.active.organizationId;
  const driverIds = [l.driver1Id, l.driver2Id].filter((d): d is string => !!d);
  const stops = l.stops.map((s) => ({
    stop_type: s.stopType,
    facility_name: s.facilityName ?? null,
    address_line1: s.addressLine1 ?? null,
    city: s.city,
    state: s.state,
    zip: s.zip ?? null,
    timezone: s.timezone,
    appointment_start: s.appointmentStartUtc,
    appointment_end: s.appointmentEndUtc,
    // Only pickups carry a pickup number (a stop switched to delivery drops it).
    reference_number: s.stopType === "pickup" ? (s.referenceNumber ?? null) : null,
  }));

  // Overlapping truck/driver assignments: warn; owner/admin may override with a reason.
  const conflicts = findConflicts(
    { id: l.id, truck_id: l.truckId ?? null, driver_ids: driverIds, stops },
    await listAssignmentCandidates(orgId, l.truckId ?? null, driverIds),
  );
  if (conflicts.length) {
    const list = conflicts.map((c) => `load ${c.loadNumber} (same ${c.reason})`).join(", ");
    if (!canOverrideOverlap(ctx.active.role)) {
      return { status: "error", message: `The truck or a driver is already on ${list} at that time. Ask an owner or admin to override, or change the assignment.` };
    }
    if (!l.overrideReason) {
      return {
        status: "error",
        message: `The truck or a driver is already on ${list} at that time. To save anyway, give a reason for the override.`,
        fieldErrors: { overrideReason: ["Required to override the overlap."] },
        data: { needsOverride: "true" },
      };
    }
  }

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("save_load", {
    p_load: {
      id: l.id ?? "",
      organization_id: orgId,
      customer_id: l.customerId,
      customer_reference: l.customerReference ?? null,
      truck_id: l.truckId ?? "",
      trailer_id: l.trailerId ?? "",
      linehaul_cents: l.linehaul,
      fuel_surcharge_cents: 0, // no separate fuel surcharge (decision of 11/12/2026)
      loaded_miles: l.loadedMiles ?? null,
      deadhead_miles: l.deadheadMiles ?? 0,
      commodity: l.commodity ?? null,
      weight_lbs: l.weightLbs ?? null,
      equipment_type: l.equipmentType ?? "",
      notes: l.notes ?? null,
    },
    p_stops: stops,
    p_driver_ids: driverIds,
  });
  if (error || !id) return error ? dbError("saveLoad", error) : errorState(UNEXPECTED);

  if (conflicts.length && l.overrideReason) {
    const list = conflicts.map((c) => c.loadNumber).join(", ");
    const { error: overrideError } = await supabase.rpc("record_load_override", {
      p_load: id,
      p_reason: `Overlaps ${list}: ${l.overrideReason}`,
    });
    if (overrideError) console.error("[dispatch.saveLoad.override]", { overrideError });
  }

  revalidatePath("/loads");
  redirect(`/loads/${id}`);
}

export async function changeLoadStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DISPATCH_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = changeStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const s = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_load_status", {
    p_load: s.id,
    p_to: s.to,
    p_reason: s.reason,
    p_delivered_at: s.deliveredAt ? zonedLocalToUtc(s.deliveredAt, ctx.active.timezone) : undefined,
    p_loaded_miles: s.loadedMiles,
    p_deadhead_miles: s.deadheadMiles,
  });
  if (error) return dbError("changeLoadStatus", error);
  revalidatePath("/loads");
  refresh();
  return { status: "success", message: "Status updated." };
}

export async function addAccessorial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DISPATCH_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = accessorialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const a = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("load_accessorials").insert({
    organization_id: ctx.active.organizationId,
    load_id: a.loadId,
    type: a.type,
    amount_cents: a.amount,
    billable_to_customer: a.billableToCustomer,
    notes: a.notes ?? null,
  });
  if (error) return dbError("addAccessorial", error);
  refresh();
  return { status: "success", message: "Accessorial added." };
}

export async function removeAccessorial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DISPATCH_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = removeAccessorialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("load_accessorials")
    .delete()
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return dbError("removeAccessorial", error);
  if (!data?.length) return errorState(NO_PERMISSION);
  refresh();
  return { status: "success", message: "Accessorial removed." };
}

/** Assign truck/trailer/drivers from the dispatch board (same overlap rule as the load form). */
export async function assignLoad(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DISPATCH_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = assignLoadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const a = parsed.data;
  const orgId = ctx.active.organizationId;
  const load = await getLoad(orgId, a.loadId);
  if (!load) return errorState(NO_PERMISSION);
  const driverIds = [a.driver1Id, a.driver2Id].filter((d): d is string => !!d);

  const conflicts = findConflicts(
    { id: load.id, truck_id: a.truckId, driver_ids: driverIds, stops: load.stops },
    await listAssignmentCandidates(orgId, a.truckId, driverIds),
  );
  if (conflicts.length) {
    const list = conflicts.map((c) => `load ${c.loadNumber} (same ${c.reason})`).join(", ");
    if (!canOverrideOverlap(ctx.active.role)) {
      return { status: "error", message: `Already on ${list} at that time. Ask an owner or admin to override.` };
    }
    if (!a.overrideReason) {
      return {
        status: "error",
        message: `Already on ${list} at that time. Give a reason to override.`,
        fieldErrors: { overrideReason: ["Required to override the overlap."] },
        data: { needsOverride: "true" },
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_load", {
    p_load: a.loadId,
    p_truck: a.truckId,
    // null clears the trailer; the generated type doesn't model nullable arguments
    p_trailer: (a.trailerId ?? null) as string,
    p_driver_ids: driverIds,
  });
  if (error) return dbError("assignLoad", error);
  if (conflicts.length && a.overrideReason) {
    const { error: overrideError } = await supabase.rpc("record_load_override", {
      p_load: a.loadId,
      p_reason: `Overlaps ${conflicts.map((c) => c.loadNumber).join(", ")}: ${a.overrideReason}`,
    });
    if (overrideError) console.error("[dispatch.assignLoad.override]", { overrideError });
  }
  revalidatePath("/loads");
  refresh();
  return { status: "success", message: `Load ${load.load_number} assigned.` };
}

/** Who records driver extras on a load (e.g. "unloaded the trailer"): dispatch and pay people. */
const DRIVER_ITEM_EDITORS = ["owner", "admin", "dispatcher", "accounting"] as const;

export async function addDriverItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_ITEM_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = driverItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("load_driver_items").insert({
    organization_id: ctx.active.organizationId,
    load_id: d.loadId,
    driver_id: d.driverId,
    description: d.description,
    amount_cents: d.amount,
  });
  if (error) return dbError("addDriverItem", error);
  refresh();
  return { status: "success", message: "Driver extra added." };
}

export async function removeDriverItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_ITEM_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = removeDriverItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("load_driver_items").delete()
    .eq("organization_id", ctx.active.organizationId).eq("id", parsed.data.id).select("id");
  if (error) return dbError("removeDriverItem", error);
  if (!data?.length) return errorState(NO_PERMISSION);
  refresh();
  return { status: "success", message: "Driver extra removed." };
}

/** ZIP → city, state, time zone for the stop form. Null when unknown or not allowed. */
export async function lookupZipCode(zip: string): Promise<ZipInfo | null> {
  const ctx = await authorizeAction(DISPATCH_EDITORS);
  const z = typeof zip === "string" ? zip5(zip) : null;
  if (!ctx || !z) return null;
  try {
    return await lookupZip(z);
  } catch {
    return null;
  }
}
