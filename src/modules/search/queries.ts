import "server-only";
import { createClient } from "@/lib/supabase/server";
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/modules/dispatch/labels";
import { type SearchHit, matchesAll, searchWords } from "./search";

const LIMIT = 8;

type LoadRow = {
  id: string; load_number: string; status: LoadStatus; customer_reference: string | null; created_at: string;
  customer: { name: string } | null;
  stops: { sequence: number; stop_type: string; city: string; state: string; reference_number: string | null }[];
};

function loadHit(l: LoadRow): SearchHit {
  const stops = [...l.stops].sort((a, b) => a.sequence - b.sequence);
  const from = stops.find((s) => s.stop_type === "pickup");
  const to = stops.findLast((s) => s.stop_type === "delivery");
  const route = [from, to].filter(Boolean).map((s) => `${s!.city}, ${s!.state}`).join(" → ");
  const pu = stops.find((s) => s.reference_number)?.reference_number;
  return {
    kind: "load", id: l.id, href: `/loads/${l.id}`, title: `Load ${l.load_number}`,
    subtitle: [LOAD_STATUS_LABELS[l.status], l.customer?.name, route, pu && `PU# ${pu}`, l.customer_reference && `Ref ${l.customer_reference}`]
      .filter(Boolean).join(" · "),
  };
}

/**
 * Everything matching `term` in the organization, as the signed-in user (RLS decides what each role finds).
 * `term` must come from searchTerm(), which makes it safe inside PostgREST filters.
 */
export async function globalSearch(organizationId: string, term: string): Promise<SearchHit[]> {
  const supabase = await createClient();
  const like = `%${term}%`;
  const words = searchWords(term);
  const first = `%${words[0]}%`;
  const LOAD_SELECT = `id, load_number, status, customer_reference, created_at,
    customer:customers!loads_organization_id_customer_id_fkey ( name ),
    stops:load_stops ( sequence, stop_type, city, state, reference_number )`;

  const [loadsDirect, stopHits, drivers, trucks, trailers, customers] = await Promise.all([
    supabase.from("loads").select(LOAD_SELECT).eq("organization_id", organizationId)
      .or(`load_number.ilike.${like},customer_reference.ilike.${like}`).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("load_stops").select("load_id").eq("organization_id", organizationId)
      .or(`reference_number.ilike.${like},city.ilike.${like}`).limit(40),
    supabase.from("drivers").select("id, first_name, last_name, phone, cdl_number, status, archived_at").eq("organization_id", organizationId)
      .or(`first_name.ilike.${first},last_name.ilike.${first},phone.ilike.${like},cdl_number.ilike.${like}`).limit(40),
    supabase.from("trucks").select("id, unit_number, vin, plate, year, make, model").eq("organization_id", organizationId)
      .is("archived_at", null).or(`unit_number.ilike.${like},vin.ilike.${like},plate.ilike.${like}`).limit(LIMIT),
    supabase.from("trailers").select("id, unit_number, vin, plate, trailer_type").eq("organization_id", organizationId)
      .is("archived_at", null).or(`unit_number.ilike.${like},vin.ilike.${like},plate.ilike.${like}`).limit(LIMIT),
    supabase.from("customers").select("id, name, mc_number, customer_type").eq("organization_id", organizationId)
      .is("archived_at", null).or(`name.ilike.${like},mc_number.ilike.${like}`).limit(LIMIT),
  ]);
  for (const r of [loadsDirect, stopHits, drivers, trucks, trailers, customers]) {
    if (r.error) {
      console.error("globalSearch failed", { error: r.error });
      throw new Error("Search failed.");
    }
  }

  // Loads found through a stop (pickup #, city), not already found directly.
  const found = new Set((loadsDirect.data ?? []).map((l) => l.id));
  const viaStops = [...new Set((stopHits.data ?? []).map((s) => s.load_id))].filter((id) => !found.has(id)).slice(0, LIMIT);
  const moreLoads = viaStops.length
    ? await supabase.from("loads").select(LOAD_SELECT).eq("organization_id", organizationId).in("id", viaStops)
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (moreLoads.error) {
    console.error("globalSearch loads via stops failed", { error: moreLoads.error });
    throw new Error("Search failed.");
  }
  const loads = [...((loadsDirect.data ?? []) as unknown as LoadRow[]), ...((moreLoads.data ?? []) as unknown as LoadRow[])];

  const hits: SearchHit[] = loads.map(loadHit);
  for (const d of drivers.data ?? []) {
    const name = `${d.first_name} ${d.last_name}`;
    if (!matchesAll(`${name} ${d.phone ?? ""} ${d.cdl_number ?? ""}`, words)) continue;
    hits.push({
      kind: "driver", id: d.id, href: `/drivers/${d.id}`, title: name,
      subtitle: [d.archived_at ? "Archived" : d.status, d.phone].filter(Boolean).join(" · "),
    });
  }
  for (const t of trucks.data ?? []) {
    hits.push({ kind: "truck", id: t.id, href: `/trucks/${t.id}`, title: `Truck ${t.unit_number}`,
      subtitle: [[t.year, t.make, t.model].filter(Boolean).join(" "), t.plate, t.vin].filter(Boolean).join(" · ") });
  }
  for (const t of trailers.data ?? []) {
    hits.push({ kind: "trailer", id: t.id, href: `/trailers/${t.id}`, title: `Trailer ${t.unit_number}`,
      subtitle: [t.trailer_type.replace("_", " "), t.plate, t.vin].filter(Boolean).join(" · ") });
  }
  for (const c of customers.data ?? []) {
    hits.push({ kind: "customer", id: c.id, href: `/customers/${c.id}`, title: c.name,
      subtitle: [c.customer_type.replace("_", " "), c.mc_number && `MC ${c.mc_number}`].filter(Boolean).join(" · ") });
  }
  return hits;
}
