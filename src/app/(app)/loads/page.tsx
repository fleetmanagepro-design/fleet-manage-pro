import Link from "next/link";
import { Suspense } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrg } from "@/lib/auth";
import { formatMiles } from "@/lib/miles";
import { formatCents } from "@/lib/money";
import { formatInZone } from "@/lib/zoned-time";
import { loadRevenueCents, revenuePerMileCents, totalMiles } from "@/modules/dispatch/calculations";
import { LoadStatusBadge } from "@/modules/dispatch/components/status-badge";
import { LOAD_STATUSES, LOAD_STATUS_LABELS, type LoadStatus } from "@/modules/dispatch/labels";
import { type LoadStop, listLoads, loadFormOptions } from "@/modules/dispatch/queries";
import { canEditLoads } from "@/modules/dispatch/status";
import { PageLoading } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Loads · Fleet Manage Pro" };

const pick = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default function LoadsPage({ searchParams }: PageProps<"/loads">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Loads searchParams={searchParams} />
    </Suspense>
  );
}

function StopCell({ stop }: { stop?: LoadStop }) {
  if (!stop) return <span className="text-muted-foreground">—</span>;
  return (
    <div>
      <div>{stop.city}, {stop.state}</div>
      {stop.appointment_start && (
        <div className="text-xs text-muted-foreground">{formatInZone(stop.appointment_start, stop.timezone)}</div>
      )}
    </div>
  );
}

async function Loads({ searchParams }: Pick<PageProps<"/loads">, "searchParams">) {
  const { active } = await requireOrg();
  const sp = await searchParams;
  const status = LOAD_STATUSES.includes(sp.status as LoadStatus) ? (sp.status as LoadStatus) : undefined;
  const filter = { status, customerId: pick(sp.customer), truckId: pick(sp.truck), driverId: pick(sp.driver) };
  const [loads, options] = await Promise.all([listLoads(active.organizationId, filter), loadFormOptions(active.organizationId)]);
  const filtered = Object.values(filter).some(Boolean);

  return (
    <div className="grid max-w-7xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Loads</h1>
        {canEditLoads(active.role) && <Link href="/loads/new" className={buttonVariants()}>New load</Link>}
      </div>
      <form method="get" role="search" className="flex flex-wrap items-center gap-3 text-sm">
        <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Filter by status" size="sm" className="min-w-36">
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          {LOAD_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{LOAD_STATUS_LABELS[s]}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect name="customer" defaultValue={filter.customerId ?? ""} aria-label="Filter by customer" size="sm" className="min-w-44">
          <NativeSelectOption value="">All customers</NativeSelectOption>
          {options.customers.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.label}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect name="truck" defaultValue={filter.truckId ?? ""} aria-label="Filter by truck" size="sm" className="min-w-32">
          <NativeSelectOption value="">All trucks</NativeSelectOption>
          {options.trucks.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.label}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect name="driver" defaultValue={filter.driverId ?? ""} aria-label="Filter by driver" size="sm" className="min-w-40">
          <NativeSelectOption value="">All drivers</NativeSelectOption>
          {options.drivers.map((d) => <NativeSelectOption key={d.id} value={d.id}>{d.label}</NativeSelectOption>)}
        </NativeSelect>
        <Button type="submit" size="sm" variant="outline">Apply</Button>
        {filtered && <Link href="/loads" className="text-muted-foreground hover:underline">Clear</Link>}
      </form>
      <Card>
        <CardContent>
          {loads.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{filtered ? "No loads match these filters." : "No loads yet."}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Load #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Truck</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Miles</TableHead>
                  <TableHead className="text-right">RPM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loads.map((l) => {
                  const revenue = loadRevenueCents(l, l.accessorials);
                  const miles = totalMiles(l);
                  const rpm = revenuePerMileCents(revenue, miles);
                  const pickup = l.stops.find((s) => s.stop_type === "pickup");
                  const delivery = l.stops.findLast((s) => s.stop_type === "delivery");
                  return (
                    <TableRow key={l.id} data-testid={`load-${l.load_number}`}>
                      <TableCell className="font-medium">
                        <Link href={`/loads/${l.id}`} className="hover:underline">{l.load_number}</Link>
                      </TableCell>
                      <TableCell><LoadStatusBadge status={l.status} /></TableCell>
                      <TableCell className="max-w-48 truncate">{l.customer?.name ?? "—"}</TableCell>
                      <TableCell><StopCell stop={pickup} /></TableCell>
                      <TableCell><StopCell stop={delivery} /></TableCell>
                      <TableCell>{l.truck?.unit_number ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {l.drivers.map((d) => d.driver && `${d.driver.first_name} ${d.driver.last_name}`).filter(Boolean).join(" & ") ||
                          <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{miles ? formatMiles(miles) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{rpm === null ? "—" : formatCents(rpm)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {loads.length === 200 && (
            <p className="pt-3 text-xs text-muted-foreground">Showing the 200 most recent loads. Use the filters to narrow down.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
