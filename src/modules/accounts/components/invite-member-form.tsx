"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { inviteMember } from "../actions";
import { RoleCheckboxes, type RoleChoice } from "./role-checkboxes";

export function InviteMemberForm({ roles, defaultRoleId }: { roles: RoleChoice[]; defaultRoleId?: string }) {
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
      <FormField id="email" label="Email" type="email" autoComplete="off" required
        key={state.status === "success" ? state.message : "form"}
        defaultValue={state.status === "error" ? state.values?.email : undefined} errors={e.email} />
      <fieldset className="grid gap-2" aria-describedby={e.roleIds?.length ? "roleIds-error" : undefined}>
        <legend className="mb-1 text-sm font-medium">Roles</legend>
        <RoleCheckboxes roles={roles} idPrefix="invite-role" key={state.status === "success" ? state.message : "roles"}
          checked={state.values?.roleIds ? state.values.roleIds.split(",") : defaultRoleId ? [defaultRoleId] : []} />
        {e.roleIds?.length ? <p id="roleIds-error" className="text-xs text-destructive">{e.roleIds[0]}</p> : null}
      </fieldset>
      <div>
        <SubmitButton pendingLabel="Sending…">Send invite</SubmitButton>
      </div>
    </form>
  );
}
