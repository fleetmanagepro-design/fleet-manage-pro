import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { InviteMemberForm } from "@/modules/accounts/components/invite-member-form";
import {
  ChangeRoleForm,
  RemoveMemberForm,
  RevokeInvitationForm,
} from "@/modules/accounts/components/member-actions";
import { ROLE_LABELS, assignableRoles, type Actor } from "@/modules/accounts/permissions";
import { listMembers, listOpenInvitations, listRoles } from "@/modules/accounts/queries";

export const metadata = { title: "Members · Fleet Manage Pro" };

export default function MembersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Members />
    </Suspense>
  );
}

async function Members() {
  const { user, active } = await requirePermission("members.manage");
  const [members, invitations, roleDefs] = await Promise.all([
    listMembers(active.organizationId),
    listOpenInvitations(active.organizationId),
    listRoles(active.organizationId),
  ]);
  const actor: Actor = { permissions: active.permissions, isOwner: active.role === "owner" };
  const roles = assignableRoles(actor, roleDefs).map((r) => r.key);
  // Can the actor give (and so manage) this role? Unknown roles are left alone.
  const grantable = (key: string) => roles.some((r) => r === key);

  return (
    <div className="grid max-w-4xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>

      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>They&apos;ll get an email with a link that is valid for 7 days.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteMemberForm roles={roles} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isSelf = m.userId === user.id;
                const manageable = grantable(m.role);
                const label = m.name ?? m.email;
                return (
                  <TableRow key={m.userId} data-testid={`member-${m.email}`}>
                    <TableCell>
                      <div className="font-medium">
                        {label} {isSelf && <span className="text-muted-foreground">(you)</span>}
                      </div>
                      {m.name && <div className="text-xs text-muted-foreground">{m.email}</div>}
                    </TableCell>
                    <TableCell>
                      {manageable ? (
                        <ChangeRoleForm userId={m.userId} role={m.role} roles={roles} label={label} />
                      ) : (
                        <Badge variant="secondary">{ROLE_LABELS[m.role]}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(m.joinedAt, active.timezone)}</TableCell>
                    <TableCell className="text-right">
                      {(manageable || isSelf) && <RemoveMemberForm userId={m.userId} label={label} isSelf={isSelf} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations ({invitations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((i) => {
                  const canRevoke = grantable(i.role);
                  return (
                    <TableRow key={i.id} data-testid={`invitation-${i.email}`}>
                      <TableCell>{i.email}</TableCell>
                      <TableCell>{ROLE_LABELS[i.role]}</TableCell>
                      <TableCell>
                        {i.expired ? <Badge variant="destructive">Expired</Badge> : formatDate(i.expiresAt, active.timezone)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canRevoke && <RevokeInvitationForm invitationId={i.id} email={i.email} />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
