import { Suspense } from "react";
import { requireOrgRole } from "@/lib/auth";
import { DriverForm } from "@/modules/drivers/components/driver-form";
import { DRIVER_EDITORS } from "@/modules/drivers/permissions";
import { listAssignableTrucks } from "@/modules/drivers/queries";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Add driver · Fleet Manage Pro" };

export default function NewDriverPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewDriver />
    </Suspense>
  );
}

async function NewDriver() {
  const { active } = await requireOrgRole(DRIVER_EDITORS);
  const trucks = await listAssignableTrucks(active.organizationId);
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Add driver</h1>
      <SectionCard title="Driver details" description="You can add the pay rule on the next page.">
        <DriverForm trucks={trucks} />
      </SectionCard>
    </div>
  );
}
