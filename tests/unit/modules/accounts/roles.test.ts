import { describe, expect, it } from "vitest";
import type { Permission } from "@/lib/permissions";
import { groupByArea, missingRequirement, togglePermission, type CatalogEntry } from "@/modules/accounts/roles";

// The part of the catalog (0009b) these rules touch.
const entry = (key: Permission, area: string, requires: Permission[] = []): CatalogEntry => ({ key, area, label: key, description: null, requires });
const CATALOG: CatalogEntry[] = [
  entry("loads.view", "Loads"),
  entry("loads.edit", "Loads", ["loads.view"]),
  entry("loads.override", "Loads", ["loads.edit"]),
  entry("drivers.view", "Drivers"),
  entry("pay.view", "Driver pay", ["drivers.view"]),
  entry("pay.edit", "Driver pay", ["pay.view"]),
  entry("dashboard.pay", "Dashboard", ["pay.view"]),
];
const set = (...k: Permission[]) => new Set<Permission>(k);
const sorted = (s: Set<Permission>) => [...s].sort();

describe("ticking permissions on a role", () => {
  it("ticking one also ticks everything it needs, all the way down", () => {
    expect(sorted(togglePermission(set(), "loads.override", true, CATALOG))).toEqual(["loads.edit", "loads.override", "loads.view"]);
    expect(sorted(togglePermission(set(), "pay.edit", true, CATALOG))).toEqual(["drivers.view", "pay.edit", "pay.view"]);
  });

  it("unticking one also unticks everything that needs it", () => {
    const all = set("drivers.view", "pay.view", "pay.edit", "dashboard.pay", "loads.view");
    expect(sorted(togglePermission(all, "drivers.view", false, CATALOG))).toEqual(["loads.view"]);
    expect(sorted(togglePermission(all, "pay.edit", false, CATALOG))).toEqual(["dashboard.pay", "drivers.view", "loads.view", "pay.view"]);
  });

  it("doesn't change the set it was given", () => {
    const before = set("loads.view");
    togglePermission(before, "loads.edit", true, CATALOG);
    expect(sorted(before)).toEqual(["loads.view"]);
  });

  it("reports the first permission whose needs are missing", () => {
    expect(missingRequirement(set("loads.view", "loads.edit"), CATALOG)).toBeNull();
    const m = missingRequirement(set("pay.view"), CATALOG);
    expect(m?.permission.key).toBe("pay.view");
    expect(m?.needs.key).toBe("drivers.view");
  });

  it("groups the catalog by area in catalog order", () => {
    expect(groupByArea(CATALOG).map((g) => [g.area, g.entries.length])).toEqual([
      ["Loads", 3], ["Drivers", 1], ["Driver pay", 2], ["Dashboard", 1],
    ]);
  });
});
