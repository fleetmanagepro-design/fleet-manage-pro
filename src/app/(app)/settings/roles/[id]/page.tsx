import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth";
import { hasAll, toPermissionSet } from "@/lib/permissions";
import { RoleDangerButtons, RoleForm } from "@/modules/accounts/components/role-form";
import { listRoles, permissionCatalog } from "@/modules/accounts/queries";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Role · Fleet Manage Pro" };

export default function RolePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Role params={params} />
    </Suspense>
  );
}

async function Role({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { active } = await requirePermission("members.manage");
  const [roles, catalog] = await Promise.all([listRoles(active.organizationId), permissionCatalog()]);
  const role = roles.find((r) => r.id === id);
  if (!role) notFound();

  const builtIn = role.key !== null;
  const isOwnerRole = role.key === "owner";
  // Only someone who has everything a role allows may change it (0009c update_role).
  const editable = !isOwnerRole && hasAll(active.permissions, role.permissions);
  const has = toPermissionSet(role.permissions);

  return (
    <div className="grid max-w-3xl gap-4">
      <div className="grid gap-1">
        <Link href="/settings/roles" className="text-sm text-muted-foreground hover:underline">← Roles</Link>
        <h1 className="text-2xl font-semibold tracking-tight">{role.name}</h1>
        <p className="text-sm text-muted-foreground">
          {builtIn ? "Built-in role" : "Made by your company"} · {role.memberCount} {role.memberCount === 1 ? "member" : "members"}
        </p>
      </div>

      {isOwnerRole ? (
        <SectionCard title="Permissions" description="The Owner role allows everything and can't be changed.">
          <p className="text-sm">Owners can do everything, including making other owners.</p>
        </SectionCard>
      ) : editable ? (
        <>
          <SectionCard title="Permissions" description={builtIn ? "You can change what this built-in role allows, or reset it later." : undefined}>
            <RoleForm catalog={catalog} mine={[...active.permissions]}
              role={{ id: role.id, name: role.name, description: role.description, permissions: [...has], builtIn }} />
          </SectionCard>
          <SectionCard title={builtIn ? "Reset" : "Delete"}>
            <RoleDangerButtons roleId={role.id} builtIn={builtIn} inUse={role.memberCount > 0} />
          </SectionCard>
        </>
      ) : (
        <SectionCard title="Permissions" description="This role allows things you can't do yourself, so you can't change it.">
          <ul className="grid gap-1 text-sm">
            {catalog.filter((c) => has.has(c.key)).map((c) => <li key={c.key}>{c.label}</li>)}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
