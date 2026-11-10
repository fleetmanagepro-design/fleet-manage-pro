import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireOrgRole } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { LoadForm } from "@/modules/dispatch/components/load-form";
import { loadToDraft } from "@/modules/dispatch/draft";
import { getLoad, loadFormOptions } from "@/modules/dispatch/queries";
import { DISPATCH_EDITORS, canOverrideOverlap } from "@/modules/dispatch/status";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Edit load · Fleet Manage Pro" };

export default function EditLoadPage({ params }: PageProps<"/loads/[id]/edit">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditLoad params={params} />
    </Suspense>
  );
}

async function EditLoad({ params }: Pick<PageProps<"/loads/[id]/edit">, "params">) {
  const { active } = await requireOrgRole(DISPATCH_EDITORS);
  const id = z.uuid().safeParse((await params).id);
  const load = id.success ? await getLoad(active.organizationId, id.data) : null;
  if (!load) notFound();
  const options = await loadFormOptions(active.organizationId, load);
  return (
    <div className="grid max-w-4xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Edit load {load.load_number}</h1>
      {load.status === "invoiced" || load.status === "paid" ? (
        <SectionCard title="This load is invoiced" description="Invoiced loads can't be edited; void the invoice first (comes with invoicing).">
          <span />
        </SectionCard>
      ) : (
        <SectionCard title="Load">
          <LoadForm draft={loadToDraft(load)} options={options} orgTimezone={active.timezone}
            today={todayIn(active.timezone)} canOverride={canOverrideOverlap(active.role)} />
        </SectionCard>
      )}
    </div>
  );
}
