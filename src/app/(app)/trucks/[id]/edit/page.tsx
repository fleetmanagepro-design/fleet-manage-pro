import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireOrgRole } from "@/lib/auth";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";
import { TruckForm } from "@/modules/fleet/components/asset-forms";
import { ASSET_EDITORS } from "@/modules/fleet/permissions";
import { getTruck } from "@/modules/fleet/queries";

export const metadata = { title: "Edit truck · Fleet Manage Pro" };

export default function EditTruckPage({ params }: PageProps<"/trucks/[id]/edit">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditTruck params={params} />
    </Suspense>
  );
}

async function EditTruck({ params }: Pick<PageProps<"/trucks/[id]/edit">, "params">) {
  const { active } = await requireOrgRole(ASSET_EDITORS);
  const id = z.uuid().safeParse((await params).id);
  const truck = id.success ? await getTruck(active.organizationId, id.data) : null;
  if (!truck) notFound();
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Edit truck {truck.unit_number}</h1>
      {truck.status === "sold" ? (
        <SectionCard title="This truck is sold" description="Sold trucks are read-only. An owner or admin can change the status on the truck page first.">
          <span />
        </SectionCard>
      ) : (
        <SectionCard title="Truck details">
          <TruckForm truck={truck} />
        </SectionCard>
      )}
    </div>
  );
}
