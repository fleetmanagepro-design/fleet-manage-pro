/**
 * Equipment follows the driver (decision of 11/12/2026): picking a driver fills in their default truck and
 * trailer; picking a truck first suggests its driver (and that driver's trailer). A truck or trailer the user
 * chose on purpose is kept. Pure functions used by the load form and the dispatch board.
 */

export type Assignment = { truckId: string; trailerId: string; driver1Id: string };
export type DriverDefaults = { id: string; defaultTruckId: string | null; defaultTrailerId: string | null };

/** A field "follows" the driver while it is empty or still holds the previous driver's default. */
const follows = (value: string, previousDefault: string | null | undefined) => value === "" || value === (previousDefault ?? "");

export function pickDriver(current: Assignment, driverId: string, drivers: readonly DriverDefaults[]): Assignment {
  const prev = drivers.find((d) => d.id === current.driver1Id);
  const next = drivers.find((d) => d.id === driverId);
  return {
    driver1Id: driverId,
    truckId: follows(current.truckId, prev?.defaultTruckId) ? (next?.defaultTruckId ?? "") : current.truckId,
    trailerId: follows(current.trailerId, prev?.defaultTrailerId) ? (next?.defaultTrailerId ?? "") : current.trailerId,
  };
}

/** Picking a truck with no driver yet suggests the (eligible) driver whose default truck it is. */
export function pickTruck(current: Assignment, truckId: string, eligibleDrivers: readonly DriverDefaults[]): Assignment {
  if (current.driver1Id || !truckId) return { ...current, truckId };
  const d = eligibleDrivers.find((x) => x.defaultTruckId === truckId);
  if (!d) return { ...current, truckId };
  return { truckId, driver1Id: d.id, trailerId: current.trailerId || (d.defaultTrailerId ?? "") };
}
