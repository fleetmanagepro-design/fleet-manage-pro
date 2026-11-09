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
import { TRAILER_TYPE_LABELS } from "@/modules/fleet/labels";
import { canEditAssets } from "@/modules/fleet/permissions";
import { listTrailers } from "@/modules/fleet/queries";

export const metadata = { title: "Trailers · Fleet Manage Pro" };

export default function TrailersPage({ searchParams }: PageProps<"/trailers">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Trailers searchParams={searchParams} />
    </Suspense>
  );
}

async function Trailers({ searchParams }: Pick<PageProps<"/trailers">, "searchParams">) {
  const { active } = await requireOrg();
  const sp = await searchParams;
  const status = parseStatusFilter(sp.status);
  const includeArchived = sp.archived === "1";
  const trailers = await listTrailers(active.organizationId, { status, includeArchived });
  const today = todayIn(active.timezone);

  return (
    <div className="grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Trailers</h1>
        {canEditAssets(active.role) && (
          <Link href="/trailers/new" className={buttonVariants()}>Add trailer</Link>
        )}
      </div>
      <ListFilters status={status} includeArchived={includeArchived} />
      <Card>
        <CardContent>
          {trailers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {status || includeArchived ? "No trailers match these filters." : "No trailers yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Trailer</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead className="text-right">Hubodometer (mi)</TableHead>
                  <TableHead className="text-right">Reefer hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Compliance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trailers.map((t) => (
                  <TableRow key={t.id} data-testid={`trailer-${t.unit_number}`}>
                    <TableCell className="font-medium">
                      <Link href={`/trailers/${t.id}`} className="hover:underline">{t.unit_number}</Link>
                    </TableCell>
                    <TableCell>{TRAILER_TYPE_LABELS[t.trailer_type]}{t.length_ft ? ` ${t.length_ft}′` : ""}</TableCell>
                    <TableCell>{[t.year, t.make].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell>{t.plate ? `${t.plate}${t.plate_state ? ` (${t.plate_state})` : ""}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMiles(t.hubodometer)}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.trailer_type === "reefer" ? formatMiles(t.reefer_hours) : ""}</TableCell>
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
