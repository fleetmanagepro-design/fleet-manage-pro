"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/action-state";
import { addDriverItem, removeDriverItem } from "../actions";

export function AddDriverItemForm({ loadId, drivers }: { loadId: string; drivers: { id: string; label: string }[] }) {
  const [state, action] = useActionState(addDriverItem, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  const e = state.fieldErrors ?? {};
  const v = state.status === "error" ? (state.values ?? {}) : {};
  if (drivers.length === 0) return <p className="text-sm text-muted-foreground">Assign a driver to add extras.</p>;
  return (
    <form ref={ref} action={action} className="grid gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="loadId" value={loadId} />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr_8rem]">
        <FormField id="itemDriver" label="Driver" errors={e.driverId}>
          <NativeSelect id="itemDriver" name="driverId" defaultValue={v.driverId ?? drivers[0].id} className="w-full">
            {drivers.map((d) => <NativeSelectOption key={d.id} value={d.id}>{d.label}</NativeSelectOption>)}
          </NativeSelect>
        </FormField>
        <FormField id="itemDescription" name="description" label="For" placeholder="Unloaded the trailer"
          defaultValue={v.description} errors={e.description} />
        <FormField id="itemAmount" name="amount" label="Pay to driver (USD)" inputMode="decimal" defaultValue={v.amount} errors={e.amount} />
      </div>
      <div>
        <SubmitButton variant="outline" size="sm" pendingLabel="Adding…">Add driver extra</SubmitButton>
      </div>
    </form>
  );
}

export function RemoveDriverItemButton({ id, loadId, label }: { id: string; loadId: string; label: string }) {
  const [state, action] = useActionState(removeDriverItem, initialActionState);
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
