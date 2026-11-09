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
import { OWNERSHIP_LABELS } from "@/modules/fleet/labels";
import {
  canChangeAssetStatus,
  canCorrectReadings,
  canEditAssets,
  canRecordReadings,
  canSetSold,
} from "@/modules/fleet/permissions";
import { getTruck, listReadings } from "@/modules/fleet/queries";

export const metadata = { title: "Truck · Fleet Manage Pro" };

export default function TruckPage({ params, searchParams }: PageProps<"/trucks/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <TruckDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const NOT_BUILT: Record<string, string> = {
  loads: "Loads assigned to this truck will appear here once dispatch is built.",
  expenses: "Fuel, repairs and fixed costs for this truck will appear here once expenses are built.",
  maintenance: "Work orders, PM schedules and tires will appear here once maintenance is built.",
  documents: "Registration, insurance and inspection documents will appear here once documents are built.",
};

async function TruckDetail({ params, searchParams }: Pick<PageProps<"/trucks/[id]">, "params" | "searchParams">) {
  const { active } = await requireOrg();
  const id = z.uuid().safeParse((await params).id);
  const truck = id.success ? await getTruck(active.organizationId, id.data) : null;
  if (!truck) notFound();
  const tab = parseTab((await searchParams).tab);
  const role = active.role;
  const sold = truck.status === "sold";
  const archived = !!truck.archived_at;
  const today = todayIn(active.timezone);
  const basePath = `/trucks/${truck.id}`;

  return (
    <div className="grid max-w-5xl gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Link href="/trucks" className="text-sm text-muted-foreground hover:underline">← Trucks</Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            Truck {truck.unit_number}
            <AssetStatusBadge status={truck.status} archived={archived} />
          </h1>
          <p className="text-sm text-muted-foreground">{[truck.year, truck.make, truck.model].filter(Boolean).join(" ")}</p>
        </div>
        {canEditAssets(role) && (
          <div className="flex items-start gap-2">
            {!sold && !archived && (
              <Link href={`${basePath}/edit`} className={buttonVariants({ variant: "outline" })}>Edit</Link>
            )}
            <ArchiveForm kind="truck" id={truck.id} archived={archived} label={`truck ${truck.unit_number}`} />
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
                ["VIN", (
                  <span key="vin" className="font-mono text-xs">
                    {truck.vin}
                    {!hasValidCheckDigit(truck.vin) && (
                      <span className="ml-2 font-sans text-amber-700 dark:text-amber-400">check digit doesn&apos;t match</span>
                    )}
                  </span>
                )],
                ["Plate", truck.plate ? `${truck.plate}${truck.plate_state ? ` (${truck.plate_state})` : ""}` : null],
                ["Ownership", OWNERSHIP_LABELS[truck.ownership]],
                ["Purchased", truck.purchase_date ? formatCalendarDate(truck.purchase_date) : null],
                ["Purchase price", truck.purchase_price_cents === null ? null : formatCents(truck.purchase_price_cents)],
                ["Odometer", truck.current_odometer === null ? null : `${formatMiles(truck.current_odometer)} mi`],
                ["Notes", truck.notes],
              ]}
            />
          </SectionCard>

          <div className="grid gap-5">
            <SectionCard title="Compliance" description="Flagged 30 days before expiry.">
              <ComplianceList items={complianceItems(truck, today)} />
            </SectionCard>
            {canChangeAssetStatus(role) && !archived && (!sold || canSetSold(role)) && (
              <SectionCard title="Status">
                <StatusForm kind="truck" id={truck.id} status={truck.status} allowSold={canSetSold(role)} />
              </SectionCard>
            )}
          </div>

          <NotBuiltYet title="Profitability">
            Revenue, RPM, CPM, maintenance CPM and profit for this truck will appear once loads and expenses exist.
          </NotBuiltYet>

          <SectionCard title="Odometer">
            <div className="grid gap-5">
              {canRecordReadings(role) && !sold && !archived && (
                <ReadingForm id={truck.id} meterTypes={["odometer"]} today={today} canCorrect={canCorrectReadings(role)} />
              )}
              <Suspense fallback={<PageLoading />}>
                <Readings organizationId={active.organizationId} truckId={truck.id} timeZone={active.timezone} />
              </Suspense>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

async function Readings({ organizationId, truckId, timeZone }: { organizationId: string; truckId: string; timeZone: string }) {
  const readings = await listReadings(organizationId, { truckId });
  return <ReadingHistory readings={readings} timeZone={timeZone} />;
}
