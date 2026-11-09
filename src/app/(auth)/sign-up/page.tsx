import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignUpForm } from "@/modules/accounts/components/sign-up-form";

export const metadata = { title: "Create account · Fleet Manage Pro" };

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>We&apos;ll email you a link to confirm your address.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/sign-up">, "searchParams">) {
  const { next, email } = await searchParams;
  return (
    <SignUpForm
      next={typeof next === "string" ? next : undefined}
      email={typeof email === "string" ? email : undefined}
    />
  );
}
