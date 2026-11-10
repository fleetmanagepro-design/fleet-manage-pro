"use client";

import { useActionState, useState, useTransition } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/action-state";
import { assignLoad } from "../actions";
import type { LoadFormOptions } from "../queries";

type Props = { loadId: string; loadNumber: string; options: LoadFormOptions; today: string; canOverride: boolean };

/** Assign a truck and driver(s) to an unassigned load, right on the board. */
export function AssignForm({ loadId, loadNumber, options, today, canOverride }: Props) {
  const [state, action] = useActionState(assignLoad, initialActionState);
  const [pending, startTransition] = useTransition();
  const [truckId, setTruckId] = useState("");
  const [driver1Id, setDriver1Id] = useState("");
  const e = state.fieldErrors ?? {};
  const expired = (d: LoadFormOptions["drivers"][number]) =>
    (!!d.cdlExpiresOn && d.cdlExpiresOn < today) || (!!d.medicalCardExpiresOn && d.medicalCardExpiresOn < today);
  const id = (f: string) => `assign-${loadId}-${f}`;

  if (state.status === "success") return <FormMessage state={state} />;

  return (
    <form
      className="grid gap-2"
      noValidate
      aria-label={`Assign load ${loadNumber}`}
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <FormMessage state={state} />
      <input type="hidden" name="loadId" value={loadId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField id={id("truck")} label="Truck" errors={e.truckId}>
          <NativeSelect id={id("truck")} name="truckId" value={truckId} size="sm" className="w-full"
            onChange={(ev) => {
              setTruckId(ev.target.value);
              const d = options.drivers.find((x) => x.defaultTruckId === ev.target.value && !expired(x));
              if (d) setDriver1Id(d.id);
            }}>
            <NativeSelectOption value="">Choose…</NativeSelectOption>
            {options.trucks.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>)}
          </NativeSelect>
        </FormField>
        <FormField id={id("driver")} label="Driver" errors={e.driver1Id}>
          <NativeSelect id={id("driver")} name="driver1Id" value={driver1Id} size="sm" className="w-full"
            onChange={(ev) => setDriver1Id(ev.target.value)}>
            <NativeSelectOption value="">Choose…</NativeSelectOption>
            {options.drivers.map((d) => (
              <NativeSelectOption key={d.id} value={d.id} disabled={expired(d)}>
                {d.label}{expired(d) ? " — expired" : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id={id("trailer")} label="Trailer (optional)" errors={e.trailerId}>
          <NativeSelect id={id("trailer")} name="trailerId" defaultValue="" size="sm" className="w-full">
            <NativeSelectOption value="">None</NativeSelectOption>
            {options.trailers.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>)}
          </NativeSelect>
        </FormField>
        <FormField id={id("driver2")} label="Team driver (optional)" errors={e.driver2Id}>
          <NativeSelect id={id("driver2")} name="driver2Id" defaultValue="" size="sm" className="w-full">
            <NativeSelectOption value="">None</NativeSelectOption>
            {options.drivers.map((d) => (
              <NativeSelectOption key={d.id} value={d.id} disabled={expired(d)}>{d.label}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {canOverride && state.data?.needsOverride === "true" && (
        <FormField id={id("override")} name="overrideReason" label="Reason for overriding the overlap" errors={e.overrideReason} />
      )}
      <div>
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>{pending ? "Assigning…" : "Assign"}</Button>
      </div>
    </form>
  );
}
