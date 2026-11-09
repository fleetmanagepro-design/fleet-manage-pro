import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireOrgRole } from "@/lib/auth";
import { DriverForm } from "@/modules/drivers/components/driver-form";
import { DRIVER_EDITORS } from "@/modules/drivers/permissions";
import { getDriver, listAssignableTrucks } from "@/modules/drivers/queries";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Edit driver · Fleet Manage Pro" };

export default function EditDriverPage({ params }: PageProps<"/drivers/[id]/edit">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditDriver params={params} />
    </Suspense>
  );
}

async function EditDriver({ params }: Pick<PageProps<"/drivers/[id]/edit">, "params">) {
  const { active } = await requireOrgRole(DRIVER_EDITORS);
  const id = z.uuid().safeParse((await params).id);
  const driver = id.success ? await getDriver(active.organizationId, id.data) : null;
  if (!driver) notFound();
  const trucks = await listAssignableTrucks(active.organizationId, driver.default_truck_id);
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Edit {driver.first_name} {driver.last_name}</h1>
      <SectionCard title="Driver details">
        <DriverForm driver={driver} trucks={trucks} />
      </SectionCard>
    </div>
  );
}
