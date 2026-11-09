import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { DriverStatus } from "./labels";

export type Driver = Tables<"drivers">;
export type DriverWithTruck = Driver & { default_truck: { id: string; unit_number: string } | null };
export type DriverPayRule = Tables<"driver_pay_rules">;

const WITH_TRUCK = "*, default_truck:trucks!drivers_organization_id_default_truck_id_fkey ( id, unit_number )";

export async function listDrivers(
  organizationId: string,
  filter: { status?: DriverStatus; includeArchived?: boolean } = {},
): Promise<DriverWithTruck[]> {
  const supabase = await createClient();
  let q = supabase.from("drivers").select(WITH_TRUCK).eq("organization_id", organizationId);
  if (filter.status) q = q.eq("status", filter.status);
  if (!filter.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q.order("last_name").order("first_name");
  if (error) {
    console.error("listDrivers failed", { organizationId, error });
    throw new Error("Could not load drivers.");
  }
  return (data ?? []) as DriverWithTruck[];
}

export async function getDriver(organizationId: string, id: string): Promise<DriverWithTruck | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers").select(WITH_TRUCK).eq("organization_id", organizationId).eq("id", id).maybeSingle();
  if (error) {
    console.error("getDriver failed", { id, error });
    throw new Error("Could not load this driver.");
  }
  return data as DriverWithTruck | null;
}

/** Pay history, newest first. Returns [] for roles that may not see pay (RLS). */
export async function listPayRules(organizationId: string, driverId: string): Promise<DriverPayRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("driver_pay_rules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("listPayRules failed", { driverId, error });
    throw new Error("Could not load pay rules.");
  }
  return data ?? [];
}

/** Drivers whose default truck is this one (two for a team). Empty for viewers (RLS). */
export async function listDriversForTruck(organizationId: string, truckId: string): Promise<Driver[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("default_truck_id", truckId)
    .is("archived_at", null)
    .order("last_name");
  if (error) {
    console.error("listDriversForTruck failed", { truckId, error });
    throw new Error("Could not load drivers for this truck.");
  }
  return data ?? [];
}

/** Trucks a driver can be assigned to by default: not archived, not sold. */
export async function listAssignableTrucks(organizationId: string, includeId?: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trucks")
    .select("id, unit_number, status, archived_at")
    .eq("organization_id", organizationId);
  if (error) {
    console.error("listAssignableTrucks failed", { error });
    throw new Error("Could not load trucks.");
  }
  const collator = new Intl.Collator("en-US", { numeric: true });
  return (data ?? [])
    .filter((t) => t.id === includeId || (!t.archived_at && t.status !== "sold"))
    .sort((a, b) => collator.compare(a.unit_number, b.unit_number))
    .map((t) => ({ id: t.id, unitNumber: t.unit_number }));
}
