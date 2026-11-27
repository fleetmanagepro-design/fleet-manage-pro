import { Suspense } from "react";
import { requirePermission } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { LoadForm } from "@/modules/dispatch/components/load-form";
import { newLoadDraft } from "@/modules/dispatch/draft";
import { loadFormOptions } from "@/modules/dispatch/queries";
import { canOverrideOverlap } from "@/modules/dispatch/status";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "New load · Fleet Manage Pro" };

export default function NewLoadPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewLoad />
    </Suspense>
  );
}

async function NewLoad() {
  const { active } = await requirePermission("loads.edit");
  const options = await loadFormOptions(active.organizationId);
  return (
    <div className="grid max-w-4xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">New load</h1>
      <SectionCard title="Load">
        <LoadForm draft={newLoadDraft(active.timezone)} options={options} orgTimezone={active.timezone}
          today={todayIn(active.timezone)} canOverride={canOverrideOverlap(active.permissions)} />
      </SectionCard>
    </div>
  );
}
