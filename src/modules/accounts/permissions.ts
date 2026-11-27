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

/** A role of the organization: built-in (`key` set) or made by the company (`key` null). */
export type RoleDef = {
  id: string;
  key: OrgRole | null;
  name: string;
  description?: string | null;
  permissions: readonly string[];
};

/** Who is acting: their permissions, and whether they are an owner (only owners grant ownership). */
export type Actor = { permissions: PermissionSet; isOwner: boolean };

/** Everything a role allows; Owner allows the whole catalog. */
export function rolePermissions(role: Pick<RoleDef, "key" | "permissions">): readonly string[] {
  return role.key === "owner" ? PERMISSIONS : role.permissions;
}

export const canManageMembers = (p: PermissionSet) => p.has("members.manage");

/**
 * May `actor` give these roles together? They need "manage members and roles" and every permission the
 * roles allow; only an owner can give Owner (PRODUCT_SPEC.md §4.1). Mirrors can_grant_roles() in 0009c.
 */
export function canGrantRoles(actor: Actor, roles: readonly Pick<RoleDef, "key" | "permissions">[]): boolean {
  if (!canManageMembers(actor.permissions)) return false;
  if (roles.some((r) => r.key === "owner") && !actor.isOwner) return false;
  return roles.every((r) => hasAll(actor.permissions, rolePermissions(r)));
}

export const canGrantRole = (actor: Actor, role: Pick<RoleDef, "key" | "permissions">) => canGrantRoles(actor, [role]);

/** The roles `actor` may give. */
export function assignableRoles<T extends Pick<RoleDef, "key" | "permissions">>(actor: Actor, roles: readonly T[]): T[] {
  return roles.filter((r) => canGrantRole(actor, r));
}

/** May `actor` change or remove a member who has `memberRoles`? Only if they could give all of them. */
export const canManageMember = canGrantRoles;

/** Built-in roles first, in the app's order; then the company's roles by name. */
export function sortRoles<T extends { key: OrgRole | null; name: string }>(roles: readonly T[]): T[] {
  const rank = (r: T) => (r.key ? ORG_ROLES.indexOf(r.key) : ORG_ROLES.length);
  return [...roles].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
