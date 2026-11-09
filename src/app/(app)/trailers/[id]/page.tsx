import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth";
import { formatCalendarDate, todayIn } from "@/lib/dates";
import { formatMiles } from "@/lib/miles";
import { formatCents } from "@/lib/money";
import { hasValidCheckDigit } from "@/lib/vin";
import { complianceItems } from "@/modules/fleet/compliance";
import { ArchiveForm, ReadingForm, StatusForm } from "@/modules/fleet/components/asset-controls";
import {
  AssetTabs,
  DetailList,
  NotBuiltYet,
  PageLoading,
  ReadingHistory,
  SectionCard,
  parseTab,
} from "@/modules/fleet/components/asset-page";
import { AssetStatusBadge, ComplianceList } from "@/modules/fleet/components/badges";
import { OWNERSHIP_LABELS, TRAILER_TYPE_LABELS, type MeterType } from "@/modules/fleet/labels";
import {
  canChangeAssetStatus,
  canCorrectReadings,
  canEditAssets,
  canRecordReadings,
  canSetSold,
} from "@/modules/fleet/permissions";
import { getTrailer, listReadings } from "@/modules/fleet/queries";

export const metadata = { title: "Trailer · Fleet Manage Pro" };

export default function TrailerPage({ params, searchParams }: PageProps<"/trailers/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <TrailerDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const NOT_BUILT: Record<string, string> = {
  loads: "Loads this trailer moved on will appear here once dispatch is built. Trailer miles come from those loads.",
  expenses: "Repairs, tires and lease payments for this trailer will appear here once expenses are built.",
  maintenance: "Work orders, PM schedules and tires by position will appear here once maintenance is built.",
  documents: "Registration and inspection documents will appear here once documents are built.",
};

async function TrailerDetail({ params, searchParams }: Pick<PageProps<"/trailers/[id]">, "params" | "searchParams">) {
  const { active } = await requireOrg();
  const id = z.uuid().safeParse((await params).id);
  const trailer = id.success ? await getTrailer(active.organizationId, id.data) : null;
  if (!trailer) notFound();
  const tab = parseTab((await searchParams).tab);
  const role = active.role;
  const sold = trailer.status === "sold";
  const archived = !!trailer.archived_at;
  const today = todayIn(active.timezone);
  const basePath = `/trailers/${trailer.id}`;
  const meterTypes: MeterType[] = trailer.trailer_type === "reefer" ? ["hubodometer", "reefer_hours"] : ["hubodometer"];

  return (
    <div className="grid max-w-5xl gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Link href="/trailers" className="text-sm text-muted-foreground hover:underline">← Trailers</Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            Trailer {trailer.unit_number}
            <AssetStatusBadge status={trailer.status} archived={archived} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {[trailer.year, trailer.make, TRAILER_TYPE_LABELS[trailer.trailer_type], trailer.length_ft ? `${trailer.length_ft}′` : null]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
        {canEditAssets(role) && (
          <div className="flex items-start gap-2">
            {!sold && !archived && (
              <Link href={`${basePath}/edit`} className={buttonVariants({ variant: "outline" })}>Edit</Link>
            )}
            <ArchiveForm kind="trailer" id={trailer.id} archived={archived} label={`trailer ${trailer.unit_number}`} />
          </div>
        )}
      </div>

      <AssetTabs basePath={basePath} current={tab} />

      {tab !== "overview" ? (
        <NotBuiltYet title={tab[0].toUpperCase() + tab.slice(1)}>{NOT_BUILT[tab]}</NotBuiltYet>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <SectionCard title="Details">
            <DetailList
              rows={[
                ["VIN", trailer.vin ? (
                  <span key="vin" className="font-mono text-xs">
                    {trailer.vin}
                    {!hasValidCheckDigit(trailer.vin) && (
                      <span className="ml-2 font-sans text-amber-700 dark:text-amber-400">check digit doesn&apos;t match</span>
                    )}
                  </span>
                ) : null],
                ["Plate", trailer.plate ? `${trailer.plate}${trailer.plate_state ? ` (${trailer.plate_state})` : ""}` : null],
                ["Ownership", OWNERSHIP_LABELS[trailer.ownership]],
                ["Purchased", trailer.purchase_date ? formatCalendarDate(trailer.purchase_date) : null],
                ["Purchase price", trailer.purchase_price_cents === null ? null : formatCents(trailer.purchase_price_cents)],
                ["Hubodometer", trailer.hubodometer === null ? null : `${formatMiles(trailer.hubodometer)} mi`],
                ...(trailer.trailer_type === "reefer"
                  ? [["Reefer hours", trailer.reefer_hours === null ? null : `${formatMiles(trailer.reefer_hours)} h`] as [string, string | null]]
                  : []),
                ["Notes", trailer.notes],
              ]}
            />
          </SectionCard>

          <div className="grid gap-5">
            <SectionCard title="Compliance" description="Flagged 30 days before expiry.">
              <ComplianceList items={complianceItems(trailer, today)} />
            </SectionCard>
            {canChangeAssetStatus(role) && !archived && (!sold || canSetSold(role)) && (
              <SectionCard title="Status">
                <StatusForm kind="trailer" id={trailer.id} status={trailer.status} allowSold={canSetSold(role)} />
              </SectionCard>
            )}
          </div>

          <NotBuiltYet title="Maintenance cost">
            Maintenance CPM, tire spend and total cost of ownership for this trailer will appear once maintenance and
            loads exist.
          </NotBuiltYet>

          <SectionCard title={trailer.trailer_type === "reefer" ? "Hubodometer & reefer hours" : "Hubodometer"}
            description="Optional. Trailer miles will mainly come from the loads it moves.">
            <div className="grid gap-5">
              {canRecordReadings(role) && !sold && !archived && (
                <ReadingForm id={trailer.id} meterTypes={meterTypes} today={today} canCorrect={canCorrectReadings(role)} />
              )}
              <Suspense fallback={<PageLoading />}>
                <Readings organizationId={active.organizationId} trailerId={trailer.id} timeZone={active.timezone} />
              </Suspense>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

async function Readings({ organizationId, trailerId, timeZone }: { organizationId: string; trailerId: string; timeZone: string }) {
  const readings = await listReadings(organizationId, { trailerId });
  return <ReadingHistory readings={readings} timeZone={timeZone} />;
}
