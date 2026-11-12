"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { type ActionState, errorState, formValues, validationError } from "@/lib/action-state";
import { authorizeAction } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { checkbox } from "@/lib/form-fields";
import { createClient } from "@/lib/supabase/server";
import { DRIVER_EDITORS } from "./permissions";
import { finalizeBlockers } from "./calculations";
import { deductionSchema, deletePayRuleSchema, driverSchema, endDeductionSchema, finalizeStatementSchema, payRuleSchema, voidStatementSchema } from "./schemas";
import { getDriverWeekStatement } from "./statement-queries";

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
  if (error.hint === "statement_order") return errorState(error.message + ".", formData);
  if (error.hint === "statement_stale" || error.hint === "week_not_over" || error.hint === "reason_required") {
    return errorState(`${error.message}. Reload the page and check the statement.`, formData);
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
    default_trailer_id: nullable(d.defaultTrailerId),
    emergency_contact_name: nullable(d.emergencyContactName),
    emergency_contact_phone: nullable(d.emergencyContactPhone),
    notes: nullable(d.notes),
  };
}

function driverDbError(action: string, error: PostgrestError, formData: FormData): ActionState {
  if (error.code === "23505") return fieldError("cdlNumber", "Another active driver already has this CDL number in this state.", formData);
  if (error.code === "23503") {
    return error.message.includes("trailer")
      ? fieldError("defaultTrailerId", "Choose a trailer from your fleet.", formData)
      : fieldError("defaultTruckId", "Choose a truck from your fleet.", formData);
  }
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
    // Owner-operators: stored as the share they keep, of the whole load value.
    percent: r.payType === "percent" ? Math.round((100 - r.companyFeePercent) * 100) / 100 : null,
    percent_basis: r.payType === "percent" ? "total" : null,
    flat_cents: null,
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

export async function addDeduction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = deductionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("driver_deductions").insert({
    organization_id: ctx.active.organizationId,
    driver_id: d.driverId,
    name: d.name,
    kind: d.kind,
    percent: d.kind === "percent_of_gross" ? d.percent : null,
    amount_cents: d.kind === "fixed_weekly" ? d.amount : d.kind === "per_mile" ? nullable(d.amount) : null,
    rate_cents_per_mile: d.kind === "per_mile" ? d.ratePerMile : null,
    free_miles: d.kind === "per_mile" ? d.freeMiles : null,
    starts_on: d.startsOn,
    notes: nullable(d.notes),
  });
  if (error) return dbError("addDeduction", error, formData);
  refresh();
  return { status: "success", message: "Deduction added." };
}

export async function endDeduction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = endDeductionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("driver_deductions")
    .update({ ends_on: todayIn(ctx.active.timezone) })
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return dbError("endDeduction", error);
  if (!data?.length) return errorState(NO_PERMISSION);
  refresh();
  return { status: "success", message: "Deduction ended." };
}

/**
 * Finalize a driver's weekly statement. The numbers are recomputed here from the database —
 * never taken from the form — and stored as an immutable snapshot (0004d).
 */
export async function finalizeStatement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = finalizeStatementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);
  const { driverId, week } = parsed.data;
  const { organizationId, timezone } = ctx.active;

  const s = await getDriverWeekStatement(organizationId, driverId, week, timezone);
  if (!s) return errorState(NO_PERMISSION);
  if (s.finalized) return errorState("This week is already finalized.");
  if (s.laterFinalized) return errorState("A later week is already finalized. Void it first to finalize this one.");
  const blockers = finalizeBlockers(s.draft, todayIn(timezone));
  if (blockers.length) return errorState(blockers.join(" "));

  const d = s.draft;
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_driver_statement", {
    p_org: organizationId,
    p_driver: driverId,
    p_week: week,
    p_header: {
      load_count: d.loadCount, gross_cents: d.grossCents, company_fee_cents: d.companyFeeCents, extras_cents: d.extrasCents,
      deductions_cents: d.deductionsCents, carried_in_cents: d.carriedInCents, net_cents: d.netCents,
    },
    p_lines: d.lines,
  });
  if (error) return dbError("finalizeStatement", error);
  refresh();
  return { status: "success", message: "Statement finalized." };
}

export async function voidStatement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(DRIVER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = voidStatementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_driver_statement", { p_statement: parsed.data.statementId, p_reason: parsed.data.reason });
  if (error) return dbError("voidStatement", error, formData);
  refresh();
  return { status: "success", message: "Statement voided." };
}
