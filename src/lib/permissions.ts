/**
 * Permission keys — the same catalog as the `permissions` table (migration 0009b, PRODUCT_SPEC.md §4.1).
 * The database decides with has_permission(); the app reads my_permissions() to show and hide things.
 */
export const PERMISSIONS = [
  "members.manage",
  "company.manage",
  "loads.view",
  "loads.edit",
  "loads.override",
  "customers.view",
  "customers.edit",
  "fleet.view",
  "fleet.edit",
  "fleet.status",
  "fleet.sell",
  "fleet.correct_readings",
  "drivers.view",
  "drivers.edit",
  "pay.view",
  "pay.edit",
  "pay.finalize",
  "documents.add",
  "documents.remove",
  "dashboard.pay",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type PermissionSet = ReadonlySet<Permission>;

const KNOWN = new Set<string>(PERMISSIONS);

/** Keys from the database, keeping only those this version of the app knows. */
export function toPermissionSet(keys: readonly string[] | null | undefined): PermissionSet {
  return new Set((keys ?? []).filter((k): k is Permission => KNOWN.has(k)));
}

/** True if the set holds any of `wanted` (one key, or a list meaning "any of these"). */
export function hasAny(perms: PermissionSet, wanted: Permission | readonly Permission[]): boolean {
  return typeof wanted === "string" ? perms.has(wanted) : wanted.some((p) => perms.has(p));
}

/** True if `perms` holds every key in `keys`. */
export function hasAll(perms: PermissionSet, keys: readonly string[]): boolean {
  return keys.every((k) => perms.has(k as Permission));
}
