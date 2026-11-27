"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { initialActionState } from "@/lib/action-state";
import { removeMember, revokeInvitation, setMemberRoles } from "../actions";
import { RoleCheckboxes, type RoleChoice } from "./role-checkboxes";

function InlineError({ message }: { message?: string }) {
  return message ? <p role="alert" className="text-xs text-destructive">{message}</p> : null;
}

/** The member's roles, with a form to change them (one or more). */
export function MemberRolesForm({ userId, label, roles, current }: { userId: string; label: string; roles: RoleChoice[]; current: string[] }) {
  const [state, action] = useActionState(setMemberRoles, initialActionState);
  const names = roles.filter((r) => current.includes(r.id)).map((r) => r.name).join(", ");
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer list-none" aria-label={`Change roles for ${label}`}>
        <span>{names || "No role"}</span>{" "}
        <span className="text-xs text-muted-foreground underline group-open:hidden">Change</span>
      </summary>
      <form action={action} className="mt-2 grid gap-2 rounded-md border p-3">
        <input type="hidden" name="userId" value={userId} />
        <fieldset className="grid gap-2">
          <legend className="sr-only">Roles for {label}</legend>
          <RoleCheckboxes roles={roles} checked={current} idPrefix={`roles-${userId}`} />
        </fieldset>
        <div>
          <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">Save roles</SubmitButton>
        </div>
      </form>
      <InlineError message={state.status === "error" ? state.message : undefined} />
    </details>
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
