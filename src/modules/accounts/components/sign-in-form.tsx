"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { initialActionState } from "@/lib/action-state";
import { signIn } from "../actions";

export function SignInForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState(signIn, initialActionState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      {notice && state.status === "idle" && (
        <FormMessage state={{ status: "error", message: notice }} />
      )}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField id="email" label="Email" type="email" autoComplete="email" required
        defaultValue={state.values?.email} errors={e.email} />
      <FormField id="password" label="Password" type="password" autoComplete="current-password" required
        errors={e.password} />
      <SubmitButton className="w-full" pendingLabel="Signing in…">Sign in</SubmitButton>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:underline">
          Forgot password?
        </Link>
        <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"} className="font-medium hover:underline">
          Create an account
        </Link>
      </div>
    </form>
  );
}
