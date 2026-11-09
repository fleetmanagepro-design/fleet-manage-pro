import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/modules/accounts/permissions";

/** Cookie holding the organization the user is working in. Always re-validated. */
export const ACTIVE_ORG_COOKIE = "fmp_active_org";

export type Membership = {
  organizationId: string;
  organizationName: string;
  /** IANA time zone used to display dates for this organization. */
  timezone: string;
  role: OrgRole;
};

export type SessionContext = {
  user: User;
  memberships: Membership[];
  /** null when the user belongs to no organization yet. */
  active: Membership | null;
};

/**
 * The signed-in user, their memberships and the active organization.
 * Memberships are read through RLS on every request, so removing a member
 * revokes access immediately, whatever the cookie says.
 * Cached per request.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  // Session data is per request; tell Next before supabase-js reads the clock.
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations ( name, timezone )")
    .eq("user_id", user.id);

  if (error) {
    console.error("getSessionContext: failed to load memberships", { userId: user.id, error });
    throw new Error("Could not load your organizations. Please try again.");
  }

  const memberships: Membership[] = (data ?? [])
    .map((m) => ({
      organizationId: m.organization_id,
      organizationName: m.organizations?.name ?? "",
      timezone: m.organizations?.timezone ?? "America/Chicago",
      role: m.role,
    }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName));

  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const active =
    memberships.find((m) => m.organizationId === preferred) ?? memberships[0] ?? null;

  return { user, memberships, active };
});

/** For pages: signed-in user, or redirect to sign-in. */
export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  return ctx;
}

export type OrgContext = SessionContext & { active: Membership };

/** For pages inside the app: signed-in user with an active organization. */
export async function requireOrg(): Promise<OrgContext> {
  const ctx = await requireUser();
  if (!ctx.active) redirect("/onboarding");
  return ctx as OrgContext;
}

/** For pages: active organization and one of `roles`, else 404 (don't reveal the page). */
export async function requireOrgRole(roles: readonly OrgRole[]): Promise<OrgContext> {
  const ctx = await requireOrg();
  if (!roles.includes(ctx.active.role)) notFound();
  return ctx;
}

/**
 * For server actions: the active organization if the user holds one of
 * `roles`, otherwise null. Actions return an error instead of redirecting.
 * RLS enforces the same rule again in the database.
 */
export async function authorizeAction(roles?: readonly OrgRole[]): Promise<OrgContext | null> {
  const ctx = await getSessionContext();
  if (!ctx?.active) return null;
  if (roles && !roles.includes(ctx.active.role)) return null;
  return ctx as OrgContext;
}
