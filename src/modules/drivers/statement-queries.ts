import "server-only";
import { addDays } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { zonedLocalToUtc } from "@/lib/zoned-time";
import { loadRevenueCents } from "@/modules/dispatch/calculations";
import {
  type Statement, type StatementLoad, buildStatement, carriedIn, hasWeekActivity, isInWeek, loadPayDay,
} from "./calculations";
import { ruleInEffect } from "./pay-rules";

export type DriverStatementRow = Tables<"driver_statements">;
export type DriverStatementLine = Tables<"driver_statement_lines">;
type DriverLite = Pick<Tables<"drivers">, "id" | "first_name" | "last_name" | "driver_type" | "status" | "archived_at">;

export type WeekRow = {
  driver: DriverLite;
  draft: Statement;
  /** The live (not voided) finalized statement for this week, if any. */
  finalized: DriverStatementRow | null;
  /** A later week is already finalized: this week can no longer be finalized. */
  laterFinalized: boolean;
};

function fail(what: string, error: unknown): never {
  console.error(`[statements] ${what} failed`, { error });
  throw new Error("Could not load pay statements.");
}

type WeekLoad = {
  id: string; load_number: string; status: StatementLoad["status"]; linehaul_cents: number; fuel_surcharge_cents: number;
  loaded_miles: number | null; deadhead_miles: number | null; delivered_at: string | null;
  stops: { stop_type: string; sequence: number; appointment_start: string | null; city: string; state: string }[];
  drivers: { driver_id: string }[];
  accessorials: { type: string; amount_cents: number; billable_to_customer: boolean }[];
};

function route(stops: WeekLoad["stops"]): string {
  const sorted = [...stops].sort((a, b) => a.sequence - b.sequence);
  const from = sorted.find((s) => s.stop_type === "pickup");
  const to = sorted.findLast((s) => s.stop_type === "delivery");
  return [from, to].filter(Boolean).map((s) => `${s!.city}, ${s!.state}`).join(" → ") || "No stops";
}

/**
 * Everything needed to compute the week's statements, for every driver or one.
 * Loads are found by first pickup (or delivery when there's no appointment) in the company time zone.
 */
async function weekRows(organizationId: string, weekStart: string, timeZone: string, driverId?: string): Promise<WeekRow[]> {
  const supabase = await createClient();
  const from = zonedLocalToUtc(`${weekStart}T00:00`, timeZone);
  const to = zonedLocalToUtc(`${addDays(weekStart, 7)}T00:00`, timeZone);

  const [byPickup, byDelivery] = await Promise.all([
    supabase.from("load_stops").select("load_id").eq("organization_id", organizationId).eq("stop_type", "pickup")
      .gte("appointment_start", from).lt("appointment_start", to),
    supabase.from("loads").select("id").eq("organization_id", organizationId).gte("delivered_at", from).lt("delivered_at", to),
  ]);
  if (byPickup.error) fail("pickups", byPickup.error);
  if (byDelivery.error) fail("deliveries", byDelivery.error);
  const candidateIds = [...new Set([...(byPickup.data ?? []).map((r) => r.load_id), ...(byDelivery.data ?? []).map((r) => r.id)])];

  let driversQ = supabase.from("drivers").select("id, first_name, last_name, driver_type, status, archived_at")
    .eq("organization_id", organizationId);
  let rulesQ = supabase.from("driver_pay_rules").select("*").eq("organization_id", organizationId);
  let dedQ = supabase.from("driver_deductions").select("*").eq("organization_id", organizationId);
  let stQ = supabase.from("driver_statements").select("*").eq("organization_id", organizationId).is("voided_at", null);
  if (driverId) {
    driversQ = driversQ.eq("id", driverId);
    rulesQ = rulesQ.eq("driver_id", driverId);
    dedQ = dedQ.eq("driver_id", driverId);
    stQ = stQ.eq("driver_id", driverId);
  }
  const [loadsRes, driversRes, rulesRes, dedRes, stRes, itemsRes] = await Promise.all([
    candidateIds.length
      ? supabase.from("loads").select(`id, load_number, status, linehaul_cents, fuel_surcharge_cents, loaded_miles, deadhead_miles, delivered_at,
          stops:load_stops ( stop_type, sequence, appointment_start, city, state ),
          drivers:load_drivers ( driver_id ),
          accessorials:load_accessorials ( type, amount_cents, billable_to_customer )`)
        .eq("organization_id", organizationId).in("id", candidateIds).neq("status", "cancelled")
      : Promise.resolve({ data: [], error: null }),
    driversQ.order("last_name").order("first_name"),
    rulesQ,
    dedQ,
    stQ,
    candidateIds.length
      ? supabase.from("load_driver_items").select("load_id, driver_id, description, amount_cents, created_at")
        .eq("organization_id", organizationId).in("load_id", candidateIds).order("created_at")
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [what, r] of [["loads", loadsRes], ["drivers", driversRes], ["rules", rulesRes], ["deductions", dedRes], ["statements", stRes], ["extras", itemsRes]] as const) {
    if (r.error) fail(what, r.error);
  }

  const loads = ((loadsRes.data ?? []) as unknown as WeekLoad[])
    .map((l) => ({ l, day: loadPayDay(l.stops, l.delivered_at, timeZone) }))
    .filter((x): x is { l: WeekLoad; day: string } => x.day !== null && isInWeek(x.day, weekStart))
    .sort((a, b) => a.day.localeCompare(b.day) || a.l.load_number.localeCompare(b.l.load_number));
  const rules = rulesRes.data ?? [];
  const deductions = dedRes.data ?? [];
  const statements = stRes.data ?? [];
  const items = itemsRes.data ?? [];

  const rows: WeekRow[] = [];
  for (const driver of driversRes.data ?? []) {
    const mine = statements.filter((s) => s.driver_id === driver.id);
    const finalized = mine.find((s) => s.week_start === weekStart) ?? null;
    const previous = mine.filter((s) => s.week_start < weekStart).sort((a, b) => b.week_start.localeCompare(a.week_start))[0];
    const driverRules = rules.filter((r) => r.driver_id === driver.id);
    const draft = buildStatement({
      weekStart,
      loads: loads.filter(({ l }) => l.drivers.some((d) => d.driver_id === driver.id)).map(({ l, day }) => ({
        loadId: l.id,
        loadNumber: l.load_number,
        status: l.status,
        route: route(l.stops),
        valueCents: loadRevenueCents(l, l.accessorials),
        loaded_miles: l.loaded_miles,
        deadhead_miles: l.deadhead_miles,
        rule: ruleInEffect(driverRules, day),
        extras: items.filter((i) => i.load_id === l.id && i.driver_id === driver.id)
          .map((i) => ({ description: i.description, amountCents: i.amount_cents })),
      })),
      deductions: deductions.filter((d) => d.driver_id === driver.id).map((d) => ({
        ...d, percent: d.percent === null ? null : Number(d.percent), free_miles: d.free_miles === null ? null : Number(d.free_miles),
      })),
      carriedInCents: carriedIn(previous?.net_cents),
    });
    const hasLoads = draft.loadCount + draft.pending.length + draft.missingRule.length > 0;
    const current = driver.status === "active" && driver.archived_at === null;
    if (driverId || finalized || hasLoads || (current && hasWeekActivity(draft))) {
      rows.push({ driver, draft, finalized, laterFinalized: mine.some((s) => s.week_start > weekStart) });
    }
  }
  return rows;
}

export const listWeekStatements = (organizationId: string, weekStart: string, timeZone: string) =>
  weekRows(organizationId, weekStart, timeZone);

export type DriverWeekStatement = WeekRow & {
  lines: DriverStatementLine[];
  voided: DriverStatementRow[];
};

/** One driver's week: the live draft, the finalized snapshot (with lines) if any, and voided ones. */
export async function getDriverWeekStatement(
  organizationId: string, driverId: string, weekStart: string, timeZone: string,
): Promise<DriverWeekStatement | null> {
  const [row] = await weekRows(organizationId, weekStart, timeZone, driverId);
  if (!row) return null;
  const supabase = await createClient();
  const [voidedRes, linesRes] = await Promise.all([
    supabase.from("driver_statements").select("*").eq("organization_id", organizationId).eq("driver_id", driverId)
      .eq("week_start", weekStart).not("voided_at", "is", null).order("voided_at", { ascending: false }),
    row.finalized
      ? supabase.from("driver_statement_lines").select("*").eq("organization_id", organizationId)
        .eq("statement_id", row.finalized.id).order("position")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (voidedRes.error) fail("voided", voidedRes.error);
  if (linesRes.error) fail("lines", linesRes.error);
  return { ...row, lines: linesRes.data ?? [], voided: voidedRes.data ?? [] };
}

/** A driver's finalized and voided statements, newest week first (driver page). */
export async function listDriverStatements(organizationId: string, driverId: string, limit = 12): Promise<DriverStatementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("driver_statements").select("*")
    .eq("organization_id", organizationId).eq("driver_id", driverId)
    .order("week_start", { ascending: false }).order("finalized_at", { ascending: false }).limit(limit);
  if (error) fail("driver statements", error);
  return data ?? [];
}
