"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/action-state";
import { addPayRule, deletePayRule, setDriverArchived } from "../actions";
import {
  MILES_BASES,
  MILES_BASIS_LABELS,
  PAY_TYPES,
  PAY_TYPE_LABELS,
  PERCENT_BASES,
  PERCENT_BASIS_LABELS,
  type PayType,
} from "../labels";

export function PayRuleForm({ driverId, today }: { driverId: string; today: string }) {
  const [state, action] = useActionState(addPayRule, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const v = state.status === "error" ? (state.values ?? {}) : {};
  const [payType, setPayType] = useState<PayType>((v.payType as PayType) || "per_mile");
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  const e = state.fieldErrors ?? {};

  return (
    <form ref={formRef} action={action} className="grid gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="driverId" value={driverId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="payType" label="Pay type" errors={e.payType}>
          <NativeSelect id="payType" name="payType" value={payType} className="w-full"
            onChange={(ev) => setPayType(ev.target.value as PayType)}>
            {PAY_TYPES.map((t) => (
              <NativeSelectOption key={t} value={t}>{PAY_TYPE_LABELS[t]}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="effectiveFrom" label="Effective from" type="date" required defaultValue={v.effectiveFrom ?? today}
          errors={e.effectiveFrom} hint="Rules already in effect can't be changed later." />
      </div>

      {payType === "per_mile" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="ratePerMile" label="Rate per mile (USD)" inputMode="decimal" placeholder="0.58"
            defaultValue={v.ratePerMile} errors={e.ratePerMile} />
          <FormField id="milesBasis" label="Paid on" errors={e.milesBasis}>
            <NativeSelect id="milesBasis" name="milesBasis" defaultValue={v.milesBasis ?? "loaded"} className="w-full">
              {MILES_BASES.map((b) => (
                <NativeSelectOption key={b} value={b}>{MILES_BASIS_LABELS[b]}</NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      )}
      {payType === "percent" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="percent" label="Percent" inputMode="decimal" placeholder="72" defaultValue={v.percent} errors={e.percent} />
          <FormField id="percentBasis" label="Of" errors={e.percentBasis}>
            <NativeSelect id="percentBasis" name="percentBasis" defaultValue={v.percentBasis ?? "linehaul_fsc"} className="w-full">
              {PERCENT_BASES.map((b) => (
                <NativeSelectOption key={b} value={b}>{PERCENT_BASIS_LABELS[b]}</NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      )}
      {payType === "flat" && (
        <FormField id="flatAmount" label="Amount per load (USD)" inputMode="decimal" placeholder="450.00"
          defaultValue={v.flatAmount} errors={e.flatAmount} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="stopPayCents" label="Stop pay per extra stop (USD, optional)" inputMode="decimal"
          defaultValue={v.stopPayCents} errors={e.stopPayCents} />
        <FormField id="detentionPayCentsPerHour" label="Detention pay per hour (USD, optional)" inputMode="decimal"
          defaultValue={v.detentionPayCentsPerHour} errors={e.detentionPayCentsPerHour} />
      </div>
      <FormField id="notes" label="Note (optional)" defaultValue={v.notes} errors={e.notes} />
      <div>
        <SubmitButton pendingLabel="Saving…">Add pay rule</SubmitButton>
      </div>
    </form>
  );
}

export function DeletePayRuleButton({ id, driverId }: { id: string; driverId: string }) {
  const [state, action] = useActionState(deletePayRule, initialActionState);
  return (
    <form action={action} className="grid justify-items-end gap-1"
      onSubmit={(ev) => { if (!window.confirm("Remove this upcoming pay rule?")) ev.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="driverId" value={driverId} />
      <SubmitButton size="sm" variant="outline" pendingLabel="Removing…">Remove</SubmitButton>
      {state.status === "error" && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
    </form>
  );
}

export function DriverArchiveForm({ id, archived, name }: { id: string; archived: boolean; name: string }) {
  const [state, action] = useActionState(setDriverArchived, initialActionState);
  return (
    <form action={action} className="grid gap-2"
      onSubmit={(ev) => {
        if (!archived && !window.confirm(`Archive ${name}? They will be hidden from lists but their history is kept.`)) ev.preventDefault();
      }}>
      <input type="hidden" name="id" value={id} />
      {!archived && <input type="hidden" name="archive" value="true" />}
      <SubmitButton variant={archived ? "outline" : "destructive"} pendingLabel="Saving…">{archived ? "Restore" : "Archive"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
