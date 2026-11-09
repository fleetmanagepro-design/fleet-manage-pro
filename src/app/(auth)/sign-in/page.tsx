import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "@/modules/accounts/components/sign-in-form";

export const metadata = { title: "Sign in · Fleet Manage Pro" };

const NOTICES: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Sign in, or request a new link.",
};

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { next, error } = await searchParams;
  return (
    <SignInForm
      next={typeof next === "string" ? next : undefined}
      notice={typeof error === "string" ? NOTICES[error] : undefined}
    />
  );
}
