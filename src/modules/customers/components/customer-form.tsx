"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import { US_STATES } from "@/lib/us";
import { createCustomer, updateCustomer } from "../actions";
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS, CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS } from "../labels";
import type { Customer } from "../queries";

function toForm(c: Customer): Record<string, string> {
  const v = {
    name: c.name, customerType: c.customer_type, mcNumber: c.mc_number, billingEmail: c.billing_email, phone: c.phone,
    addressLine1: c.address_line1, city: c.city, state: c.state, zip: c.zip, paymentTermsDays: c.payment_terms_days,
    status: c.status, doNotUseReason: c.do_not_use_reason, notes: c.notes,
  };
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === null || x === undefined ? "" : String(x)]));
}

export function CustomerForm({ customer }: { customer?: Customer }) {
  const [state, action] = useActionState(customer ? updateCustomer : createCustomer, initialActionState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? (customer ? toForm(customer) : {});
  const [status, setStatus] = useState(v.status || "active");
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <FormField id="name" label="Name" required autoComplete="organization" defaultValue={v.name} errors={e.name} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="customerType" label="Type" errors={e.customerType}>
          <NativeSelect id="customerType" name="customerType" defaultValue={v.customerType || "broker"} className="w-full">
            {CUSTOMER_TYPES.map((t) => (
              <NativeSelectOption key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="mcNumber" label="MC number" inputMode="numeric" defaultValue={v.mcNumber} errors={e.mcNumber} />
        <FormField id="paymentTermsDays" label="Payment terms (days)" inputMode="numeric" defaultValue={v.paymentTermsDays || "30"}
          errors={e.paymentTermsDays} hint="Invoice due date = invoice date + these days." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="billingEmail" label="Billing email" type="email" defaultValue={v.billingEmail} errors={e.billingEmail} />
        <FormField id="phone" label="Phone" type="tel" defaultValue={v.phone} errors={e.phone} />
      </div>
      <FormField id="addressLine1" label="Street address" defaultValue={v.addressLine1} errors={e.addressLine1} />
      <div className="grid grid-cols-[1fr_7rem_7rem] gap-3">
        <FormField id="city" label="City" defaultValue={v.city} errors={e.city} />
        <FormField id="state" label="State" errors={e.state}>
          <NativeSelect id="state" name="state" defaultValue={v.state ?? ""} className="w-full">
            <NativeSelectOption value="">—</NativeSelectOption>
            {US_STATES.map(([c]) => (
              <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="zip" label="ZIP" inputMode="numeric" defaultValue={v.zip} errors={e.zip} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <FormField id="status" label="Status" errors={e.status}>
          <NativeSelect id="status" name="status" defaultValue={v.status || "active"} onChange={(ev) => setStatus(ev.target.value)} className="w-full">
            {CUSTOMER_STATUSES.map((s) => (
              <NativeSelectOption key={s} value={s}>{CUSTOMER_STATUS_LABELS[s]}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {status === "do_not_use" && (
          <FormField id="doNotUseReason" label="Why not use this customer?" required defaultValue={v.doNotUseReason}
            errors={e.doNotUseReason} />
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={v.notes} />
      </div>
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">{customer ? "Save changes" : "Add customer"}</SubmitButton>
        <Link href={customer ? `/customers/${customer.id}` : "/customers"} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
