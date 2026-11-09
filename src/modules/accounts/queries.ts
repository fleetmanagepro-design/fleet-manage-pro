import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "./permissions";

export type MemberRow = {
  userId: string;
  email: string;
  name: string | null;
  role: OrgRole;
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
    role: m.role,
    joinedAt: m.joined_at,
  }));
}

export type InvitationRow = {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
};

/** Open (not yet accepted) invitations, including expired ones so they can be revoked. */
export async function listOpenInvitations(organizationId: string): Promise<InvitationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, expires_at, created_at")
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
    role: i.role,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
    expired: new Date(i.expires_at).getTime() <= now,
  }));
}

export type InvitationPreview = {
  organizationName: string;
  role: OrgRole;
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
    role: row.role,
    email: row.email,
    status: row.status as InvitationPreview["status"],
  };
}
