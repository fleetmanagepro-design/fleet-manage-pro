import { describe, expect, it } from "vitest";
import { ORG_ROLES, assignableRoles, canManageMember, canManageMembers } from "@/modules/accounts/permissions";

describe("account permissions", () => {
  it("only owners and admins manage members", () => {
    expect(ORG_ROLES.filter(canManageMembers)).toEqual(["owner", "admin"]);
  });

  it("only an owner can assign the owner role", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("admin")).toHaveLength(5);
    for (const role of ["dispatcher", "maintenance", "accounting", "viewer"] as const) {
      expect(assignableRoles(role)).toEqual([]);
    }
  });

  it("an admin cannot manage an owner; an owner can", () => {
    expect(canManageMember("admin", "owner")).toBe(false);
    expect(canManageMember("admin", "dispatcher")).toBe(true);
    expect(canManageMember("owner", "owner")).toBe(true);
    expect(canManageMember("dispatcher", "viewer")).toBe(false);
  });
});
