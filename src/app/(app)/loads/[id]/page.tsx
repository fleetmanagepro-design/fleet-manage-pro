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
import { type LoadDetail, getLoad, listLoadEvents } from "@/modules/dispatch/queries";
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
                        {!a.billable_to_customer && <span className="ml-2 text-xs text-muted-foreground">(not billed)</span>}
                        {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(a.amount_cents)}</TableCell>
                      <TableCell className="w-20 text-right">
                        {editable && <RemoveAccessorialButton id={a.id} loadId={load.id} label={ACCESSORIAL_LABELS[a.type]} />}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Revenue</TableCell>
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
            <DetailList
              rows={[
                ["Revenue", formatCents(revenue)],
                ["Total miles", miles ? `${formatMiles(miles)} (${formatMiles(load.loaded_miles)} loaded + ${formatMiles(load.deadhead_miles)} empty)` : "—"],
                ["RPM", rpm === null ? "—" : `${formatCents(rpm)}/mi`],
                ["Empty miles", emptyPct === null ? "—" : `${emptyPct}%`],
                ["Direct costs", <span key="dc" className="text-muted-foreground">Not built yet</span>],
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Driver pay and load costs (and so contribution and estimated profit) come with delivery pay (Task 4c) and expenses.
            </p>
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
