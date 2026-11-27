import { describe, expect, it } from "vitest";
import { PERMISSIONS, hasAll, hasAny, toPermissionSet } from "@/lib/permissions";
import {
  ORG_ROLES,
  assignableRoles,
  canGrantRole,
  canGrantRoles,
  canManageMember,
  canManageMembers,
  rolePermissions,
  sortRoles,
  type Actor,
  type RoleDef,
} from "@/modules/accounts/permissions";

// Built-in roles as 0009b creates them (a subset is enough for these rules).
const ALL_BUT_OWNER = PERMISSIONS;
const ROLES: RoleDef[] = [
  { id: "owner", key: "owner", name: "Owner", permissions: [] },
  { id: "admin", key: "admin", name: "Admin", permissions: ALL_BUT_OWNER },
  { id: "fleet_director", key: "fleet_director", name: "Fleet Director", permissions: ["members.manage", "loads.view", "loads.edit", "pay.view"] },
  { id: "fleet_manager", key: "fleet_manager", name: "Fleet Manager", permissions: ["loads.view", "loads.edit"] },
  { id: "viewer", key: "viewer", name: "Viewer", permissions: ["loads.view"] },
];
const role = (key: RoleDef["key"]) => ROLES.find((r) => r.key === key)!;
const actor = (key: RoleDef["key"]): Actor => ({ permissions: toPermissionSet(rolePermissions(role(key))), isOwner: key === "owner" });

describe("permission sets", () => {
  it("ignores keys the app doesn't know", () => {
    expect([...toPermissionSet(["loads.view", "future.thing"])]).toEqual(["loads.view"]);
    expect(toPermissionSet(null).size).toBe(0);
  });

  it("hasAny takes one key or a list; hasAll needs every key", () => {
    const p = toPermissionSet(["fleet.status"]);
    expect(hasAny(p, "fleet.status")).toBe(true);
    expect(hasAny(p, ["fleet.edit", "fleet.status"])).toBe(true);
    expect(hasAny(p, ["fleet.edit"])).toBe(false);
    expect(hasAll(p, [])).toBe(true);
    expect(hasAll(p, ["fleet.status", "fleet.edit"])).toBe(false);
  });
});

describe("member management", () => {
  it("needs manage members and roles", () => {
    expect(canManageMembers(actor("fleet_director").permissions)).toBe(true);
    expect(canManageMembers(actor("fleet_manager").permissions)).toBe(false);
    expect(assignableRoles(actor("fleet_manager"), ROLES)).toEqual([]);
  });

  it("only an owner can give the owner role", () => {
    expect(canGrantRole(actor("owner"), role("owner"))).toBe(true);
    expect(canGrantRole(actor("admin"), role("owner"))).toBe(false);
    expect(assignableRoles(actor("admin"), ROLES).map((r) => r.key)).toEqual(["admin", "fleet_director", "fleet_manager", "viewer"]);
  });

  it("nobody gives a role with permissions they don't have", () => {
    expect(canGrantRole(actor("fleet_director"), role("admin"))).toBe(false);
    expect(canGrantRole(actor("fleet_director"), role("fleet_director"))).toBe(true);
    expect(assignableRoles(actor("fleet_director"), ROLES).map((r) => r.key)).toEqual(["fleet_director", "fleet_manager", "viewer"]);
  });

  it("several roles at once need every permission of each", () => {
    const custom: RoleDef = { id: "c", key: null, name: "Payroll", permissions: ["pay.view", "drivers.view"] };
    expect(canGrantRoles(actor("fleet_director"), [role("fleet_manager"), role("viewer")])).toBe(true);
    expect(canGrantRoles(actor("fleet_director"), [role("fleet_manager"), custom])).toBe(false);
    expect(canGrantRoles(actor("admin"), [role("fleet_manager"), custom])).toBe(true);
    expect(canManageMember(actor("fleet_director"), [role("admin")])).toBe(false);
  });

  it("the owner role allows the whole catalog", () => {
    expect(rolePermissions(role("owner"))).toEqual(PERMISSIONS);
  });

  it("lists roles in the app's order", () => {
    const zed: RoleDef = { id: "z", key: null, name: "Zed", permissions: [] };
    const alpha: RoleDef = { id: "a", key: null, name: "Alpha", permissions: [] };
    expect(sortRoles([zed, role("viewer"), alpha, role("owner"), role("fleet_manager")]).map((r) => r.name))
      .toEqual(["Owner", "Fleet Manager", "Viewer", "Alpha", "Zed"]);
    expect(ORG_ROLES).toHaveLength(8);
  });
});
