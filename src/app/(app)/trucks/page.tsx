import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrg } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { formatMiles } from "@/lib/miles";
import { complianceItems } from "@/modules/fleet/compliance";
import { ListFilters, PageLoading, parseStatusFilter } from "@/modules/fleet/components/asset-page";
import { AssetStatusBadge, ComplianceSummary } from "@/modules/fleet/components/badges";
import { canEditAssets } from "@/modules/fleet/permissions";
import { listTrucks } from "@/modules/fleet/queries";

export const metadata = { title: "Trucks · Fleet Manage Pro" };

export default function TrucksPage({ searchParams }: PageProps<"/trucks">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Trucks searchParams={searchParams} />
    </Suspense>
  );
}

async function Trucks({ searchParams }: Pick<PageProps<"/trucks">, "searchParams">) {
  const { active } = await requireOrg();
  const sp = await searchParams;
  const status = parseStatusFilter(sp.status);
  const includeArchived = sp.archived === "1";
  const trucks = await listTrucks(active.organizationId, { status, includeArchived });
  const today = todayIn(active.timezone);

  return (
    <div className="grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Trucks</h1>
        {canEditAssets(active.role) && (
          <Link href="/trucks/new" className={buttonVariants()}>Add truck</Link>
        )}
      </div>
      <ListFilters status={status} includeArchived={includeArchived} />
      <Card>
        <CardContent>
          {trucks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {status || includeArchived ? "No trucks match these filters." : "No trucks yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Truck</TableHead>
                  <TableHead>VIN</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead className="text-right">Odometer (mi)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Compliance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trucks.map((t) => (
                  <TableRow key={t.id} data-testid={`truck-${t.unit_number}`}>
                    <TableCell className="font-medium">
                      <Link href={`/trucks/${t.id}`} className="hover:underline">{t.unit_number}</Link>
                    </TableCell>
                    <TableCell>{[t.year, t.make, t.model].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{t.vin}</TableCell>
                    <TableCell>{t.plate ? `${t.plate}${t.plate_state ? ` (${t.plate_state})` : ""}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMiles(t.current_odometer)}</TableCell>
                    <TableCell><AssetStatusBadge status={t.status} archived={!!t.archived_at} /></TableCell>
                    <TableCell><ComplianceSummary items={complianceItems(t, today)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
