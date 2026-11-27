import { describe, expect, it } from "vitest";
import { toPermissionSet } from "@/lib/permissions";
import { availableMoves, canEditLoads, canOverrideOverlap } from "@/modules/dispatch/status";

const tos = (s: Parameters<typeof availableMoves>[0]) => availableMoves(s).map((m) => `${m.to}${m.needsReason ? "*" : ""}`);

describe("availableMoves", () => {
  it("allows forward moves freely and back moves with a reason", () => {
    expect(tos("planned")).toEqual(["dispatched", "at_pickup", "in_transit", "delivered", "cancelled*"]);
    expect(tos("in_transit")).toEqual(["delivered", "at_pickup*", "dispatched*", "planned*", "cancelled*"]);
  });

  it("doesn't cancel delivered loads directly and reactivates cancelled ones with a reason", () => {
    expect(tos("delivered")).toEqual(["in_transit*", "at_pickup*", "dispatched*", "planned*"]);
    expect(tos("cancelled")).toEqual(["planned*"]);
  });

  it("offers nothing for invoiced or paid until invoicing exists", () => {
    expect(availableMoves("invoiced")).toEqual([]);
    expect(availableMoves("paid")).toEqual([]);
  });
});

describe("dispatch permissions", () => {
  it("editing loads and overriding overlaps are separate permissions", () => {
    const dispatcher = toPermissionSet(["loads.view", "loads.edit"]);
    expect(canEditLoads(dispatcher)).toBe(true);
    expect(canEditLoads(toPermissionSet(["loads.view"]))).toBe(false);
    expect(canOverrideOverlap(toPermissionSet(["loads.edit", "loads.override"]))).toBe(true);
    expect(canOverrideOverlap(dispatcher)).toBe(false);
  });
});
