import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sortRoles, type OrgRole } from "@/modules/accounts/permissions";
import { hasAny, toPermissionSet, type Permission, type PermissionSet } from "@/lib/permissions";

/** Cookie holding the organization the user is working in. Always re-validated. */
export const ACTIVE_ORG_COOKIE = "fmp_active_org";

export type Membership = {
  organizationId: string;
  organizationName: string;
  /** IANA time zone used to display dates for this organization. */
  timezone: string;
  /** Names of the member's roles here, in the app's order (custom roles last). */
  roleNames: string[];
  /** Holds the Owner role (only owners make owners). */
  isOwner: boolean;
};

/** The organization the user is working in, with what they may do there. */
export type ActiveMembership = Membership & { permissions: PermissionSet };

export type SessionContext = {
  user: User;
  memberships: Membership[];
  /** null when the user belongs to no organization yet. */
  active: ActiveMembership | null;
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

  const [{ data, error }, { data: roleRows, error: rolesError }] = await Promise.all([
    supabase.from("organization_members").select("organization_id, organizations ( name, timezone )").eq("user_id", user.id),
    supabase.from("member_roles").select("organization_id, org_roles ( name, system_key )").eq("user_id", user.id),
  ]);

  if (error || rolesError) {
    console.error("getSessionContext: failed to load memberships", { userId: user.id, error: error ?? rolesError });
    throw new Error("Could not load your organizations. Please try again.");
  }

  const rolesByOrg = new Map<string, { name: string; key: OrgRole | null }[]>();
  for (const r of roleRows ?? []) {
    if (!r.org_roles) continue;
    const list = rolesByOrg.get(r.organization_id) ?? [];
    list.push({ name: r.org_roles.name, key: r.org_roles.system_key });
    rolesByOrg.set(r.organization_id, list);
  }

  const memberships: Membership[] = (data ?? [])
    .map((m) => {
      const roles = sortRoles(rolesByOrg.get(m.organization_id) ?? []);
      return {
        organizationId: m.organization_id,
        organizationName: m.organizations?.name ?? "",
        timezone: m.organizations?.timezone ?? "America/Chicago",
        roleNames: roles.map((r) => r.name),
        isOwner: roles.some((r) => r.key === "owner"),
      };
    })
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName));

  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const chosen = memberships.find((m) => m.organizationId === preferred) ?? memberships[0] ?? null;
  if (!chosen) return { user, memberships, active: null };

  const { data: perms, error: permsError } = await supabase.rpc("my_permissions", { org: chosen.organizationId });
  if (permsError) {
    console.error("getSessionContext: failed to load permissions", { userId: user.id, error: permsError });
    throw new Error("Could not load your permissions. Please try again.");
  }
  return { user, memberships, active: { ...chosen, permissions: toPermissionSet(perms) } };
});

/** For pages: signed-in user, or redirect to sign-in. */
export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  return ctx;
}

export type OrgContext = SessionContext & { active: ActiveMembership };

/** For pages inside the app: signed-in user with an active organization. */
export async function requireOrg(): Promise<OrgContext> {
  const ctx = await requireUser();
  if (!ctx.active) redirect("/onboarding");
  return ctx as OrgContext;
}

/**
 * For pages: active organization and the permission (or any of a list), else 404 (don't reveal the page).
 */
export async function requirePermission(wanted: Permission | readonly Permission[]): Promise<OrgContext> {
  const ctx = await requireOrg();
  if (!hasAny(ctx.active.permissions, wanted)) notFound();
  return ctx;
}

/**
 * For server actions: the active organization if the user holds the permission (or any of a list),
 * otherwise null. Actions return an error instead of redirecting. RLS enforces the same rule again.
 */
export async function authorizeAction(wanted?: Permission | readonly Permission[]): Promise<OrgContext | null> {
  const ctx = await getSessionContext();
  if (!ctx?.active) return null;
  if (wanted && !hasAny(ctx.active.permissions, wanted)) return null;
  return ctx as OrgContext;
}
