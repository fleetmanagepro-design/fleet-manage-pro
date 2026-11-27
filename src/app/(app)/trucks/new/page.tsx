import { Suspense } from "react";
import { requirePermission } from "@/lib/auth";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";
import { TruckForm } from "@/modules/fleet/components/asset-forms";

export const metadata = { title: "Add truck · Fleet Manage Pro" };

export default function NewTruckPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewTruck />
    </Suspense>
  );
}

async function NewTruck() {
  await requirePermission("fleet.edit");
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Add truck</h1>
      <SectionCard title="Truck details">
        <TruckForm />
      </SectionCard>
    </div>
  );
}
