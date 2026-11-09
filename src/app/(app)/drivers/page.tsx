import Link from "next/link";
import { Suspense } from "react";
import { ComplianceSummary } from "@/components/expiry-badges";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgRole } from "@/lib/auth";
import { formatCalendarDate, todayIn } from "@/lib/dates";
import { driverCompliance } from "@/modules/drivers/compliance";
import { DriverStatusBadge } from "@/modules/drivers/components/status-badge";
import { DRIVER_STATUSES, DRIVER_STATUS_LABELS, DRIVER_TYPE_LABELS, type DriverStatus } from "@/modules/drivers/labels";
import { DRIVER_READERS, canEditDrivers } from "@/modules/drivers/permissions";
import { listDrivers } from "@/modules/drivers/queries";
import { ListFilters, PageLoading } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Drivers · Fleet Manage Pro" };

const STATUS_OPTIONS = DRIVER_STATUSES.map((s) => [s, DRIVER_STATUS_LABELS[s]] as const);

export default function DriversPage({ searchParams }: PageProps<"/drivers">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Drivers searchParams={searchParams} />
    </Suspense>
  );
}

async function Drivers({ searchParams }: Pick<PageProps<"/drivers">, "searchParams">) {
  const { active } = await requireOrgRole(DRIVER_READERS);
  const sp = await searchParams;
  const status = DRIVER_STATUSES.includes(sp.status as DriverStatus) ? (sp.status as DriverStatus) : undefined;
  const includeArchived = sp.archived === "1";
  const drivers = await listDrivers(active.organizationId, { status, includeArchived });
  const today = todayIn(active.timezone);

  return (
    <div className="grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Drivers</h1>
        {canEditDrivers(active.role) && <Link href="/drivers/new" className={buttonVariants()}>Add driver</Link>}
      </div>
      <ListFilters status={status} includeArchived={includeArchived} statusOptions={STATUS_OPTIONS} />
      <Card>
        <CardContent>
          {drivers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {status || includeArchived ? "No drivers match these filters." : "No drivers yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Truck</TableHead>
                  <TableHead>CDL expires</TableHead>
                  <TableHead>Medical expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Compliance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => {
                  const name = `${d.first_name} ${d.last_name}`;
                  return (
                    <TableRow key={d.id} data-testid={`driver-${d.last_name}-${d.first_name}`}>
                      <TableCell className="font-medium">
                        <Link href={`/drivers/${d.id}`} className="hover:underline">{name}</Link>
                      </TableCell>
                      <TableCell>{DRIVER_TYPE_LABELS[d.driver_type]}</TableCell>
                      <TableCell>{d.phone ?? "—"}</TableCell>
                      <TableCell>
                        {d.default_truck ? (
                          <Link href={`/trucks/${d.default_truck.id}`} className="hover:underline">{d.default_truck.unit_number}</Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{formatCalendarDate(d.cdl_expires_on)}</TableCell>
                      <TableCell>{formatCalendarDate(d.medical_card_expires_on)}</TableCell>
                      <TableCell><DriverStatusBadge status={d.status} archived={!!d.archived_at} /></TableCell>
                      <TableCell><ComplianceSummary items={driverCompliance(d, today)} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
