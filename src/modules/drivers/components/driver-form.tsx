"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import { US_STATES } from "@/lib/us";
import { createDriver, updateDriver } from "../actions";
import {
  CDL_CLASSES,
  DRIVER_STATUSES,
  DRIVER_STATUS_LABELS,
  DRIVER_TYPES,
  DRIVER_TYPE_LABELS,
} from "../labels";
import type { Driver } from "../queries";

type Option = readonly [string, string];

function Select({ id, label, value, options, errors, empty }: {
  id: string; label: string; value?: string; options: readonly Option[]; errors?: string[]; empty?: string;
}) {
  return (
    <FormField id={id} label={label} errors={errors}>
      <NativeSelect id={id} name={id} defaultValue={value ?? ""} className="w-full" aria-invalid={errors ? true : undefined}>
        {empty !== undefined && <NativeSelectOption value="">{empty}</NativeSelectOption>}
        {options.map(([v, l]) => (
          <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>
        ))}
      </NativeSelect>
    </FormField>
  );
}

function toForm(d: Driver): Record<string, string> {
  const v = {
    firstName: d.first_name, lastName: d.last_name, phone: d.phone, email: d.email, driverType: d.driver_type,
    hireDate: d.hire_date, status: d.status, cdlNumber: d.cdl_number, cdlState: d.cdl_state, cdlClass: d.cdl_class,
    cdlExpiresOn: d.cdl_expires_on, medicalCardExpiresOn: d.medical_card_expires_on, defaultTruckId: d.default_truck_id, defaultTrailerId: d.default_trailer_id,
    emergencyContactName: d.emergency_contact_name, emergencyContactPhone: d.emergency_contact_phone, notes: d.notes,
  };
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x ?? ""]));
}

type Equipment = { id: string; unitNumber: string }[];

export function DriverForm({ driver, trucks, trailers }: { driver?: Driver; trucks: Equipment; trailers: Equipment }) {
  const [state, action] = useActionState(driver ? updateDriver : createDriver, initialActionState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? (driver ? toForm(driver) : {});
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      {driver && <input type="hidden" name="id" value={driver.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="firstName" label="First name" required autoComplete="off" defaultValue={v.firstName} errors={e.firstName} />
        <FormField id="lastName" label="Last name" required autoComplete="off" defaultValue={v.lastName} errors={e.lastName} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="phone" label="Phone" type="tel" defaultValue={v.phone} errors={e.phone} />
        <FormField id="email" label="Email" type="email" defaultValue={v.email} errors={e.email} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select id="driverType" label="Driver type" value={v.driverType || "company"} errors={e.driverType}
          options={DRIVER_TYPES.map((t) => [t, DRIVER_TYPE_LABELS[t]] as const)} />
        <Select id="status" label="Status" value={v.status || "active"} errors={e.status}
          options={DRIVER_STATUSES.map((s) => [s, DRIVER_STATUS_LABELS[s]] as const)} />
        <FormField id="hireDate" label="Hire date" type="date" defaultValue={v.hireDate} errors={e.hireDate} />
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">License &amp; medical</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_6rem]">
          <FormField id="cdlNumber" label="CDL number" autoCapitalize="characters" defaultValue={v.cdlNumber} errors={e.cdlNumber} />
          <Select id="cdlState" label="CDL state" value={v.cdlState} errors={e.cdlState} empty="—"
            options={US_STATES.map(([c]) => [c, c] as const)} />
          <Select id="cdlClass" label="Class" value={v.cdlClass} errors={e.cdlClass} empty="—"
            options={CDL_CLASSES.map((c) => [c, c] as const)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="cdlExpiresOn" label="CDL expires" type="date" defaultValue={v.cdlExpiresOn} errors={e.cdlExpiresOn} />
          <FormField id="medicalCardExpiresOn" label="Medical card expires" type="date"
            defaultValue={v.medicalCardExpiresOn} errors={e.medicalCardExpiresOn} />
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select id="defaultTruckId" label="Default truck" value={v.defaultTruckId} errors={e.defaultTruckId} empty="None"
          options={trucks.map((t) => [t.id, t.unitNumber] as const)} />
        <Select id="defaultTrailerId" label="Default trailer" value={v.defaultTrailerId} errors={e.defaultTrailerId} empty="None"
          options={trailers.map((t) => [t.id, t.unitNumber] as const)} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Picking this driver on a load fills in the truck and trailer.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="emergencyContactName" label="Emergency contact" defaultValue={v.emergencyContactName}
          errors={e.emergencyContactName} />
        <FormField id="emergencyContactPhone" label="Emergency contact phone" type="tel"
          defaultValue={v.emergencyContactPhone} errors={e.emergencyContactPhone} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={v.notes} />
      </div>
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">{driver ? "Save changes" : "Add driver"}</SubmitButton>
        <Link href={driver ? `/drivers/${driver.id}` : "/drivers"} className={buttonVariants({ variant: "outline" })}>Cancel</Link>
      </div>
    </form>
  );
}
