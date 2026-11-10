"use client";

import { useActionState, useState, useTransition } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/action-state";
import { changeLoadStatus } from "../actions";
import { LOAD_STATUS_LABELS, type LoadStatus } from "../labels";
import { availableMoves } from "../status";

type Props = {
  loadId: string;
  status: LoadStatus;
  loadedMiles: number | null;
  deadheadMiles: number | null;
  /** "YYYY-MM-DDTHH:mm" now in the organization's time zone. */
  nowLocal: string;
  timezoneLabel: string;
};

export function StatusPanel({ loadId, status, loadedMiles, deadheadMiles, nowLocal, timezoneLabel }: Props) {
  const [state, action] = useActionState(changeLoadStatus, initialActionState);
  const [pending, startTransition] = useTransition();
  const moves = availableMoves(status);
  const [to, setTo] = useState<LoadStatus | "">(moves[0]?.to ?? "");
  const move = moves.find((m) => m.to === to);
  const e = state.fieldErrors ?? {};

  if (moves.length === 0) {
    return <p className="text-sm text-muted-foreground">Status changes for invoiced and paid loads come with invoicing.</p>;
  }

  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <FormMessage state={state} />
      <input type="hidden" name="id" value={loadId} />
      <FormField id="to" label="Move to" errors={e.to}>
        <NativeSelect id="to" name="to" value={to} className="w-full" onChange={(ev) => setTo(ev.target.value as LoadStatus)}>
          {moves.map((m) => (
            <NativeSelectOption key={m.to} value={m.to}>
              {m.direction === "back" ? "← Back to " : m.direction === "reactivate" ? "Reactivate as " : ""}
              {LOAD_STATUS_LABELS[m.to]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>

      {to === "delivered" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField id="deliveredAt" label="Delivered at" type="datetime-local" defaultValue={nowLocal}
            errors={e.deliveredAt} hint={timezoneLabel} />
          <FormField id="deliveredLoadedMiles" name="loadedMiles" label="Loaded miles" inputMode="decimal"
            defaultValue={loadedMiles ?? ""} errors={e.loadedMiles} />
          <FormField id="deliveredDeadheadMiles" name="deadheadMiles" label="Deadhead miles" inputMode="decimal"
            defaultValue={deadheadMiles ?? 0} errors={e.deadheadMiles} />
        </div>
      )}

      {move?.needsReason && (
        <FormField id="reason" label={to === "cancelled" ? "Why is it cancelled?" : "Why is the status going back?"}
          errors={e.reason} />
      )}

      <div>
        <Button type="submit" disabled={pending || !to} aria-busy={pending}>
          {pending ? "Saving…" : to ? `Mark ${LOAD_STATUS_LABELS[to].toLowerCase()}` : "Update"}
        </Button>
      </div>
    </form>
  );
}
