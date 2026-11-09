import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { AssetStatus } from "./labels";

export type Truck = Tables<"trucks">;
export type Trailer = Tables<"trailers">;
export type MeterReading = Tables<"odometer_readings">;

export type AssetFilter = { status?: AssetStatus; includeArchived?: boolean };

export async function listTrucks(organizationId: string, filter: AssetFilter = {}): Promise<Truck[]> {
  const supabase = await createClient();
  let q = supabase.from("trucks").select("*").eq("organization_id", organizationId);
  if (filter.status) q = q.eq("status", filter.status);
  if (!filter.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q.order("unit_number");
  if (error) {
    console.error("listTrucks failed", { organizationId, error });
    throw new Error("Could not load trucks.");
  }
  return sortByUnit(data ?? []);
}

export async function listTrailers(organizationId: string, filter: AssetFilter = {}): Promise<Trailer[]> {
  const supabase = await createClient();
  let q = supabase.from("trailers").select("*").eq("organization_id", organizationId);
  if (filter.status) q = q.eq("status", filter.status);
  if (!filter.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q.order("unit_number");
  if (error) {
    console.error("listTrailers failed", { organizationId, error });
    throw new Error("Could not load trailers.");
  }
  return sortByUnit(data ?? []);
}

export async function getTruck(organizationId: string, id: string): Promise<Truck | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trucks").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  if (error) {
    console.error("getTruck failed", { id, error });
    throw new Error("Could not load this truck.");
  }
  return data;
}

export async function getTrailer(organizationId: string, id: string): Promise<Trailer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trailers").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  if (error) {
    console.error("getTrailer failed", { id, error });
    throw new Error("Could not load this trailer.");
  }
  return data;
}

export async function listReadings(
  organizationId: string,
  asset: { truckId: string } | { trailerId: string },
  limit = 20,
): Promise<MeterReading[]> {
  const supabase = await createClient();
  let q = supabase.from("odometer_readings").select("*").eq("organization_id", organizationId);
  q = "truckId" in asset ? q.eq("truck_id", asset.truckId) : q.eq("trailer_id", asset.trailerId);
  const { data, error } = await q
    .order("read_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listReadings failed", { asset, error });
    throw new Error("Could not load readings.");
  }
  return data ?? [];
}

/** Natural order: 2, 10, 101 rather than 10, 101, 2. */
function sortByUnit<T extends { unit_number: string }>(rows: T[]): T[] {
  const collator = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => collator.compare(a.unit_number, b.unit_number));
}
