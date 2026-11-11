"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import { STATE_TIME_ZONES, STOP_TIME_ZONES, US_STATES } from "@/lib/us";
import { TRAILER_TYPES, TRAILER_TYPE_LABELS } from "@/modules/fleet/labels";
import { lookupZipCode, saveLoad } from "../actions";
import { type LoadDraft, type StopDraft, emptyStop } from "../load-draft";
import type { LoadFormOptions } from "../queries";
import { SPLIT_TIME_ZONE_STATES, applyFacility, applyZip, zip5 } from "../stop-lookup";
import { FacilityInput } from "./facility-input";

type Props = { draft: LoadDraft; options: LoadFormOptions; orgTimezone: string; today: string; canOverride: boolean };

export function LoadForm({ draft, options, orgTimezone, today, canOverride }: Props) {
  const [state, action] = useActionState(saveLoad, initialActionState);
  const [pending, startTransition] = useTransition();
  const [stops, setStops] = useState<StopDraft[]>(draft.stops);
  const [truckId, setTruckId] = useState(draft.truckId);
  const [driver1Id, setDriver1Id] = useState(draft.driver1Id);
  const e = state.fieldErrors ?? {};
  const showOverride = canOverride && state.data?.needsOverride === "true";

  const updateStop = (i: number, patch: Partial<StopDraft>) =>
    setStops((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  // What the ZIP lookup did for each stop (by stop key): filled from the ZIP, or not found.
  const [zipNotes, setZipNotes] = useState<Partial<Record<string, "filled" | "unknown">>>({});
  const clearZipNote = (key: string) => setZipNotes((n) => ({ ...n, [key]: undefined }));
  const onZipChange = (key: string, value: string) => {
    setStops((prev) => prev.map((s) => (s.key === key ? { ...s, zip: value } : s)));
    const z = zip5(value);
    if (!z) {
      clearZipNote(key);
      return;
    }
    void lookupZipCode(z).then((info) => {
      // Ignore the answer if the ZIP was changed again meanwhile.
      setStops((prev) => prev.map((s) => (s.key === key && zip5(s.zip) === z && info ? applyZip(s, info) : s)));
      setZipNotes((n) => ({ ...n, [key]: info ? "filled" : "unknown" }));
    });
  };
  const moveStop = (i: number, by: -1 | 1) =>
    setStops((prev) => {
      const next = [...prev];
      const [s] = next.splice(i, 1);
      next.splice(i + by, 0, s);
      return next;
    });

  // Picking a truck suggests its default driver.
  const onTruckChange = (id: string) => {
    setTruckId(id);
    if (!driver1Id) {
      const d = options.drivers.find((x) => x.defaultTruckId === id);
      if (d) setDriver1Id(d.id);
    }
  };

  const expired = (d: LoadFormOptions["drivers"][number]) =>
    (!!d.cdlExpiresOn && d.cdlExpiresOn < today) || (!!d.medicalCardExpiresOn && d.medicalCardExpiresOn < today);

  return (
    <form
      className="grid gap-6"
      noValidate
      // Submitted by hand so React doesn't reset the form (and the stop rows) after a failed save.
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <FormMessage state={state} />
      {draft.id && <input type="hidden" name="id" value={draft.id} />}

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Customer &amp; rate</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_10rem]">
          <FormField id="customerId" label="Customer" errors={e.customerId}>
            <NativeSelect id="customerId" name="customerId" defaultValue={draft.customerId} className="w-full"
              aria-invalid={e.customerId ? true : undefined}>
              <NativeSelectOption value="">Choose…</NativeSelectOption>
              {options.customers.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.label}</NativeSelectOption>)}
            </NativeSelect>
          </FormField>
          <FormField id="customerReference" label="Customer ref / PO #" defaultValue={draft.customerReference} errors={e.customerReference} />
          <FormField id="loadNumber" label="Load #" defaultValue={draft.loadNumber} errors={e.loadNumber}
            placeholder={draft.id ? undefined : "Automatic"} hint={draft.id ? undefined : "Leave empty for the next number."} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <FormField id="linehaul" label="Linehaul (USD)" inputMode="decimal" defaultValue={draft.linehaul} errors={e.linehaul} />
          <FormField id="fuelSurcharge" label="Fuel surcharge (USD)" inputMode="decimal" defaultValue={draft.fuelSurcharge} errors={e.fuelSurcharge} />
          <FormField id="loadedMiles" label="Loaded miles" inputMode="decimal" defaultValue={draft.loadedMiles} errors={e.loadedMiles} />
          <FormField id="deadheadMiles" label="Deadhead miles" inputMode="decimal" defaultValue={draft.deadheadMiles} errors={e.deadheadMiles} />
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Stops</h2>
          {e.stops && <p className="text-xs text-destructive">{e.stops[0]}</p>}
        </div>
        <ol className="grid gap-3">
          {stops.map((s, i) => {
            const se = (f: string) => e[`stops.${i}.${f}`];
            const id = (f: string) => `stop-${s.key}-${f}`;
            return (
              <li key={s.key} className="grid gap-3 rounded-lg border p-3" data-testid={`stop-${i + 1}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Stop {i + 1}</span>
                    <NativeSelect name={`stops.${i}.stopType`} value={s.stopType} size="sm" aria-label={`Stop ${i + 1} type`}
                      onChange={(ev) => updateStop(i, { stopType: ev.target.value as StopDraft["stopType"] })}>
                      <NativeSelectOption value="pickup">Pickup</NativeSelectOption>
                      <NativeSelectOption value="delivery">Delivery</NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => moveStop(i, -1)}
                      aria-label={`Move stop ${i + 1} up`}>↑</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={i === stops.length - 1} onClick={() => moveStop(i, 1)}
                      aria-label={`Move stop ${i + 1} down`}>↓</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={stops.length <= 2}
                      onClick={() => setStops((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove stop ${i + 1}`}>Remove</Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FacilityInput id={id("facility")} name={`stops.${i}.facilityName`} value={s.facilityName}
                    facilities={options.facilities} errors={se("facilityName")}
                    onChange={(v) => updateStop(i, { facilityName: v })}
                    onPick={(f) => {
                      setStops((prev) => prev.map((x, j) => (j === i ? applyFacility(x, f) : x)));
                      clearZipNote(s.key);
                    }} />
                  <FormField id={id("address")} name={`stops.${i}.addressLine1`} label="Address" value={s.addressLine1}
                    onChange={(ev) => updateStop(i, { addressLine1: ev.target.value })} errors={se("addressLine1")} />
                </div>
                <div className="grid gap-3 sm:grid-cols-[7rem_1fr_6rem_14rem]">
                  <FormField id={id("zip")} name={`stops.${i}.zip`} label="ZIP" inputMode="numeric" value={s.zip}
                    onChange={(ev) => onZipChange(s.key, ev.target.value)} errors={se("zip")}
                    hint={zipNotes[s.key] === "filled" ? "City, state and time zone filled in from the ZIP."
                      : zipNotes[s.key] === "unknown" ? "ZIP not in our list — enter the city and state." : undefined} />
                  <FormField id={id("city")} name={`stops.${i}.city`} label="City" value={s.city}
                    onChange={(ev) => updateStop(i, { city: ev.target.value })} errors={se("city")} />
                  <FormField id={id("state")} label="State" errors={se("state")}>
                    <NativeSelect id={id("state")} name={`stops.${i}.state`} value={s.state} className="w-full"
                      aria-invalid={se("state") ? true : undefined}
                      onChange={(ev) => updateStop(i, { state: ev.target.value, timezone: STATE_TIME_ZONES[ev.target.value] ?? s.timezone })}>
                      <NativeSelectOption value="">—</NativeSelectOption>
                      {US_STATES.map(([c]) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
                    </NativeSelect>
                  </FormField>
                  <FormField id={id("tz")} label="Local time zone" errors={se("timezone")}
                    hint={SPLIT_TIME_ZONE_STATES.has(s.state) ? `${s.state} has two time zones — check this one.` : undefined}>
                    <NativeSelect id={id("tz")} name={`stops.${i}.timezone`} value={s.timezone} className="w-full"
                      onChange={(ev) => updateStop(i, { timezone: ev.target.value })}>
                      {STOP_TIME_ZONES.map((z) => <NativeSelectOption key={z.value} value={z.value}>{z.label}</NativeSelectOption>)}
                    </NativeSelect>
                  </FormField>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField id={id("start")} name={`stops.${i}.appointmentStart`} label="Appointment from (local)" type="datetime-local"
                    value={s.appointmentStart} onChange={(ev) => updateStop(i, { appointmentStart: ev.target.value })}
                    errors={se("appointmentStart")} />
                  <FormField id={id("end")} name={`stops.${i}.appointmentEnd`} label="Appointment to (local, optional)" type="datetime-local"
                    value={s.appointmentEnd} onChange={(ev) => updateStop(i, { appointmentEnd: ev.target.value })}
                    errors={se("appointmentEnd")} />
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm"
            onClick={() => setStops((prev) => [...prev, emptyStop("pickup", prev.at(-1)?.timezone ?? orgTimezone)])}>
            + Add pickup
          </Button>
          <Button type="button" variant="outline" size="sm"
            onClick={() => setStops((prev) => [...prev, emptyStop("delivery", prev.at(-1)?.timezone ?? orgTimezone)])}>
            + Add delivery
          </Button>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Assignment</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <FormField id="truckId" label="Truck" errors={e.truckId}>
            <NativeSelect id="truckId" name="truckId" value={truckId} className="w-full" onChange={(ev) => onTruckChange(ev.target.value)}>
              <NativeSelectOption value="">Not assigned</NativeSelectOption>
              {options.trucks.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>)}
            </NativeSelect>
          </FormField>
          <FormField id="trailerId" label="Trailer" errors={e.trailerId}>
            <NativeSelect id="trailerId" name="trailerId" defaultValue={draft.trailerId} className="w-full">
              <NativeSelectOption value="">Not assigned</NativeSelectOption>
              {options.trailers.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>)}
            </NativeSelect>
          </FormField>
          <FormField id="driver1Id" label="Driver" errors={e.driver1Id}>
            <NativeSelect id="driver1Id" name="driver1Id" value={driver1Id} className="w-full" onChange={(ev) => setDriver1Id(ev.target.value)}
              aria-invalid={e.driver1Id ? true : undefined}>
              <NativeSelectOption value="">Not assigned</NativeSelectOption>
              {options.drivers.map((d) => (
                <NativeSelectOption key={d.id} value={d.id} disabled={expired(d)}>
                  {d.label}{expired(d) ? " — CDL/medical expired" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="driver2Id" label="Team driver (optional)" errors={e.driver2Id}>
            <NativeSelect id="driver2Id" name="driver2Id" defaultValue={draft.driver2Id} className="w-full">
              <NativeSelectOption value="">None</NativeSelectOption>
              {options.drivers.map((d) => (
                <NativeSelectOption key={d.id} value={d.id} disabled={expired(d)}>
                  {d.label}{expired(d) ? " — CDL/medical expired" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Freight</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField id="commodity" label="Commodity" defaultValue={draft.commodity} errors={e.commodity} />
          <FormField id="weightLbs" label="Weight (lbs)" inputMode="numeric" defaultValue={draft.weightLbs} errors={e.weightLbs} />
          <FormField id="equipmentType" label="Equipment" errors={e.equipmentType}>
            <NativeSelect id="equipmentType" name="equipmentType" defaultValue={draft.equipmentType} className="w-full">
              <NativeSelectOption value="">—</NativeSelectOption>
              {TRAILER_TYPES.map((t) => <NativeSelectOption key={t} value={t}>{TRAILER_TYPE_LABELS[t]}</NativeSelectOption>)}
            </NativeSelect>
          </FormField>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={draft.notes} />
        </div>
      </section>

      {showOverride && (
        <FormField id="overrideReason" label="Reason for overriding the overlap" errors={e.overrideReason} />
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : draft.id ? "Save changes" : "Create load"}
        </Button>
        <Link href={draft.id ? `/loads/${draft.id}` : "/loads"} className={buttonVariants({ variant: "outline" })}>Cancel</Link>
      </div>
    </form>
  );
}
