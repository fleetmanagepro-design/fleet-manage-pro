import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth";
import { rolePermissions } from "@/modules/accounts/permissions";
import { listRoles } from "@/modules/accounts/queries";

export const metadata = { title: "Roles · Fleet Manage Pro" };

export default function RolesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Roles />
    </Suspense>
  );
}

async function Roles() {
  const { active } = await requirePermission("members.manage");
  const roles = await listRoles(active.organizationId);
  return (
    <div className="grid max-w-4xl gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
        <Link href="/settings/roles/new" className={buttonVariants()}>Create role</Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Roles and permissions</CardTitle>
          <CardDescription>
            A role is a set of permissions. A member can have several roles and may do whatever any of them allows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Permissions</TableHead>
                <TableHead className="text-right">Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id} data-testid={`role-${r.name}`}>
                  <TableCell>
                    <Link href={`/settings/roles/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                    {r.key ? <Badge variant="secondary" className="ml-2">Built-in</Badge> : null}
                    {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.key === "owner" ? "All" : rolePermissions(r).length}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.memberCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
