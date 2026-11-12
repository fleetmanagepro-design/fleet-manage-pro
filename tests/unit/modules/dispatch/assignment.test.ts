import { describe, expect, it } from "vitest";
import { type Assignment, pickDriver, pickTruck } from "@/modules/dispatch/assignment";

const drivers = [
  { id: "carter", defaultTruckId: "t101", defaultTrailerId: "r5301" },
  { id: "gonzalez", defaultTruckId: "t102", defaultTrailerId: "r5302" },
  { id: "spare", defaultTruckId: null, defaultTrailerId: null },
];
const empty: Assignment = { truckId: "", trailerId: "", driver1Id: "" };

describe("pickDriver", () => {
  it("fills the driver's truck and trailer", () => {
    expect(pickDriver(empty, "carter", drivers)).toEqual({ driver1Id: "carter", truckId: "t101", trailerId: "r5301" });
  });
  it("switching drivers swaps equipment that was only the previous driver's default", () => {
    const a = pickDriver(empty, "carter", drivers);
    expect(pickDriver(a, "gonzalez", drivers)).toEqual({ driver1Id: "gonzalez", truckId: "t102", trailerId: "r5302" });
  });
  it("keeps a truck or trailer chosen on purpose", () => {
    const chosen = { ...pickDriver(empty, "carter", drivers), trailerId: "r5399" };
    expect(pickDriver(chosen, "gonzalez", drivers)).toEqual({ driver1Id: "gonzalez", truckId: "t102", trailerId: "r5399" });
    expect(pickDriver({ truckId: "t110", trailerId: "", driver1Id: "" }, "carter", drivers).truckId).toBe("t110");
  });
  it("a driver without defaults clears the previous driver's equipment; clearing the driver too", () => {
    const a = pickDriver(empty, "carter", drivers);
    expect(pickDriver(a, "spare", drivers)).toEqual({ driver1Id: "spare", truckId: "", trailerId: "" });
    expect(pickDriver(a, "", drivers)).toEqual({ driver1Id: "", truckId: "", trailerId: "" });
  });
});

describe("pickTruck", () => {
  it("suggests the truck's driver and that driver's trailer", () => {
    expect(pickTruck(empty, "t102", drivers)).toEqual({ truckId: "t102", driver1Id: "gonzalez", trailerId: "r5302" });
  });
  it("leaves a chosen driver and trailer alone", () => {
    expect(pickTruck({ truckId: "", trailerId: "", driver1Id: "carter" }, "t102", drivers))
      .toEqual({ truckId: "t102", trailerId: "", driver1Id: "carter" });
    expect(pickTruck({ truckId: "", trailerId: "r5399", driver1Id: "" }, "t101", drivers).trailerId).toBe("r5399");
  });
  it("a truck nobody drives only sets the truck", () => {
    expect(pickTruck(empty, "t199", drivers)).toEqual({ truckId: "t199", trailerId: "", driver1Id: "" });
  });
});
