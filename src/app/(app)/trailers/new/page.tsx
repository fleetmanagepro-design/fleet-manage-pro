import { Suspense } from "react";
import { requirePermission } from "@/lib/auth";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";
import { TrailerForm } from "@/modules/fleet/components/asset-forms";

export const metadata = { title: "Add trailer · Fleet Manage Pro" };

export default function NewTrailerPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewTrailer />
    </Suspense>
  );
}

async function NewTrailer() {
  await requirePermission("fleet.edit");
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Add trailer</h1>
      <SectionCard title="Trailer details">
        <TrailerForm />
      </SectionCard>
    </div>
  );
}
