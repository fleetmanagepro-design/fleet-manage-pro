"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/action-state";
import { changeAssetStatus, recordReading, setAssetArchived } from "../actions";
import { ASSET_STATUSES, METER_LABELS, STATUS_LABELS, type AssetStatus, type MeterType } from "../labels";

type Kind = "truck" | "trailer";

export function StatusForm({ kind, id, status, allowSold }: { kind: Kind; id: string; status: AssetStatus; allowSold: boolean }) {
  const [state, action] = useActionState(changeAssetStatus, initialActionState);
  const options = ASSET_STATUSES.filter((s) => s !== "sold" || allowSold || status === "sold");
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <div className="flex items-center gap-2">
        <NativeSelect name="status" defaultValue={status} aria-label="Status" className="min-w-40">
          {options.map((s) => (
            <NativeSelectOption key={s} value={s}>{STATUS_LABELS[s]}</NativeSelectOption>
          ))}
        </NativeSelect>
        <SubmitButton variant="outline" pendingLabel="Saving…">Update status</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function ArchiveForm({ kind, id, archived, label }: { kind: Kind; id: string; archived: boolean; label: string }) {
  const [state, action] = useActionState(setAssetArchived, initialActionState);
  return (
    <form
      action={action}
      className="grid gap-2"
      onSubmit={(ev) => {
        if (!archived && !window.confirm(`Archive ${label}? It will be hidden from lists but its history is kept.`)) {
          ev.preventDefault();
        }
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      {!archived && <input type="hidden" name="archive" value="true" />}
      <SubmitButton variant={archived ? "outline" : "destructive"} pendingLabel="Saving…">
        {archived ? "Restore" : "Archive"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ReadingForm({
  id,
  meterTypes,
  today,
  canCorrect,
}: {
  id: string;
  meterTypes: MeterType[];
  today: string;
  canCorrect: boolean;
}) {
  const [state, action] = useActionState(recordReading, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  const e = state.fieldErrors ?? {};
  const v = state.status === "error" ? (state.values ?? {}) : {};
  return (
    <form ref={formRef} action={action} className="grid gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        {meterTypes.length > 1 ? (
          <FormField id="readingType" label="Meter" errors={e.readingType}>
            <NativeSelect id="readingType" name="readingType" defaultValue={v.readingType ?? meterTypes[0]} className="w-full">
              {meterTypes.map((m) => (
                <NativeSelectOption key={m} value={m}>{METER_LABELS[m].label}</NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        ) : (
          <input type="hidden" name="readingType" value={meterTypes[0]} />
        )}
        <FormField id="reading" label={meterTypes.length > 1 ? "Reading" : `${METER_LABELS[meterTypes[0]].label} reading`}
          inputMode="decimal" required defaultValue={v.reading} errors={e.reading} />
        <FormField id="readOn" label="Date" type="date" required max={today} defaultValue={v.readOn ?? today} errors={e.readOn} />
      </div>
      {canCorrect && (
        <div className="grid gap-3 rounded-lg border border-dashed p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isCorrection" defaultChecked={v.isCorrection === "on"} />
            This corrects a wrong reading (may be lower than the current value)
          </label>
          <FormField id="note" label="Reason for correction" defaultValue={v.note} errors={e.note} />
        </div>
      )}
      <div>
        <SubmitButton pendingLabel="Saving…">Save reading</SubmitButton>
      </div>
    </form>
  );
}
