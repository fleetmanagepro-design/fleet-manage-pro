import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { requireOrg } from "@/lib/auth";
import { formatMiles } from "@/lib/miles";
import { formatCents } from "@/lib/money";
import { formatInZone, utcToZonedLocal } from "@/lib/zoned-time";
import { US_TIME_ZONES } from "@/lib/us";
import { listMembers } from "@/modules/accounts/queries";
import { emptyMilePercent, loadRevenueCents, revenuePerMileCents, totalMiles } from "@/modules/dispatch/calculations";
import { AddAccessorialForm, RemoveAccessorialButton } from "@/modules/dispatch/components/accessorials";
import { LoadStatusBadge } from "@/modules/dispatch/components/status-badge";
import { StatusPanel } from "@/modules/dispatch/components/status-panel";
import { ACCESSORIAL_LABELS, LOAD_STATUS_LABELS } from "@/modules/dispatch/labels";
import { type LoadDetail, getLoad, listLoadDriverItems, listLoadEvents, listPayRulesForDrivers } from "@/modules/dispatch/queries";
import { AddDriverItemForm, RemoveDriverItemButton } from "@/modules/dispatch/components/driver-items";
import { driverLoadPay } from "@/modules/drivers/pay";
import { describePayRule, ruleInEffect } from "@/modules/drivers/pay-rules";
import { canViewPay } from "@/modules/drivers/permissions";
import { todayIn } from "@/lib/dates";
import { canEditLoads } from "@/modules/dispatch/status";
import { DetailList, NotBuiltYet, PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";
import { TRAILER_TYPE_LABELS } from "@/modules/fleet/labels";

export const metadata = { title: "Load · Fleet Manage Pro" };

export default function LoadPage({ params }: PageProps<"/loads/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LoadDetailPage params={params} />
    </Suspense>
  );
}

async function LoadDetailPage({ params }: Pick<PageProps<"/loads/[id]">, "params">) {
  const { active } = await requireOrg();
  const id = z.uuid().safeParse((await params).id);
  const load = id.success ? await getLoad(active.organizationId, id.data) : null;
  if (!load) notFound();

  const editable = canEditLoads(active.role) && load.status !== "invoiced" && load.status !== "paid";
  const revenue = loadRevenueCents(load, load.accessorials);
  const miles = totalMiles(load);
  const rpm = revenuePerMileCents(revenue, miles);
  const emptyPct = emptyMilePercent(load);
  const tzLabel = US_TIME_ZONES.find((z) => z.value === active.timezone)?.label ?? active.timezone;
  const drivers = load.drivers.map((d) => d.driver).filter((d) => d !== null);

  return (
    <div className="grid max-w-6xl gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Link href="/loads" className="text-sm text-muted-foreground hover:underline">← Loads</Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            Load {load.load_number}
            <LoadStatusBadge status={load.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {load.customer ? (
              <Link href={`/customers/${load.customer.id}`} className="hover:underline">{load.customer.name}</Link>
            ) : "—"}
            {load.customer_reference ? ` · Ref ${load.customer_reference}` : ""}
          </p>
        </div>
        {editable && (
          <Link href={`/loads/${load.id}/edit`} className={buttonVariants({ variant: "outline" })}>Edit load</Link>
        )}
      </div>

      {load.status === "cancelled" && load.cancelled_reason && (
        <Alert variant="destructive">
          <AlertDescription>Cancelled: {load.cancelled_reason}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-5">
          <SectionCard title="Stops" description="Times are in each facility's local time.">
            <ol className="grid gap-3">
              {load.stops.map((s) => (
                <li key={s.id} className="grid gap-0.5 border-l-2 pl-3 text-sm" data-testid={`load-stop-${s.sequence}`}>
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {s.sequence}. {s.stop_type === "pickup" ? "Pickup" : "Delivery"}
                  </span>
                  <span className="font-medium">{s.facility_name ?? `${s.city}, ${s.state}`}</span>
                  <span className="text-muted-foreground">
                    {[s.address_line1, `${s.city}, ${s.state}`, s.zip].filter(Boolean).join(" · ")}
                  </span>
                  <span>
                    {s.appointment_start
                      ? `${formatInZone(s.appointment_start, s.timezone)}${s.appointment_end ? ` – ${formatInZone(s.appointment_end, s.timezone)}` : ""}`
                      : "No appointment"}
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard title="Rate & accessorials">
            <div className="grid gap-4">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell>Linehaul</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(load.linehaul_cents)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow>
                    <TableCell>Fuel surcharge</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(load.fuel_surcharge_cents)}</TableCell>
                    <TableCell />
                  </TableRow>
                  {load.accessorials.map((a) => (
                    <TableRow key={a.id} data-testid={`accessorial-${a.type}`}>
                      <TableCell>
                        {ACCESSORIAL_LABELS[a.type]}
                        {!a.billable_to_customer && a.type !== "late_penalty" && <span className="ml-2 text-xs text-muted-foreground">(not billed)</span>}
                        {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(a.type === "late_penalty" ? -a.amount_cents : a.amount_cents)}</TableCell>
                      <TableCell className="w-20 text-right">
                        {editable && <RemoveAccessorialButton id={a.id} loadId={load.id} label={ACCESSORIAL_LABELS[a.type]} />}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Load value</TableCell>
                    <TableCell className="text-right font-medium tabular-nums" data-testid="load-revenue">{formatCents(revenue)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
              {editable && <AddAccessorialForm loadId={load.id} />}
            </div>
          </SectionCard>

          <SectionCard title="History">
            <Suspense fallback={<PageLoading />}>
              <History load={load} organizationId={active.organizationId} timezone={active.timezone} />
            </Suspense>
          </SectionCard>
        </div>

        <div className="grid gap-5">
          {editable && (
            <SectionCard title="Status">
              <StatusPanel loadId={load.id} status={load.status} loadedMiles={load.loaded_miles} deadheadMiles={load.deadhead_miles}
                nowLocal={utcToZonedLocal(new Date().toISOString(), active.timezone)} timezoneLabel={tzLabel} />
            </SectionCard>
          )}

          <SectionCard title="Profitability">
            <Suspense fallback={<PageLoading />}>
              <Profitability load={load} organizationId={active.organizationId} timezone={active.timezone}
                showPay={canViewPay(active.role)} canEditExtras={editable || active.role === "accounting"}
                revenue={revenue} miles={miles} rpm={rpm} emptyPct={emptyPct} />
            </Suspense>
          </SectionCard>

          <SectionCard title="Assignment">
            <DetailList
              rows={[
                ["Truck", load.truck ? <Link key="t" href={`/trucks/${load.truck.id}`} className="hover:underline">{load.truck.unit_number}</Link> : "Not assigned"],
                ["Trailer", load.trailer ? <Link key="tr" href={`/trailers/${load.trailer.id}`} className="hover:underline">{load.trailer.unit_number}</Link> : "Not assigned"],
                ["Driver", drivers.length
                  ? drivers.map((d, i) => (
                      <span key={d.id}>
                        {i > 0 && " & "}
                        <Link href={`/drivers/${d.id}`} className="hover:underline">{d.first_name} {d.last_name}</Link>
                      </span>
                    ))
                  : "Not assigned"],
                ["Equipment", load.equipment_type ? TRAILER_TYPE_LABELS[load.equipment_type] : null],
                ["Commodity", load.commodity],
                ["Weight", load.weight_lbs === null ? null : `${load.weight_lbs.toLocaleString("en-US")} lbs`],
                ["Notes", load.notes],
              ]}
            />
          </SectionCard>

          <NotBuiltYet title="Documents">Rate confirmation, BOL and POD uploads come with documents.</NotBuiltYet>
        </div>
      </div>
    </div>
  );
}

async function History({ load, organizationId, timezone }: { load: LoadDetail; organizationId: string; timezone: string }) {
  const [events, members] = await Promise.all([listLoadEvents(organizationId, load.id), listMembers(organizationId)]);
  const who = new Map(members.map((m) => [m.userId, m.name ?? m.email]));
  return (
    <ol className="grid gap-2 text-sm">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap gap-x-2" data-testid="load-event">
          <span className="text-muted-foreground tabular-nums">{formatInZone(e.created_at, timezone)}</span>
          <span>
            {e.kind === "assignment_override"
              ? "Overlap override"
              : e.from_status
                ? `${LOAD_STATUS_LABELS[e.from_status]} → ${LOAD_STATUS_LABELS[e.to_status ?? "planned"]}`
                : `Created as ${LOAD_STATUS_LABELS[e.to_status ?? "planned"]}`}
          </span>
          {e.reason && <span className="text-muted-foreground">— {e.reason}</span>}
          {e.created_by && <span className="text-muted-foreground">· {who.get(e.created_by) ?? "former member"}</span>}
        </li>
      ))}
    </ol>
  );
}

async function Profitability({ load, organizationId, timezone, showPay, canEditExtras, revenue, miles, rpm, emptyPct }: {
  load: LoadDetail; organizationId: string; timezone: string; showPay: boolean; canEditExtras: boolean;
  revenue: number; miles: number; rpm: number | null; emptyPct: number | null;
}) {
  const drivers = load.drivers.map((d) => d.driver).filter((d) => d !== null);
  const [items, rules] = await Promise.all([
    listLoadDriverItems(organizationId, load.id),
    showPay ? listPayRulesForDrivers(organizationId, drivers.map((d) => d.id)) : Promise.resolve([]),
  ]);
  // The rule in effect on the pickup day pays the load (statements go by pickup week too).
  const firstPickup = load.stops.find((s) => s.stop_type === "pickup")?.appointment_start;
  const payDay = firstPickup ? todayIn(timezone, new Date(firstPickup)) : load.delivered_at ? todayIn(timezone, new Date(load.delivered_at)) : todayIn(timezone);
  const pay = drivers.map((d) => {
    const rule = ruleInEffect(rules.filter((r) => r.driver_id === d.id), payDay);
    const extras = items.filter((i) => i.driver_id === d.id).map((i) => i.amount_cents);
    return { driver: d, rule, result: rule ? driverLoadPay(rule, { valueCents: revenue, loaded_miles: load.loaded_miles, deadhead_miles: load.deadhead_miles }, extras) : null };
  });
  const driverPay = pay.reduce((sum, p) => sum + (p.result?.totalCents ?? 0), 0);
  const missingRule = pay.some((p) => !p.rule);

  return (
    <div className="grid gap-4">
      <DetailList
        rows={[
          ["Load value", formatCents(revenue)],
          ["Total miles", miles ? `${formatMiles(miles)} (${formatMiles(load.loaded_miles)} loaded + ${formatMiles(load.deadhead_miles)} empty)` : "—"],
          ["RPM", rpm === null ? "—" : `${formatCents(rpm)}/mi`],
          ["Empty miles", emptyPct === null ? "—" : `${emptyPct}%`],
          ...(showPay
            ? ([
                ["Driver pay", drivers.length ? <span key="dp" data-testid="load-driver-pay">{formatCents(driverPay)}</span> : "No driver"],
                ["Contribution", <span key="c" className="font-medium" data-testid="load-contribution">{formatCents(revenue - driverPay)}</span>],
              ] as [string, React.ReactNode][])
            : []),
        ]}
      />
      {showPay && pay.map((p) => (
        <div key={p.driver.id} className="rounded-lg border p-3 text-sm" data-testid={`driver-pay-${p.driver.last_name}`}>
          <div className="font-medium">{p.driver.first_name} {p.driver.last_name}</div>
          {p.rule && p.result ? (
            <>
              <div className="text-xs text-muted-foreground">{describePayRule(p.rule)}</div>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
                {p.result.companyFeeCents !== null ? (
                  <>
                    <dt>Load value</dt><dd className="text-right">{formatCents(revenue)}</dd>
                    <dt>Company fee</dt><dd className="text-right">{formatCents(-p.result.companyFeeCents)}</dd>
                  </>
                ) : (
                  <>
                    <dt>{formatMiles(p.result.paidMiles)} mi × {formatCents(p.rule.rate_cents_per_mile ?? 0)}</dt>
                    <dd className="text-right">{formatCents(p.result.baseCents)}</dd>
                  </>
                )}
                {p.result.extrasCents > 0 && (<><dt>Driver extras</dt><dd className="text-right">{formatCents(p.result.extrasCents)}</dd></>)}
                <dt className="font-medium">Pay for this load</dt><dd className="text-right font-medium">{formatCents(p.result.totalCents)}</dd>
              </dl>
            </>
          ) : (
            <p className="text-xs text-destructive">No pay rule in effect on the pickup day — add one on the driver&apos;s page.</p>
          )}
        </div>
      ))}
      {showPay && missingRule && <p className="text-xs text-muted-foreground">Contribution leaves out drivers without a pay rule.</p>}
      {!showPay && <p className="text-xs text-muted-foreground">Driver pay and contribution are visible to owners, admins and accounting.</p>}
      <p className="text-xs text-muted-foreground">Other load costs (fuel, tolls, lumper paid) come with expenses.</p>

      {canEditExtras || items.length ? (
        <div className="grid gap-2 border-t pt-3">
          <span className="text-sm font-medium">Driver extras</span>
          <p className="text-xs text-muted-foreground">Paid to the driver in full (no company fee), e.g. unloading the trailer.</p>
          {items.map((i) => {
            const d = drivers.find((x) => x.id === i.driver_id);
            return (
              <div key={i.id} className="flex items-center justify-between gap-2 text-sm" data-testid="driver-item">
                <span>{d ? `${d.first_name} ${d.last_name}` : "Driver"} · {i.description}</span>
                <span className="flex items-center gap-1 tabular-nums">
                  {formatCents(i.amount_cents)}
                  {canEditExtras && <RemoveDriverItemButton id={i.id} loadId={load.id} label={i.description} />}
                </span>
              </div>
            );
          })}
          {canEditExtras && (
            <AddDriverItemForm loadId={load.id} drivers={drivers.map((d) => ({ id: d.id, label: `${d.first_name} ${d.last_name}` }))} />
          )}
        </div>
      ) : null}
    </div>
  );
}
