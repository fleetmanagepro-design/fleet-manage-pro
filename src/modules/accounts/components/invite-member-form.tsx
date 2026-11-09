"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/action-state";
import { inviteMember } from "../actions";
import { ROLE_LABELS, type OrgRole } from "../permissions";

export function InviteMemberForm({ roles }: { roles: OrgRole[] }) {
  const [state, action] = useActionState(inviteMember, initialActionState);
  const e = state.fieldErrors ?? {};
  const link = state.status === "success" ? state.data?.inviteLink : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      {link && (
        <div className="grid gap-1.5">
          <label htmlFor="invite-link" className="text-xs text-muted-foreground">
            Invite link (valid for 7 days, shown only once)
          </label>
          <Input id="invite-link" readOnly value={link} onFocus={(ev) => ev.currentTarget.select()} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <FormField id="email" label="Email" type="email" autoComplete="off" required
          key={state.status === "success" ? state.message : "form"}
          defaultValue={state.status === "error" ? state.values?.email : undefined} errors={e.email} />
        <FormField id="role" label="Role" errors={e.role}>
          <NativeSelect id="role" name="role" defaultValue={state.values?.role ?? "dispatcher"} className="w-full">
            {roles.map((r) => (
              <NativeSelectOption key={r} value={r}>{ROLE_LABELS[r]}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <SubmitButton pendingLabel="Sending…">Send invite</SubmitButton>
      </div>
    </form>
  );
}
