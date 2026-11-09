"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/action-state";
import { changeMemberRole, removeMember, revokeInvitation } from "../actions";
import { ROLE_LABELS, type OrgRole } from "../permissions";

function InlineError({ message }: { message?: string }) {
  return message ? <p role="alert" className="text-xs text-destructive">{message}</p> : null;
}

export function ChangeRoleForm({ userId, role, roles, label }: { userId: string; role: OrgRole; roles: OrgRole[]; label: string }) {
  const [state, action] = useActionState(changeMemberRole, initialActionState);
  return (
    <form action={action} className="grid gap-1">
      <div className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <NativeSelect name="role" defaultValue={role} size="sm" className="min-w-32" aria-label={`Role for ${label}`}>
          {roles.map((r) => (
            <NativeSelectOption key={r} value={r}>{ROLE_LABELS[r]}</NativeSelectOption>
          ))}
        </NativeSelect>
        <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">Save</SubmitButton>
      </div>
      <InlineError message={state.status === "error" ? state.message : undefined} />
    </form>
  );
}

export function RemoveMemberForm({ userId, label, isSelf }: { userId: string; label: string; isSelf: boolean }) {
  const [state, action] = useActionState(removeMember, initialActionState);
  return (
    <form
      action={action}
      className="grid justify-items-end gap-1"
      onSubmit={(ev) => {
        const question = isSelf ? "Leave this organization?" : `Remove ${label} from this organization?`;
        if (!window.confirm(question)) ev.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton size="sm" variant="destructive" pendingLabel="Removing…" aria-label={isSelf ? "Leave organization" : `Remove ${label}`}>
        {isSelf ? "Leave" : "Remove"}
      </SubmitButton>
      <InlineError message={state.status === "error" ? state.message : undefined} />
    </form>
  );
}

export function RevokeInvitationForm({ invitationId, email }: { invitationId: string; email: string }) {
  const [state, action] = useActionState(revokeInvitation, initialActionState);
  return (
    <form action={action} className="grid justify-items-end gap-1">
      <input type="hidden" name="invitationId" value={invitationId} />
      <SubmitButton size="sm" variant="outline" pendingLabel="Revoking…" aria-label={`Revoke invitation for ${email}`}>
        Revoke
      </SubmitButton>
      <InlineError message={state.status === "error" ? state.message : undefined} />
    </form>
  );
}
