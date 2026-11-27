import type { Permission } from "@/lib/permissions";

/** One entry of the permission catalog (the `permissions` table, 0009b). */
export type CatalogEntry = {
  key: Permission;
  area: string;
  label: string;
  description: string | null;
  requires: readonly Permission[];
};

/**
 * Tick or untick a permission on a role. Ticking also ticks what it needs (editing pay needs seeing pay);
 * unticking also unticks what needs it. Mirrors the "needs" rule the database enforces (org_roles_validate).
 */
export function togglePermission(
  selected: ReadonlySet<Permission>,
  key: Permission,
  on: boolean,
  catalog: readonly CatalogEntry[],
): Set<Permission> {
  const next = new Set(selected);
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  if (on) {
    const stack: Permission[] = [key];
    while (stack.length) {
      const k = stack.pop()!;
      if (next.has(k) && k !== key) continue;
      next.add(k);
      stack.push(...(byKey.get(k)?.requires ?? []));
    }
  } else {
    const stack: Permission[] = [key];
    while (stack.length) {
      const k = stack.pop()!;
      next.delete(k);
      for (const c of catalog) if (c.requires.includes(k) && next.has(c.key)) stack.push(c.key);
    }
  }
  return next;
}

/** The first permission whose needs aren't ticked, with what it needs; null when the set is complete. */
export function missingRequirement(
  selected: ReadonlySet<Permission>,
  catalog: readonly CatalogEntry[],
): { permission: CatalogEntry; needs: CatalogEntry } | null {
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  for (const c of catalog) {
    if (!selected.has(c.key)) continue;
    const need = c.requires.find((r) => !selected.has(r));
    if (need) return { permission: c, needs: byKey.get(need)! };
  }
  return null;
}

/** Catalog entries grouped by area, keeping catalog order. */
export function groupByArea(catalog: readonly CatalogEntry[]): { area: string; entries: CatalogEntry[] }[] {
  const groups: { area: string; entries: CatalogEntry[] }[] = [];
  for (const c of catalog) {
    const g = groups.find((x) => x.area === c.area);
    if (g) g.entries.push(c);
    else groups.push({ area: c.area, entries: [c] });
  }
  return groups;
}
