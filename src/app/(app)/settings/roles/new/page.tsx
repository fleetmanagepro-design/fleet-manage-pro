import { Suspense } from "react";
import { requirePermission } from "@/lib/auth";
import { RoleForm } from "@/modules/accounts/components/role-form";
import { permissionCatalog } from "@/modules/accounts/queries";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Create role · Fleet Manage Pro" };

export default function NewRolePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewRole />
    </Suspense>
  );
}

async function NewRole() {
  const { active } = await requirePermission("members.manage");
  const catalog = await permissionCatalog();
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Create role</h1>
      <SectionCard title="Role" description="Tick what this role may do. You can only give permissions you have yourself.">
        <RoleForm catalog={catalog} mine={[...active.permissions]} />
      </SectionCard>
    </div>
  );
}
