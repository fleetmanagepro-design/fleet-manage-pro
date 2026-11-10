"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/action-state";
import { addAccessorial, removeAccessorial } from "../actions";
import { ACCESSORIAL_LABELS, ACCESSORIAL_TYPES } from "../labels";

export function AddAccessorialForm({ loadId }: { loadId: string }) {
  const [state, action] = useActionState(addAccessorial, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  const e = state.fieldErrors ?? {};
  const v = state.status === "error" ? (state.values ?? {}) : {};
  return (
    <form ref={ref} action={action} className="grid gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="loadId" value={loadId} />
      <div className="grid gap-3 sm:grid-cols-[10rem_8rem_1fr]">
        <FormField id="accType" name="type" label="Type" errors={e.type}>
          <NativeSelect id="accType" name="type" defaultValue={v.type ?? "detention"} className="w-full">
            {ACCESSORIAL_TYPES.map((t) => <NativeSelectOption key={t} value={t}>{ACCESSORIAL_LABELS[t]}</NativeSelectOption>)}
          </NativeSelect>
        </FormField>
        <FormField id="accAmount" name="amount" label="Amount (USD)" inputMode="decimal" defaultValue={v.amount} errors={e.amount} />
        <FormField id="accNotes" name="notes" label="Note (optional)" defaultValue={v.notes} errors={e.notes} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="billableToCustomer" defaultChecked={v.billableToCustomer !== undefined ? v.billableToCustomer === "on" : true} />
        Bill to the customer (counts as load revenue)
      </label>
      <div>
        <SubmitButton variant="outline" size="sm" pendingLabel="Adding…">Add accessorial</SubmitButton>
      </div>
    </form>
  );
}

export function RemoveAccessorialButton({ id, loadId, label }: { id: string; loadId: string; label: string }) {
  const [state, action] = useActionState(removeAccessorial, initialActionState);
  return (
    <form action={action} className="grid justify-items-end gap-1"
      onSubmit={(ev) => { if (!window.confirm(`Remove ${label}?`)) ev.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="loadId" value={loadId} />
      <SubmitButton size="sm" variant="ghost" pendingLabel="…" aria-label={`Remove ${label}`}>Remove</SubmitButton>
      {state.status === "error" && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
    </form>
  );
}
