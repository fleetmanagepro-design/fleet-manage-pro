"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import { formatCents } from "@/lib/money";
import { US_STATES } from "@/lib/us";
import { createTrailer, createTruck, updateTrailer, updateTruck } from "../actions";
import {
  ASSET_STATUSES,
  INSPECTION_VALIDITY_MONTHS,
  OWNERSHIP_LABELS,
  OWNERSHIP_TYPES,
  STATUS_LABELS,
  TRAILER_TYPE_LABELS,
  TRAILER_TYPES,
} from "../labels";
import type { Trailer, Truck } from "../queries";

type Errors = Record<string, string[] | undefined>;

/** Form values: what the user just submitted, else the saved record. */
function initialValues(
  submitted: Record<string, string> | undefined,
  saved: Record<string, string | number | null> | undefined,
): Record<string, string> {
  if (submitted) return submitted;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(saved ?? {})) out[k] = v === null || v === undefined ? "" : String(v);
  return out;
}

function SelectField({ id, label, value, options, errors, allowEmpty }: {
  id: string; label: string; value?: string; options: readonly (readonly [string, string])[]; errors?: string[]; allowEmpty?: boolean;
}) {
  return (
    <FormField id={id} label={label} errors={errors}>
      <NativeSelect id={id} name={id} defaultValue={value ?? ""} className="w-full" aria-invalid={errors ? true : undefined}>
        {allowEmpty && <NativeSelectOption value="">—</NativeSelectOption>}
        {options.map(([v, l]) => (
          <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>
        ))}
      </NativeSelect>
    </FormField>
  );
}

const STATE_OPTIONS = US_STATES.map(([code]) => [code, code] as const);
const OWNERSHIP_OPTIONS = OWNERSHIP_TYPES.map((o) => [o, OWNERSHIP_LABELS[o]] as const);
const VALIDITY_OPTIONS = INSPECTION_VALIDITY_MONTHS.map((m) => [String(m), `${m} months`] as const);
const STATUS_OPTIONS = ASSET_STATUSES.filter((s) => s !== "sold").map((s) => [s, STATUS_LABELS[s]] as const);

function CommonFields({ v, e }: { v: Record<string, string>; e: Errors }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="plate" label="Plate" defaultValue={v.plate} errors={e.plate} />
        <SelectField id="plateState" label="Plate state" value={v.plateState} options={STATE_OPTIONS} errors={e.plateState} allowEmpty />
        <SelectField id="ownership" label="Ownership" value={v.ownership || "owned"} options={OWNERSHIP_OPTIONS} errors={e.ownership} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="purchaseDate" label="Purchase date" type="date" defaultValue={v.purchaseDate} errors={e.purchaseDate} />
        <FormField id="purchasePriceCents" label="Purchase price (USD)" inputMode="decimal" placeholder="85,000.00"
          defaultValue={v.purchasePriceCents} errors={e.purchasePriceCents} />
      </div>
    </>
  );
}

function ComplianceFields({ v, e, insurance }: { v: Record<string, string>; e: Errors; insurance: boolean }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">Compliance dates</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="registrationExpiresOn" label="Registration expires" type="date"
          defaultValue={v.registrationExpiresOn} errors={e.registrationExpiresOn} />
        {insurance && (
          <FormField id="insuranceExpiresOn" label="Insurance expires" type="date"
            defaultValue={v.insuranceExpiresOn} errors={e.insuranceExpiresOn} />
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="annualInspectionOn" label="Last inspection" type="date"
          defaultValue={v.annualInspectionOn} errors={e.annualInspectionOn} />
        <SelectField id="inspectionValidMonths" label="Inspection valid for" value={v.inspectionValidMonths || "12"}
          options={VALIDITY_OPTIONS} errors={e.inspectionValidMonths} />
      </div>
    </fieldset>
  );
}

function NotesField({ v, e }: { v: Record<string, string>; e: Errors }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="notes">Notes</Label>
      <Textarea id="notes" name="notes" defaultValue={v.notes} rows={3} aria-invalid={e.notes ? true : undefined} />
      {e.notes && <p className="text-xs text-destructive">{e.notes[0]}</p>}
    </div>
  );
}

function truckToForm(t: Truck) {
  return {
    unitNumber: t.unit_number, vin: t.vin, year: t.year, make: t.make, model: t.model,
    plate: t.plate, plateState: t.plate_state, ownership: t.ownership, purchaseDate: t.purchase_date,
    purchasePriceCents: t.purchase_price_cents === null ? null : formatCents(t.purchase_price_cents).replace("$", ""),
    status: t.status, registrationExpiresOn: t.registration_expires_on, annualInspectionOn: t.annual_inspection_on,
    inspectionValidMonths: t.annual_inspection_valid_months, insuranceExpiresOn: t.insurance_expires_on, notes: t.notes,
  };
}

function trailerToForm(t: Trailer) {
  return {
    unitNumber: t.unit_number, vin: t.vin, year: t.year, make: t.make, trailerType: t.trailer_type,
    lengthFt: t.length_ft, plate: t.plate, plateState: t.plate_state, ownership: t.ownership,
    purchaseDate: t.purchase_date,
    purchasePriceCents: t.purchase_price_cents === null ? null : formatCents(t.purchase_price_cents).replace("$", ""),
    status: t.status, registrationExpiresOn: t.registration_expires_on, annualInspectionOn: t.annual_inspection_on,
    inspectionValidMonths: t.annual_inspection_valid_months, notes: t.notes,
  };
}

export function TruckForm({ truck }: { truck?: Truck }) {
  const [state, action] = useActionState(truck ? updateTruck : createTruck, initialActionState);
  const e = state.fieldErrors ?? {};
  const v = initialValues(state.values, truck ? truckToForm(truck) : undefined);
  const cancel = truck ? `/trucks/${truck.id}` : "/trucks";
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      {truck && <input type="hidden" name="id" value={truck.id} />}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <FormField id="unitNumber" label="Unit #" required defaultValue={v.unitNumber} errors={e.unitNumber} />
        <FormField id="vin" label="VIN" required autoCapitalize="characters" maxLength={20} defaultValue={v.vin} errors={e.vin} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="year" label="Year" inputMode="numeric" defaultValue={v.year} errors={e.year} />
        <FormField id="make" label="Make" defaultValue={v.make} errors={e.make} placeholder="Freightliner" />
        <FormField id="model" label="Model" defaultValue={v.model} errors={e.model} placeholder="Cascadia" />
      </div>
      <CommonFields v={v} e={e} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField id="status" label="Status" value={v.status || "active"} options={STATUS_OPTIONS} errors={e.status} />
        {!truck && (
          <FormField id="currentOdometer" label="Current odometer (mi)" inputMode="decimal"
            defaultValue={v.currentOdometer} errors={e.currentOdometer} hint="Later readings can only go up." />
        )}
      </div>
      <ComplianceFields v={v} e={e} insurance />
      <NotesField v={v} e={e} />
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">{truck ? "Save changes" : "Add truck"}</SubmitButton>
        <Link href={cancel} className={buttonVariants({ variant: "outline" })}>Cancel</Link>
      </div>
    </form>
  );
}

export function TrailerForm({ trailer }: { trailer?: Trailer }) {
  const [state, action] = useActionState(trailer ? updateTrailer : createTrailer, initialActionState);
  const e = state.fieldErrors ?? {};
  const v = initialValues(state.values, trailer ? trailerToForm(trailer) : undefined);
  const [type, setType] = useState(v.trailerType || "dry_van");
  const cancel = trailer ? `/trailers/${trailer.id}` : "/trailers";
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      {trailer && <input type="hidden" name="id" value={trailer.id} />}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <FormField id="unitNumber" label="Unit #" required defaultValue={v.unitNumber} errors={e.unitNumber} />
        <FormField id="vin" label="VIN (optional)" autoCapitalize="characters" maxLength={20} defaultValue={v.vin} errors={e.vin} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <FormField id="trailerType" label="Type" errors={e.trailerType}>
          <NativeSelect id="trailerType" name="trailerType" defaultValue={v.trailerType || "dry_van"} onChange={(ev) => setType(ev.target.value)} className="w-full">
            {TRAILER_TYPES.map((t) => (
              <NativeSelectOption key={t} value={t}>{TRAILER_TYPE_LABELS[t]}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="lengthFt" label="Length (ft)" inputMode="numeric" defaultValue={v.lengthFt || (trailer ? "" : "53")} errors={e.lengthFt} />
        <FormField id="year" label="Year" inputMode="numeric" defaultValue={v.year} errors={e.year} />
        <FormField id="make" label="Make" defaultValue={v.make} errors={e.make} placeholder="Utility" />
      </div>
      <CommonFields v={v} e={e} />
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField id="status" label="Status" value={v.status || "active"} options={STATUS_OPTIONS} errors={e.status} />
        {!trailer && (
          <FormField id="hubodometer" label="Hubodometer (mi, optional)" inputMode="decimal"
            defaultValue={v.hubodometer} errors={e.hubodometer} />
        )}
        {!trailer && type === "reefer" && (
          <FormField id="reeferHours" label="Reefer hours (optional)" inputMode="decimal"
            defaultValue={v.reeferHours} errors={e.reeferHours} />
        )}
      </div>
      <ComplianceFields v={v} e={e} insurance={false} />
      <NotesField v={v} e={e} />
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">{trailer ? "Save changes" : "Add trailer"}</SubmitButton>
        <Link href={cancel} className={buttonVariants({ variant: "outline" })}>Cancel</Link>
      </div>
    </form>
  );
}
