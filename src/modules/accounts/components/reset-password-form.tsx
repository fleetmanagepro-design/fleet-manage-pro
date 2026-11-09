"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { initialActionState } from "@/lib/action-state";
import { resetPassword } from "../actions";

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPassword, initialActionState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <FormField id="password" label="New password" type="password" autoComplete="new-password" required
        errors={e.password} hint="At least 8 characters." />
      <FormField id="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" required
        errors={e.confirmPassword} />
      <SubmitButton className="w-full" pendingLabel="Saving…">Save new password</SubmitButton>
    </form>
  );
}
