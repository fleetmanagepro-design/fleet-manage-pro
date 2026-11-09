"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { initialActionState } from "@/lib/action-state";
import { addContact, removeContact, setCustomerArchived } from "../actions";

export function AddContactForm({ customerId }: { customerId: string }) {
  const [state, action] = useActionState(addContact, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  const e = state.fieldErrors ?? {};
  const v = state.status === "error" ? (state.values ?? {}) : {};
  return (
    <form ref={formRef} action={action} className="grid gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="customerId" value={customerId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="contactName" name="name" label="Contact name" defaultValue={v.name} errors={e.name} />
        <FormField id="contactRole" name="role" label="Role (optional)" placeholder="Dispatch, Billing…" defaultValue={v.role} errors={e.role} />
        <FormField id="contactEmail" name="email" label="Email" type="email" defaultValue={v.email} errors={e.email} />
        <FormField id="contactPhone" name="phone" label="Phone" type="tel" defaultValue={v.phone} errors={e.phone} />
      </div>
      <div>
        <SubmitButton variant="outline" pendingLabel="Adding…">Add contact</SubmitButton>
      </div>
    </form>
  );
}

export function RemoveContactButton({ id, customerId, name }: { id: string; customerId: string; name: string }) {
  const [state, action] = useActionState(removeContact, initialActionState);
  return (
    <form action={action} className="grid justify-items-end gap-1"
      onSubmit={(ev) => { if (!window.confirm(`Remove ${name}?`)) ev.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="customerId" value={customerId} />
      <SubmitButton size="sm" variant="outline" pendingLabel="Removing…" aria-label={`Remove ${name}`}>Remove</SubmitButton>
      {state.status === "error" && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
    </form>
  );
}

export function CustomerArchiveForm({ id, archived, name }: { id: string; archived: boolean; name: string }) {
  const [state, action] = useActionState(setCustomerArchived, initialActionState);
  return (
    <form action={action} className="grid gap-2"
      onSubmit={(ev) => {
        if (!archived && !window.confirm(`Archive ${name}? It will be hidden from lists but its history is kept.`)) ev.preventDefault();
      }}>
      <input type="hidden" name="id" value={id} />
      {!archived && <input type="hidden" name="archive" value="true" />}
      <SubmitButton variant={archived ? "outline" : "destructive"} pendingLabel="Saving…">{archived ? "Restore" : "Archive"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
