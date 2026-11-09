import { Suspense } from "react";
import { requireOrgRole } from "@/lib/auth";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";
import { TrailerForm } from "@/modules/fleet/components/asset-forms";
import { ASSET_EDITORS } from "@/modules/fleet/permissions";

export const metadata = { title: "Add trailer · Fleet Manage Pro" };

export default function NewTrailerPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewTrailer />
    </Suspense>
  );
}

async function NewTrailer() {
  await requireOrgRole(ASSET_EDITORS);
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Add trailer</h1>
      <SectionCard title="Trailer details">
        <TrailerForm />
      </SectionCard>
    </div>
  );
}
