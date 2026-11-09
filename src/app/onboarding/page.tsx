import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { CreateOrganizationForm } from "@/modules/accounts/components/create-organization-form";

export const metadata = { title: "Create organization · Fleet Manage Pro" };

export default function OnboardingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <p className="text-lg font-semibold tracking-tight">Fleet Manage Pro</p>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Set up your company</CardTitle>
          <CardDescription>
            You&apos;ll be the owner. You can invite your team right after. If your company already uses
            Fleet Manage Pro, ask an owner or admin to invite you instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <CreateOrganizationForm />
          <Suspense>
            <BackLink />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function BackLink() {
  const ctx = await requireUser();
  if (!ctx.active) return null;
  return (
    <Link href="/dashboard" className="text-center text-sm text-muted-foreground hover:underline">
      Back to {ctx.active.organizationName}
    </Link>
  );
}
