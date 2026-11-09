import { Suspense } from "react";
import { requireOrgRole } from "@/lib/auth";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";
import { TruckForm } from "@/modules/fleet/components/asset-forms";
import { ASSET_EDITORS } from "@/modules/fleet/permissions";

export const metadata = { title: "Add truck · Fleet Manage Pro" };

export default function NewTruckPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewTruck />
    </Suspense>
  );
}

async function NewTruck() {
  await requireOrgRole(ASSET_EDITORS);
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Add truck</h1>
      <SectionCard title="Truck details">
        <TruckForm />
      </SectionCard>
    </div>
  );
}
