import "server-only";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { sortRoles, type RoleDef } from "./permissions";
import type { CatalogEntry } from "./roles";

export type RoleRow = RoleDef & { description: string | null; memberCount: number };

/** The organization's roles (built-in first) with how many members have each. */
export async function listRoles(organizationId: string): Promise<RoleRow[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: assigned, error: assignedError }] = await Promise.all([
    supabase.from("org_roles").select("id, system_key, name, description, permissions").eq("organization_id", organizationId),
    supabase.from("member_roles").select("role_id").eq("organization_id", organizationId),
  ]);
  if (error || assignedError) {
    console.error("listRoles failed", { organizationId, error: error ?? assignedError });
    throw new Error("Could not load roles.");
  }
  const counts = new Map<string, number>();
  for (const a of assigned ?? []) counts.set(a.role_id, (counts.get(a.role_id) ?? 0) + 1);
  return sortRoles(
    (data ?? []).map((r) => ({
      id: r.id,
      key: r.system_key,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      memberCount: counts.get(r.id) ?? 0,
    })),
  );
}

/** The permission catalog, in display order (only keys this version of the app knows). */
export async function permissionCatalog(): Promise<CatalogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permissions")
    .select("key, area, label, description, requires")
    .order("sort_order");
  if (error) {
    console.error("permissionCatalog failed", { error });
    throw new Error("Could not load permissions.");
  }
  const known = (k: string): k is Permission => (PERMISSIONS as readonly string[]).includes(k);
  return (data ?? []).flatMap((p) =>
    known(p.key) ? [{ key: p.key, area: p.area, label: p.label, description: p.description, requires: p.requires.filter(known) }] : [],
  );
}

export type MemberRow = {
  userId: string;
  email: string;
  name: string | null;
  roleIds: string[];
  isOwner: boolean;
  joinedAt: string;
};

export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_organization_members", { p_org: organizationId });
  if (error) {
    console.error("listMembers failed", { organizationId, error });
    throw new Error("Could not load members.");
  }
  return (data ?? []).map((m) => ({
    userId: m.user_id,
    email: m.email,
    name: [m.first_name, m.last_name].filter(Boolean).join(" ") || null,
    roleIds: m.role_ids,
    isOwner: m.is_owner,
    joinedAt: m.joined_at,
  }));
}

export type InvitationRow = {
  id: string;
  email: string;
  roleIds: string[];
  expiresAt: string;
  createdAt: string;
  expired: boolean;
};

/** Open (not yet accepted) invitations, including expired ones so they can be revoked. */
export async function listOpenInvitations(organizationId: string): Promise<InvitationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role_ids, expires_at, created_at")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listOpenInvitations failed", { organizationId, error });
    throw new Error("Could not load invitations.");
  }
  const now = Date.now();
  return (data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    roleIds: i.role_ids,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
    expired: new Date(i.expires_at).getTime() <= now,
  }));
}

export type InvitationPreview = {
  organizationName: string;
  roleNames: string[];
  email: string;
  status: "pending" | "accepted" | "expired";
};

export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invitation_preview", { p_token: token });
  if (error) {
    console.error("getInvitationPreview failed", { error });
    throw new Error("Could not load this invitation.");
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    organizationName: row.organization_name,
    roleNames: row.role_names,
    email: row.email,
    status: row.status as InvitationPreview["status"],
  };
}
