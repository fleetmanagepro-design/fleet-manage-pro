"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { initialActionState } from "@/lib/action-state";
import { acceptInvitation } from "../actions";

export function AcceptInvitationForm({ token, organizationName }: { token: string; organizationName: string }) {
  const [state, action] = useActionState(acceptInvitation, initialActionState);
  return (
    <form action={action} className="grid gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton className="w-full" pendingLabel="Joining…">Join {organizationName}</SubmitButton>
    </form>
  );
}
