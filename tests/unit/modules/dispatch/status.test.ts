import { describe, expect, it } from "vitest";
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
  it("owner, admin and dispatcher edit; only owner/admin override overlaps", () => {
    expect(canEditLoads("dispatcher")).toBe(true);
    expect(canEditLoads("accounting")).toBe(false);
    expect(canOverrideOverlap("admin")).toBe(true);
    expect(canOverrideOverlap("dispatcher")).toBe(false);
  });
});
