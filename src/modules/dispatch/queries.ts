import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { AssignmentCandidate } from "./overlap";
import type { LoadStatus } from "./labels";

export type LoadStop = Tables<"load_stops">;
export type LoadAccessorial = Tables<"load_accessorials">;
export type LoadEvent = Tables<"load_events">;

type Person = { id: string; first_name: string; last_name: string };

export type LoadListItem = Tables<"loads"> & {
  customer: { id: string; name: string } | null;
  truck: { id: string; unit_number: string } | null;
  stops: LoadStop[];
  drivers: { is_primary: boolean; driver: Person | null }[];
  accessorials: Pick<LoadAccessorial, "amount_cents" | "billable_to_customer">[];
};

export type LoadDetail = Omit<LoadListItem, "accessorials"> & {
  trailer: { id: string; unit_number: string } | null;
  accessorials: LoadAccessorial[];
};

const LIST_SELECT = `*,
  customer:customers!loads_organization_id_customer_id_fkey ( id, name ),
  truck:trucks!loads_organization_id_truck_id_fkey ( id, unit_number ),
  stops:load_stops ( * ),
  drivers:load_drivers ( is_primary, driver:drivers!load_drivers_organization_id_driver_id_fkey ( id, first_name, last_name ) ),
  accessorials:load_accessorials ( amount_cents, billable_to_customer )`;

export type LoadFilter = {
  status?: LoadStatus;
  customerId?: string;
  truckId?: string;
  driverId?: string;
};

function sortChildren<T extends { stops: LoadStop[]; drivers: { is_primary: boolean }[] }>(l: T): T {
  l.stops.sort((a, b) => a.sequence - b.sequence);
  l.drivers.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return l;
}

export async function listLoads(organizationId: string, filter: LoadFilter = {}, limit = 200): Promise<LoadListItem[]> {
  const supabase = await createClient();
  let loadIds: string[] | null = null;
  if (filter.driverId) {
    const { data, error } = await supabase
      .from("load_drivers").select("load_id").eq("organization_id", organizationId).eq("driver_id", filter.driverId);
    if (error) {
      console.error("listLoads drivers filter failed", { error });
      throw new Error("Could not load loads.");
    }
    loadIds = (data ?? []).map((d) => d.load_id);
    if (loadIds.length === 0) return [];
  }
  let q = supabase.from("loads").select(LIST_SELECT).eq("organization_id", organizationId);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.customerId) q = q.eq("customer_id", filter.customerId);
  if (filter.truckId) q = q.eq("truck_id", filter.truckId);
  if (loadIds) q = q.in("id", loadIds);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("load_number", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listLoads failed", { organizationId, error });
    throw new Error("Could not load loads.");
  }
  return ((data ?? []) as unknown as LoadListItem[]).map(sortChildren);
}

export async function getLoad(organizationId: string, id: string): Promise<LoadDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loads")
    .select(`${LIST_SELECT.replace("accessorials:load_accessorials ( amount_cents, billable_to_customer )", "accessorials:load_accessorials ( * )")},
      trailer:trailers!loads_organization_id_trailer_id_fkey ( id, unit_number )`)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getLoad failed", { id, error });
    throw new Error("Could not load this load.");
  }
  if (!data) return null;
  const load = sortChildren(data as unknown as LoadDetail);
  load.accessorials.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return load;
}

export async function listLoadEvents(organizationId: string, loadId: string): Promise<LoadEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("load_events").select("*").eq("organization_id", organizationId).eq("load_id", loadId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listLoadEvents failed", { loadId, error });
    throw new Error("Could not load the history.");
  }
  return data ?? [];
}

/** Open loads using this truck or these drivers, for the overlap warning. */
export async function listAssignmentCandidates(
  organizationId: string,
  truckId: string | null,
  driverIds: string[],
): Promise<AssignmentCandidate[]> {
  if (!truckId && driverIds.length === 0) return [];
  const supabase = await createClient();
  let ids = new Set<string>();
  if (driverIds.length) {
    const { data, error } = await supabase
      .from("load_drivers").select("load_id").eq("organization_id", organizationId).in("driver_id", driverIds);
    if (error) throw new Error("Could not check driver assignments.");
    ids = new Set((data ?? []).map((d) => d.load_id));
  }
  let q = supabase
    .from("loads")
    .select("id, load_number, truck_id, stops:load_stops ( appointment_start, appointment_end ), drivers:load_drivers ( driver_id )")
    .eq("organization_id", organizationId)
    .in("status", ["planned", "dispatched", "at_pickup", "in_transit"]);
  const or = [truckId ? `truck_id.eq.${truckId}` : null, ids.size ? `id.in.(${[...ids].join(",")})` : null].filter(Boolean);
  if (or.length) q = q.or(or.join(","));
  const { data, error } = await q;
  if (error) {
    console.error("listAssignmentCandidates failed", { error });
    throw new Error("Could not check assignments.");
  }
  return (data ?? []).map((l) => ({
    id: l.id,
    load_number: l.load_number,
    truck_id: l.truck_id,
    driver_ids: (l.drivers ?? []).map((d) => d.driver_id),
    stops: l.stops ?? [],
  }));
}

/** Choices for the load form. Inactive/archived options are kept when already on the load. */
export async function loadFormOptions(organizationId: string, current?: LoadDetail | null) {
  const supabase = await createClient();
  const [customers, trucks, trailers, drivers] = await Promise.all([
    supabase.from("customers").select("id, name, status, archived_at").eq("organization_id", organizationId).order("name"),
    supabase.from("trucks").select("id, unit_number, status, archived_at").eq("organization_id", organizationId),
    supabase.from("trailers").select("id, unit_number, trailer_type, status, archived_at").eq("organization_id", organizationId),
    supabase
      .from("drivers")
      .select("id, first_name, last_name, status, archived_at, cdl_expires_on, medical_card_expires_on, default_truck_id")
      .eq("organization_id", organizationId)
      .order("last_name"),
  ]);
  for (const r of [customers, trucks, trailers, drivers]) {
    if (r.error) {
      console.error("loadFormOptions failed", { error: r.error });
      throw new Error("Could not load form options.");
    }
  }
  const byUnit = new Intl.Collator("en-US", { numeric: true });
  const currentDrivers = new Set((current?.drivers ?? []).map((d) => d.driver?.id));
  return {
    customers: (customers.data ?? [])
      .filter((c) => c.id === current?.customer_id || (!c.archived_at && c.status !== "do_not_use"))
      .map((c) => ({ id: c.id, label: c.status === "inactive" ? `${c.name} (inactive)` : c.name })),
    trucks: (trucks.data ?? [])
      .filter((t) => t.id === current?.truck_id || (!t.archived_at && t.status !== "sold"))
      .sort((a, b) => byUnit.compare(a.unit_number, b.unit_number))
      .map((t) => ({ id: t.id, label: t.unit_number + (t.status === "active" ? "" : ` (${t.status.replace("_", " ")})`) })),
    trailers: (trailers.data ?? [])
      .filter((t) => t.id === current?.trailer_id || (!t.archived_at && t.status !== "sold"))
      .sort((a, b) => byUnit.compare(a.unit_number, b.unit_number))
      .map((t) => ({ id: t.id, label: `${t.unit_number} · ${t.trailer_type.replace("_", " ")}`, trailerType: t.trailer_type })),
    drivers: (drivers.data ?? [])
      .filter((d) => currentDrivers.has(d.id) || (!d.archived_at && d.status === "active"))
      .map((d) => ({
        id: d.id,
        label: `${d.first_name} ${d.last_name}`,
        defaultTruckId: d.default_truck_id,
        cdlExpiresOn: d.cdl_expires_on,
        medicalCardExpiresOn: d.medical_card_expires_on,
      })),
  };
}
export type LoadFormOptions = Awaited<ReturnType<typeof loadFormOptions>>;

export type BoardTruck = { id: string; unit_number: string; status: string; drivers: string[] };

/** Everything the dispatch board needs for the days [from, to) (UTC instants). */
export async function boardData(organizationId: string, fromIso: string, toIso: string) {
  const supabase = await createClient();
  // Loads with a stop in range (±7 days, so loads crossing the board's edges still show).
  const stopsInRange = await supabase
    .from("load_stops")
    .select("load_id")
    .eq("organization_id", organizationId)
    .gte("appointment_start", new Date(Date.parse(fromIso) - 7 * 86_400_000).toISOString())
    .lt("appointment_start", new Date(Date.parse(toIso) + 7 * 86_400_000).toISOString())
    .limit(5000);
  if (stopsInRange.error) {
    console.error("boardData stops failed", { error: stopsInRange.error });
    throw new Error("Could not load the dispatch board.");
  }
  const loadIds = [...new Set((stopsInRange.data ?? []).map((s) => s.load_id))];

  const [trucks, drivers, loads, unassigned] = await Promise.all([
    supabase.from("trucks").select("id, unit_number, status").eq("organization_id", organizationId)
      .is("archived_at", null).neq("status", "sold"),
    supabase.from("drivers").select("first_name, last_name, default_truck_id").eq("organization_id", organizationId)
      .is("archived_at", null).eq("status", "active").not("default_truck_id", "is", null),
    loadIds.length
      ? supabase.from("loads").select(LIST_SELECT).eq("organization_id", organizationId).neq("status", "cancelled")
          .not("truck_id", "is", null).in("id", loadIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("loads").select(LIST_SELECT).eq("organization_id", organizationId)
      .in("status", ["planned", "dispatched", "at_pickup", "in_transit"]).is("truck_id", null)
      .order("created_at", { ascending: false }).limit(100),
  ]);
  for (const r of [trucks, drivers, loads, unassigned]) {
    if (r.error) {
      console.error("boardData failed", { error: r.error });
      throw new Error("Could not load the dispatch board.");
    }
  }
  const byUnit = new Intl.Collator("en-US", { numeric: true });
  const driversByTruck = new Map<string, string[]>();
  for (const d of drivers.data ?? []) {
    const list = driversByTruck.get(d.default_truck_id!) ?? [];
    list.push(`${d.first_name} ${d.last_name}`);
    driversByTruck.set(d.default_truck_id!, list);
  }
  return {
    trucks: (trucks.data ?? [])
      .sort((a, b) => byUnit.compare(a.unit_number, b.unit_number))
      .map((t): BoardTruck => ({ ...t, drivers: driversByTruck.get(t.id) ?? [] })),
    loads: ((loads.data ?? []) as unknown as LoadListItem[]).map(sortChildren),
    unassigned: ((unassigned.data ?? []) as unknown as LoadListItem[]).map(sortChildren),
  };
}
