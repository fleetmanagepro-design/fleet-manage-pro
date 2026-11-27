import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";
import { TrailerForm } from "@/modules/fleet/components/asset-forms";
import { getTrailer } from "@/modules/fleet/queries";

export const metadata = { title: "Edit trailer · Fleet Manage Pro" };

export default function EditTrailerPage({ params }: PageProps<"/trailers/[id]/edit">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditTrailer params={params} />
    </Suspense>
  );
}

async function EditTrailer({ params }: Pick<PageProps<"/trailers/[id]/edit">, "params">) {
  const { active } = await requirePermission("fleet.edit");
  const id = z.uuid().safeParse((await params).id);
  const trailer = id.success ? await getTrailer(active.organizationId, id.data) : null;
  if (!trailer) notFound();
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Edit trailer {trailer.unit_number}</h1>
      {trailer.status === "sold" ? (
        <SectionCard title="This trailer is sold" description="Sold trailers are read-only. An owner or admin can change the status on the trailer page first.">
          <span />
        </SectionCard>
      ) : (
        <SectionCard title="Trailer details">
          <TrailerForm trailer={trailer} />
        </SectionCard>
      )}
    </div>
  );
}
