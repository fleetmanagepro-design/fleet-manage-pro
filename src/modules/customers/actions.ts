"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { type ActionState, errorState, formValues, validationError } from "@/lib/action-state";
import { authorizeAction } from "@/lib/auth";
import { checkbox } from "@/lib/form-fields";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_EDITORS } from "./permissions";
import { contactSchema, customerSchema, removeContactSchema } from "./schemas";

const NO_PERMISSION = "You don't have permission to do that.";
const UNEXPECTED = "Something went wrong. Please try again.";
const nullable = <T,>(v: T | undefined) => (v === undefined ? null : v);

function dbError(action: string, error: PostgrestError, formData?: FormData): ActionState {
  if (error.code === "42501") return errorState(NO_PERMISSION, formData);
  if (error.code === "23505" && formData) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: { mcNumber: ["Another active customer already has this MC number."] },
      values: formValues(formData),
    };
  }
  console.error(`[customers.${action}]`, { error });
  return errorState(UNEXPECTED, formData);
}

function columns(c: z.infer<typeof customerSchema>) {
  return {
    name: c.name,
    customer_type: c.customerType,
    mc_number: nullable(c.mcNumber),
    billing_email: nullable(c.billingEmail),
    phone: nullable(c.phone),
    address_line1: nullable(c.addressLine1),
    city: nullable(c.city),
    state: nullable(c.state),
    zip: nullable(c.zip),
    payment_terms_days: c.paymentTermsDays,
    status: c.status,
    // The reason only means something while the customer is marked do-not-use.
    do_not_use_reason: c.status === "do_not_use" ? nullable(c.doNotUseReason) : null,
    notes: nullable(c.notes),
  };
}

export async function createCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(CUSTOMER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ organization_id: ctx.active.organizationId, ...columns(parsed.data) })
    .select("id")
    .single();
  if (error) return dbError("createCustomer", error, formData);
  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

export async function updateCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(CUSTOMER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return errorState(UNEXPECTED);
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update(columns(parsed.data))
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", id.data)
    .select("id");
  if (error) return dbError("updateCustomer", error, formData);
  if (!data?.length) return errorState(NO_PERMISSION, formData);
  revalidatePath("/customers");
  redirect(`/customers/${id.data}`);
}

export async function setCustomerArchived(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(CUSTOMER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = z.object({ id: z.uuid(), archive: checkbox }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ archived_at: parsed.data.archive ? new Date().toISOString() : null })
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) {
    if (error.code === "23505") return errorState("Can't restore: another active customer now has the same MC number.");
    return dbError("setCustomerArchived", error);
  }
  if (!data?.length) return errorState(NO_PERMISSION);
  revalidatePath("/customers");
  refresh();
  return { status: "success", message: parsed.data.archive ? "Archived." : "Restored." };
}

export async function addContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(CUSTOMER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error, formData);
  const c = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("customer_contacts").insert({
    organization_id: ctx.active.organizationId,
    customer_id: c.customerId,
    name: c.name,
    email: nullable(c.email),
    phone: nullable(c.phone),
    role: nullable(c.role),
  });
  if (error) return dbError("addContact", error, formData);
  revalidatePath(`/customers/${c.customerId}`);
  refresh();
  return { status: "success", message: "Contact added." };
}

export async function removeContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction(CUSTOMER_EDITORS);
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = removeContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_contacts")
    .delete()
    .eq("organization_id", ctx.active.organizationId)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return dbError("removeContact", error);
  if (!data?.length) return errorState(NO_PERMISSION);
  revalidatePath(`/customers/${parsed.data.customerId}`);
  refresh();
  return { status: "success", message: "Contact removed." };
}
