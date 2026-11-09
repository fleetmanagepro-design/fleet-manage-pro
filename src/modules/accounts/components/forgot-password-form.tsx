"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { initialActionState } from "@/lib/action-state";
import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initialActionState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      {state.status !== "success" && (
        <>
          <FormField id="email" label="Email" type="email" autoComplete="email" required
            defaultValue={state.values?.email} errors={state.fieldErrors?.email} />
          <SubmitButton className="w-full" pendingLabel="Sending…">Send reset link</SubmitButton>
        </>
      )}
      <Link href="/sign-in" className="text-center text-sm text-muted-foreground hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
