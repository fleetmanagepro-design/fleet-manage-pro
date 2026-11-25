import "server-only";
import { addDays, formatCalendarDate } from "@/lib/dates";
import type { ExpiryState } from "@/lib/expiry";
import { createClient } from "@/lib/supabase/server";
import { zonedLocalToUtc } from "@/lib/zoned-time";
import { loadRevenueCents } from "@/modules/dispatch/calculations";
import type { LoadStatus } from "@/modules/dispatch/labels";
import { loadPayDay } from "@/modules/drivers/calculations";
import { driverCompliance } from "@/modules/drivers/compliance";
import { driverLoadPay } from "@/modules/drivers/pay";
import { ruleInEffect } from "@/modules/drivers/pay-rules";
import { DOC_TYPE_LABELS } from "@/modules/documents/rules";
import { complianceItems } from "@/modules/fleet/compliance";
import type { DeliveredLoad, Period } from "./calculations";

function fail(what: string, error: unknown): never {
  console.error(`[dashboard] ${what} failed`, { error });
  throw new Error("Could not load the dashboard.");
}

type Row = {
  id: string; load_number: string; status: LoadStatus; delivered_at: string | null;
  linehaul_cents: number; fuel_surcharge_cents: number; loaded_miles: number | null; deadhead_miles: number | null;
  truck: { id: string; unit_number: string } | null;
  stops: { stop_type: string; sequence: number; appointment_start: string | null }[];
  drivers: { driver_id: string }[];
  accessorials: { type: string; amount_cents: number; billable_to_customer: boolean }[];
};

/** Loads delivered in the period (company days), with driver pay when the viewer may see pay. */
export async function deliveredLoads(organizationId: string, period: Period, timeZone: string, withPay: boolean): Promise<DeliveredLoad[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("loads")
    .select(`id, load_number, status, delivered_at, linehaul_cents, fuel_surcharge_cents, loaded_miles, deadhead_miles,
      truck:trucks!loads_organization_id_truck_id_fkey ( id, unit_number ),
      stops:load_stops ( stop_type, sequence, appointment_start ),
      drivers:load_drivers ( driver_id ),
      accessorials:load_accessorials ( type, amount_cents, billable_to_customer )`)
    .eq("organization_id", organizationId).in("status", ["delivered", "invoiced", "paid"])
    .gte("delivered_at", zonedLocalToUtc(`${period.from}T00:00`, timeZone))
    .lt("delivered_at", zonedLocalToUtc(`${addDays(period.to, 1)}T00:00`, timeZone))
    .limit(5000);
  if (error) fail("delivered loads", error);
  const rows = (data ?? []) as unknown as Row[];

  let rules: Awaited<ReturnType<typeof payRules>> = [];
  let items: { load_id: string; driver_id: string; amount_cents: number }[] = [];
  if (withPay && rows.length) {
    const driverIds = [...new Set(rows.flatMap((r) => r.drivers.map((d) => d.driver_id)))];
    [rules, items] = await Promise.all([payRules(organizationId, driverIds), extras(organizationId, rows.map((r) => r.id))]);
  }

  return rows.map((r) => {
    const value = loadRevenueCents(r, r.accessorials);
    let pay: number | null = null;
    if (withPay) {
      const day = loadPayDay(r.stops, r.delivered_at, timeZone);
      pay = 0;
      for (const d of r.drivers) {
        const rule = day ? ruleInEffect(rules.filter((x) => x.driver_id === d.driver_id), day) : null;
        if (!rule) { pay = null; break; }
        const ex = items.filter((i) => i.load_id === r.id && i.driver_id === d.driver_id).map((i) => i.amount_cents);
        pay += driverLoadPay(rule, { valueCents: value, loaded_miles: r.loaded_miles, deadhead_miles: r.deadhead_miles }, ex).totalCents;
      }
    }
    return {
      id: r.id,
      deliveredDay: new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(r.delivered_at!)),
      valueCents: value, loaded_miles: r.loaded_miles, deadhead_miles: r.deadhead_miles, truck: r.truck, driverPayCents: pay,
    };
  });
}

async function payRules(organizationId: string, driverIds: string[]) {
  if (!driverIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("driver_pay_rules").select("*").eq("organization_id", organizationId).in("driver_id", driverIds);
  if (error) fail("pay rules", error);
  return data ?? [];
}

async function extras(organizationId: string, loadIds: string[]) {
  const supabase = await createClient();
  const out: { load_id: string; driver_id: string; amount_cents: number }[] = [];
  for (let i = 0; i < loadIds.length; i += 200) {
    const { data, error } = await supabase.from("load_driver_items").select("load_id, driver_id, amount_cents")
      .eq("organization_id", organizationId).in("load_id", loadIds.slice(i, i + 200));
    if (error) fail("driver extras", error);
    out.push(...(data ?? []));
  }
  return out;
}

export const OPEN_STATUSES = ["planned", "dispatched", "at_pickup", "in_transit"] as const satisfies readonly LoadStatus[];

export type OpenLoad = {
  id: string; load_number: string; status: LoadStatus; truck: string | null; driver: string | null; route: string;
  pickupAt: string | null; pickupTz: string | null;
};

/** Loads not delivered yet: count per status and the list (soonest pickup first). */
export async function openLoads(organizationId: string): Promise<OpenLoad[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("loads")
    .select(`id, load_number, status, truck:trucks!loads_organization_id_truck_id_fkey ( unit_number ),
      stops:load_stops ( stop_type, sequence, city, state, appointment_start, timezone ),
      drivers:load_drivers ( is_primary, driver:drivers!load_drivers_organization_id_driver_id_fkey ( first_name, last_name ) )`)
    .eq("organization_id", organizationId).in("status", OPEN_STATUSES).limit(1000);
  if (error) fail("open loads", error);
  type R = {
    id: string; load_number: string; status: LoadStatus; truck: { unit_number: string } | null;
    stops: { stop_type: string; sequence: number; city: string; state: string; appointment_start: string | null; timezone: string }[];
    drivers: { is_primary: boolean; driver: { first_name: string; last_name: string } | null }[];
  };
  return ((data ?? []) as unknown as R[]).map((l) => {
    const stops = [...l.stops].sort((a, b) => a.sequence - b.sequence);
    const pu = stops.find((s) => s.stop_type === "pickup");
    const del = stops.findLast((s) => s.stop_type === "delivery");
    const d = l.drivers.find((x) => x.is_primary)?.driver ?? l.drivers[0]?.driver;
    return {
      id: l.id, load_number: l.load_number, status: l.status, truck: l.truck?.unit_number ?? null,
      driver: d ? `${d.first_name} ${d.last_name}` : null,
      route: [pu, del].filter(Boolean).map((s) => `${s!.city}, ${s!.state}`).join(" → "),
      pickupAt: pu?.appointment_start ?? null, pickupTz: pu?.timezone ?? null,
    };
  }).sort((a, b) => (a.pickupAt ?? "9999").localeCompare(b.pickupAt ?? "9999"));
}

export type ExpiringItem = { key: string; what: string; name: string; href: string; dueOn: string; state: ExpiryState; daysLeft: number };

/** Expired or due within 30 days: CDL / medical, registration / inspection / insurance, documents. */
export async function expiringItems(organizationId: string, today: string, seeDrivers: boolean): Promise<ExpiringItem[]> {
  const supabase = await createClient();
  const [trucks, trailers, drivers, docs] = await Promise.all([
    supabase.from("trucks").select("id, unit_number, registration_expires_on, annual_inspection_on, annual_inspection_valid_months, insurance_expires_on")
      .eq("organization_id", organizationId).is("archived_at", null).neq("status", "sold"),
    supabase.from("trailers").select("id, unit_number, registration_expires_on, annual_inspection_on, annual_inspection_valid_months")
      .eq("organization_id", organizationId).is("archived_at", null).neq("status", "sold"),
    seeDrivers
      ? supabase.from("drivers").select("id, first_name, last_name, cdl_expires_on, medical_card_expires_on")
        .eq("organization_id", organizationId).is("archived_at", null).eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("documents").select("id, entity_type, driver_id, truck_id, trailer_id, doc_type, file_name, expires_on")
      .eq("organization_id", organizationId).is("archived_at", null).not("expires_on", "is", null).lte("expires_on", addDays(today, 30)),
  ]);
  for (const [w, r] of [["trucks", trucks], ["trailers", trailers], ["drivers", drivers], ["documents", docs]] as const) if (r.error) fail(w, r.error);

  const out: ExpiringItem[] = [];
  const push = (key: string, what: string, name: string, href: string, i: { dueOn: string | null; state: ExpiryState; daysLeft: number | null }) => {
    if (i.dueOn && i.daysLeft !== null && (i.state === "expired" || i.state === "due_soon")) {
      out.push({ key, what, name, href, dueOn: i.dueOn, state: i.state, daysLeft: i.daysLeft });
    }
  };
  for (const t of trucks.data ?? []) for (const i of complianceItems(t, today)) push(`t${t.id}${i.key}`, i.label, `Truck ${t.unit_number}`, `/trucks/${t.id}`, i);
  for (const t of trailers.data ?? []) for (const i of complianceItems(t, today)) push(`r${t.id}${i.key}`, i.label, `Trailer ${t.unit_number}`, `/trailers/${t.id}`, i);
  for (const d of drivers.data ?? []) {
    for (const i of driverCompliance(d, today)) push(`d${d.id}${i.key}`, i.label, `${d.first_name} ${d.last_name}`, `/drivers/${d.id}`, i);
  }
  for (const doc of docs.data ?? []) {
    if (doc.entity_type === "driver" && !seeDrivers) continue;
    const id = doc.driver_id ?? doc.truck_id ?? doc.trailer_id;
    const href = doc.entity_type === "driver" ? `/drivers/${id}` : `/${doc.entity_type}s/${id}?tab=documents`;
    const daysLeft = Math.round((Date.parse(doc.expires_on!) - Date.parse(today)) / 86_400_000);
    push(`doc${doc.id}`, `${DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type} document`, doc.file_name, href,
      { dueOn: doc.expires_on, state: daysLeft < 0 ? "expired" : "due_soon", daysLeft });
  }
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export const describeDue = (i: Pick<ExpiringItem, "state" | "daysLeft" | "dueOn">) =>
  i.state === "expired" ? `expired ${formatCalendarDate(i.dueOn)}` : i.daysLeft === 0 ? "expires today" : `in ${i.daysLeft} days`;
