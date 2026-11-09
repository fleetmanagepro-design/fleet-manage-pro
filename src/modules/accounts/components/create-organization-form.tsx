"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/action-state";
import { US_STATES, US_TIME_ZONES } from "@/lib/us";
import { createOrganization } from "../actions";

export function CreateOrganizationForm() {
  const [state, action] = useActionState(createOrganization, initialActionState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <FormField id="name" label="Company name" required autoComplete="organization"
        defaultValue={v.name} errors={e.name} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="usdotNumber" label="USDOT number" inputMode="numeric" defaultValue={v.usdotNumber}
          errors={e.usdotNumber} />
        <FormField id="mcNumber" label="MC number (optional)" inputMode="numeric" defaultValue={v.mcNumber}
          errors={e.mcNumber} />
      </div>
      <FormField id="addressLine1" label="Street address" autoComplete="address-line1"
        defaultValue={v.addressLine1} errors={e.addressLine1} />
      <div className="grid grid-cols-[1fr_7rem_7rem] gap-3">
        <FormField id="city" label="City" autoComplete="address-level2" defaultValue={v.city} errors={e.city} />
        <FormField id="state" label="State" errors={e.state}>
          <NativeSelect id="state" name="state" defaultValue={v.state ?? ""} className="w-full"
            aria-invalid={e.state ? true : undefined}>
            <NativeSelectOption value="">—</NativeSelectOption>
            {US_STATES.map(([code]) => (
              <NativeSelectOption key={code} value={code}>{code}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="zip" label="ZIP" inputMode="numeric" autoComplete="postal-code" defaultValue={v.zip}
          errors={e.zip} />
      </div>
      <FormField id="timezone" label="Time zone" errors={e.timezone}
        hint="Dates and times in the app are shown in this time zone.">
        <NativeSelect id="timezone" name="timezone" defaultValue={v.timezone ?? "America/Chicago"} className="w-full">
          {US_TIME_ZONES.map((tz) => (
            <NativeSelectOption key={tz.value} value={tz.value}>{tz.label}</NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>
      <SubmitButton className="w-full" pendingLabel="Creating…">Create organization</SubmitButton>
    </form>
  );
}
