"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { initialActionState } from "@/lib/action-state";
import { signUp } from "../actions";

export function SignUpForm({ next, email }: { next?: string; email?: string }) {
  const [state, action] = useActionState(signUp, initialActionState);
  const e = state.fieldErrors ?? {};
  if (state.status === "success") {
    return <FormMessage state={state} />;
  }
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="firstName" label="First name" autoComplete="given-name" required
          defaultValue={state.values?.firstName} errors={e.firstName} />
        <FormField id="lastName" label="Last name" autoComplete="family-name" required
          defaultValue={state.values?.lastName} errors={e.lastName} />
      </div>
      <FormField id="email" label="Work email" type="email" autoComplete="email" required
        defaultValue={state.values?.email ?? email} errors={e.email} />
      <FormField id="password" label="Password" type="password" autoComplete="new-password" required
        errors={e.password} hint="At least 8 characters." />
      <SubmitButton className="w-full" pendingLabel="Creating account…">Create account</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"} className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
