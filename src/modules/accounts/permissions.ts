import type { Database } from "@/lib/supabase/database.types";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export const ORG_ROLES = [
  "owner",
  "admin",
  "dispatcher",
  "maintenance",
  "accounting",
  "viewer",
] as const satisfies readonly OrgRole[];

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  dispatcher: "Dispatcher",
  maintenance: "Maintenance",
  accounting: "Accounting",
  viewer: "Viewer",
};

/** Org settings and users: owner and admin only (DATABASE_SCHEMA.md §5). */
export function canManageMembers(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

/** Roles an actor may assign. Only an owner may grant owner (PRODUCT_SPEC.md §4.1). */
export function assignableRoles(actor: OrgRole): OrgRole[] {
  if (actor === "owner") return [...ORG_ROLES];
  if (actor === "admin") return ORG_ROLES.filter((r) => r !== "owner");
  return [];
}

/** Whether `actor` may change or remove a member who currently has `target`. */
export function canManageMember(actor: OrgRole, target: OrgRole): boolean {
  if (!canManageMembers(actor)) return false;
  return target !== "owner" || actor === "owner";
}
