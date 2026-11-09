import Link from "next/link";
import { Suspense } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth";
import { AcceptInvitationForm } from "@/modules/accounts/components/accept-invitation-form";
import { ROLE_LABELS } from "@/modules/accounts/permissions";
import { getInvitationPreview } from "@/modules/accounts/queries";

export const metadata = { title: "Invitation · Fleet Manage Pro" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <p className="text-lg font-semibold tracking-tight">Fleet Manage Pro</p>
      <Card className="w-full max-w-md">
        <Suspense fallback={<CardContent>Loading invitation…</CardContent>}>
          <Invitation params={params} />
        </Suspense>
      </Card>
    </main>
  );
}

async function Invitation({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  const here = `/invite/${encodeURIComponent(token)}`;
  const ctx = await getSessionContext();

  if (!ctx) {
    return (
      <>
        <CardHeader>
          <CardTitle>You&apos;ve been invited</CardTitle>
          <CardDescription>
            Sign in or create an account with the email address the invitation was sent to.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Link href={`/sign-up?next=${encodeURIComponent(here)}`} className={buttonVariants()}>
            Create an account
          </Link>
          <Link href={`/sign-in?next=${encodeURIComponent(here)}`} className={buttonVariants({ variant: "outline" })}>
            I already have an account
          </Link>
        </CardContent>
      </>
    );
  }

  const invitation = await getInvitationPreview(token);
  if (!invitation || invitation.status !== "pending") {
    const reason = !invitation
      ? "This invitation link is not valid."
      : invitation.status === "expired"
        ? "This invitation has expired. Ask the person who invited you to send a new one."
        : "This invitation has already been used.";
    return (
      <>
        <CardHeader>
          <CardTitle>Invitation unavailable</CardTitle>
          <CardDescription>{reason}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Go to dashboard</Link>
        </CardContent>
      </>
    );
  }

  const signedInAs = ctx.user.email?.toLowerCase();
  const wrongAccount = signedInAs !== invitation.email;

  return (
    <>
      <CardHeader>
        <CardTitle>Join {invitation.organizationName}</CardTitle>
        <CardDescription>
          You&apos;ve been invited as <strong>{ROLE_LABELS[invitation.role]}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {wrongAccount ? (
          <Alert variant="destructive">
            <AlertDescription>
              This invitation was sent to {invitation.email}, but you&apos;re signed in as {signedInAs}. Sign out and
              sign in with the invited email address.
            </AlertDescription>
          </Alert>
        ) : (
          <AcceptInvitationForm token={token} organizationName={invitation.organizationName} />
        )}
      </CardContent>
    </>
  );
}
