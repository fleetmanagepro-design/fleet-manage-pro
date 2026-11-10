"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/action-state";
import { addDeduction, addPayRule, deletePayRule, endDeduction, setDriverArchived } from "../actions";
import { MILES_BASES, MILES_BASIS_LABELS, type PayType } from "../labels";

export function PayRuleForm({ driverId, today, defaultType }: { driverId: string; today: string; defaultType: PayType }) {
  const [state, action] = useActionState(addPayRule, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const v = state.status === "error" ? (state.values ?? {}) : {};
  const [payType, setPayType] = useState<PayType>((v.payType as PayType) || defaultType);
  // After a successful save the form resets to defaults, so the visible fields must follow.
  // (Adjusting state during render when the action result changes: react.dev/learn/you-might-not-need-an-effect)
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "success") setPayType(defaultType);
  }
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  const e = state.fieldErrors ?? {};

  return (
    <form ref={formRef} action={action} className="grid gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="driverId" value={driverId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="payType" label="How this driver is paid" errors={e.payType}>
          <NativeSelect id="payType" name="payType" defaultValue={v.payType || defaultType} className="w-full"
            onChange={(ev) => setPayType(ev.target.value as PayType)}>
            <NativeSelectOption value="percent">Owner-operator — % of load value</NativeSelectOption>
            <NativeSelectOption value="per_mile">Company driver — per mile</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <FormField id="effectiveFrom" label="Effective from" type="date" required defaultValue={v.effectiveFrom ?? today}
          errors={e.effectiveFrom} hint="Rules already in effect can't be changed later." />
      </div>

      {payType === "per_mile" ? (
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
      ) : (
        <FormField id="companyFeePercent" label="Company fee (%)" inputMode="decimal" defaultValue={v.companyFeePercent ?? "12"}
          errors={e.companyFeePercent} hint="The driver keeps the rest of the load value." />
      )}
      <FormField id="notes" label="Note (optional)" defaultValue={v.notes} errors={e.notes} />
      <div>
        <SubmitButton pendingLabel="Saving…">Add pay rule</SubmitButton>
      </div>
    </form>
  );
}

export function DeductionForm({ driverId, today }: { driverId: string; today: string }) {
  const [state, action] = useActionState(addDeduction, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const v = state.status === "error" ? (state.values ?? {}) : {};
  const [kind, setKind] = useState(v.kind || "percent_of_gross");
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "success") setKind("percent_of_gross");
  }
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={formRef} action={action} className="grid gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="driverId" value={driverId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_8rem]">
        <FormField id="deductionName" name="name" label="Deduction" placeholder="Truck rent" defaultValue={v.name} errors={e.name} />
        <FormField id="deductionKind" label="Calculated as" errors={e.kind}>
          <NativeSelect id="deductionKind" name="kind" defaultValue={v.kind || "percent_of_gross"} className="w-full"
            onChange={(ev) => setKind(ev.target.value)}>
            <NativeSelectOption value="percent_of_gross">% of weekly gross</NativeSelectOption>
            <NativeSelectOption value="fixed_weekly">Fixed per week</NativeSelectOption>
          </NativeSelect>
        </FormField>
        {kind === "percent_of_gross" ? (
          <FormField id="deductionPercent" name="percent" label="Percent" inputMode="decimal" defaultValue={v.percent} errors={e.percent} />
        ) : (
          <FormField id="deductionAmount" name="amount" label="USD / week" inputMode="decimal" defaultValue={v.amount} errors={e.amount} />
        )}
      </div>
      <FormField id="deductionStartsOn" name="startsOn" label="Starts" type="date" defaultValue={v.startsOn ?? today} errors={e.startsOn} />
      <div>
        <SubmitButton variant="outline" pendingLabel="Adding…">Add deduction</SubmitButton>
      </div>
    </form>
  );
}

export function EndDeductionButton({ id, driverId, name }: { id: string; driverId: string; name: string }) {
  const [state, action] = useActionState(endDeduction, initialActionState);
  return (
    <form action={action} className="grid justify-items-end gap-1"
      onSubmit={(ev) => { if (!window.confirm(`Stop deducting ${name} from today?`)) ev.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="driverId" value={driverId} />
      <SubmitButton size="sm" variant="outline" pendingLabel="…" aria-label={`End ${name}`}>End</SubmitButton>
      {state.status === "error" && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
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
