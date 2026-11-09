import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/submit-button";
import type { Membership } from "@/lib/auth";
import { switchOrganization } from "../actions";

/** Shown only when the user belongs to more than one organization. */
export function OrganizationSwitcher({ memberships, activeId }: { memberships: Membership[]; activeId: string }) {
  if (memberships.length < 2) return null;
  return (
    <form action={switchOrganization} className="flex items-center gap-2">
      <NativeSelect name="organizationId" defaultValue={activeId} size="sm" aria-label="Organization" className="w-full">
        {memberships.map((m) => (
          <NativeSelectOption key={m.organizationId} value={m.organizationId}>{m.organizationName}</NativeSelectOption>
        ))}
      </NativeSelect>
      <SubmitButton size="sm" variant="outline">Switch</SubmitButton>
    </form>
  );
}
