"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { type ActionState, errorState, formValues, validationError } from "@/lib/action-state";
import { authorizeAction } from "@/lib/auth";
import { checkbox } from "@/lib/form-fields";
import { createClient } from "@/lib/supabase/server";
import { DRIVER_EDITORS } from "./permissions";
import { deletePayRuleSchema, driverSchema, payRuleSchema } from "./schemas";

const NO_PERMISSION = "You don't have permission to do that.";
const UNEXPECTED = "Something went wrong. Please try again.";

function fieldError(field: string, message: string, formData: FormData): ActionState {
  return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { [field]: [message] }, values: formValues(formData) };
}

function dbError(action: string, error: PostgrestError, formData?: FormData): ActionState {
  if (error.code === "42501") return errorState(NO_PERMISSION, formData);
  if (error.hint === "pay_rule_in_effect") {
    return errorState("This pay rule is already in effect and can't be changed. Add a new rule with a later date instead.", formData);
  }
  console.error(`[drivers.${action}]`, { error });
  return errorState(UNEXPECTED, formData);
}

const nullable = <T,>(v: T | undefined) => (v === undefined ? null : v);

function driverColumns(d: z.infer<typeof driverSchema>) {
  return {
    first_name: d.firstName,
    last_name: d.lastName,
    phone: nullable(d.phone),
    email: nullable(d.email),
    driver_type: d.driverType,
    hire_date: nullable(d.hireDate),
    status: d.status,
    cdl_number: nullable(d.cdlNumber),
    cdl_state: nullable(d.cdlState),
    cdl_class: nullable(d.cdlClass),
    cdl_expires_on: nullable(d.cdlExpiresOn),
    medical_card_expires_on: nullable(d.medicalCardExpiresOn),
    default_truck_id: nullable(d.defaultTruckId),
    emergency_contact_name: nullable(d.emergencyContactName),
    emergency_contact_phone: nullable(d.emergencyContactPhone),
    notes: nullable(d.notes),
  };
}

function driverDbError(action: string, error: PostgrestError, formData: FormData): ActionState {
  if (error.code === "23505") return fieldError("cdlNumber", "Another active driver already has this CDL number in this state.", formData);
  if (error.code === "23503") return fieldError("defaultTruckId", "Choose a truck from your fleet.", formData);
  return dbError(action, error, formData);
}

export async function createDriver(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = driverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .insert({ organization_id: ctx.active.organizationId, ...driverColumns(parsed.data) })
    .select("id")
    .single();
  if (error) return driverDbError("createDriver", error, formData);
  revalidatePath("/drivers");
  redirect(`/drivers/${data.id}`);
}

export async function updateDriver(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return errorState(UNEXPECTED);
  const parsed = driverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .update(driverColumns(parsed.data))
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", id.data)
    .select("id");
  if (error) return driverDbError("updateDriver", error, formData);
  if (!data?.length) return errorState(NO_PERMISSION, formData);
  revalidatePath("/drivers");
  redirect(`/drivers/${id.data}`);
}

export async function setDriverArchived(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = z.object({ id: z.uuid(), archive: checkbox }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .update({ archived_at: parsed.data.archive ? new Date().toISOString() : null })
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) {
    if (error.code === "23505") return errorState("Can't restore: another active driver now has the same CDL number.");
    return dbError("setDriverArchived", error);
  }
  if (!data?.length) return errorState(NO_PERMISSION);
  revalidatePath("/drivers");
  refresh();
  return { status: "success", message: parsed.data.archive ? "Archived." : "Restored." };
}

export async function addPayRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = payRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const r = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("driver_pay_rules").insert({
    organization_id: ctx.active.organizationId,
    driver_id: r.driverId,
    effective_from: r.effectiveFrom,
    pay_type: r.payType,
    rate_cents_per_mile: r.payType === "per_mile" ? r.ratePerMile : null,
    miles_basis: r.payType === "per_mile" ? r.milesBasis : null,
    percent: r.payType === "percent" ? r.percent : null,
    percent_basis: r.payType === "percent" ? r.percentBasis : null,
    flat_cents: r.payType === "flat" ? r.flatAmount : null,
    stop_pay_cents: r.stopPayCents,
    detention_pay_cents_per_hour: r.detentionPayCentsPerHour,
    notes: nullable(r.notes),
  });
  if (error) {
    if (error.code === "23505") return fieldError("effectiveFrom", "This driver already has a pay rule starting on that date.", formData);
    if (error.code === "23514" && error.message.includes("rate_cents_per_mile")) {
      return fieldError("ratePerMile", "Enter a rate between $0.01 and $100.00 per mile.", formData);
    }
    return dbError("addPayRule", error, formData);
  }
  revalidatePath(`/drivers/${r.driverId}`);
  refresh();
  return { status: "success", message: "Pay rule added." };
}

export async function deletePayRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = deletePayRuleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("driver_pay_rules")
    .delete()
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return dbError("deletePayRule", error);
  if (!data?.length) return errorState(NO_PERMISSION);
  revalidatePath(`/drivers/${parsed.data.driverId}`);
  refresh();
  return { status: "success", message: "Pay rule removed." };
}
