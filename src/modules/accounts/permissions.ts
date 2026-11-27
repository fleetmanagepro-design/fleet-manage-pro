import type { Database } from "@/lib/supabase/database.types";
import { PERMISSIONS, hasAll, type PermissionSet } from "@/lib/permissions";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export const ORG_ROLES = [
  "owner",
  "admin",
  "fleet_director",
  "fleet_manager",
  "dispatcher",
  "maintenance",
  "accounting",
  "viewer",
] as const satisfies readonly OrgRole[];

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  fleet_director: "Fleet Director",
  fleet_manager: "Fleet Manager",
  dispatcher: "Dispatcher",
  maintenance: "Maintenance",
  accounting: "Accounting",
  viewer: "Viewer",
};

/** A built-in role as the organization has it (its permissions come from `org_roles`). */
export type RoleDef = { key: OrgRole; name: string; permissions: readonly string[] };

/** Who is acting: their permissions, and whether they are an owner (only owners grant ownership). */
export type Actor = { permissions: PermissionSet; isOwner: boolean };

/** Everything a role allows; Owner allows the whole catalog. */
export function rolePermissions(role: RoleDef): readonly string[] {
  return role.key === "owner" ? PERMISSIONS : role.permissions;
}

export const canManageMembers = (p: PermissionSet) => p.has("members.manage");

/**
 * May `actor` give this role? They need "manage members and roles" and every permission the role has;
 * only an owner can make an owner (PRODUCT_SPEC.md §4.1). Mirrors can_grant() in 0009b.
 */
export function canGrantRole(actor: Actor, role: RoleDef): boolean {
  if (!canManageMembers(actor.permissions)) return false;
  if (role.key === "owner" && !actor.isOwner) return false;
  return hasAll(actor.permissions, rolePermissions(role));
}

/** The roles `actor` may give, in catalog order. */
export function assignableRoles(actor: Actor, roles: readonly RoleDef[]): RoleDef[] {
  return roles.filter((r) => canGrantRole(actor, r));
}

/** May `actor` change or remove a member who has `target`? Only if they could give that role. */
export const canManageMember = canGrantRole;

/** Built-in roles in the order the app lists them. */
export function sortRoles<T extends { key: OrgRole }>(roles: readonly T[]): T[] {
  return [...roles].sort((a, b) => ORG_ROLES.indexOf(a.key) - ORG_ROLES.indexOf(b.key));
}
