"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import type { Permission } from "@/lib/permissions";
import { createRole, deleteRole, resetRole, updateRole } from "../actions";
import { groupByArea, missingRequirement, togglePermission, type CatalogEntry } from "../roles";

type Props = {
  catalog: CatalogEntry[];
  /** The permissions of the person editing: they can't tick anything beyond these. */
  mine: Permission[];
  role?: { id: string; name: string; description: string | null; permissions: Permission[]; builtIn: boolean };
};

/** Create or edit a role by ticking permissions. Ticking one also ticks what it needs. */
export function RoleForm({ catalog, mine, role }: Props) {
  const [state, action] = useActionState(role ? updateRole : createRole, initialActionState);
  const [selected, setSelected] = useState<Set<Permission>>(() => new Set(role?.permissions ?? []));
  const own = new Set(mine);
  const e = state.fieldErrors ?? {};
  const missing = missingRequirement(selected, catalog);

  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      {role && <input type="hidden" name="roleId" value={role.id} />}
      {role?.builtIn ? (
        <input type="hidden" name="name" value={role.name} />
      ) : (
        <FormField id="name" label="Role name" required maxLength={60} defaultValue={state.values?.name ?? role?.name} errors={e.name} />
      )}
      <div className="grid gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">Description (optional)</label>
        <Textarea id="description" name="description" maxLength={300} defaultValue={state.values?.description ?? role?.description ?? ""} />
      </div>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-medium">Permissions</legend>
        {groupByArea(catalog).map((g) => (
          <div key={g.area} className="grid gap-1.5">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.area}</div>
            {g.entries.map((p) => {
              const allowed = own.has(p.key);
              const id = `perm-${p.key}`;
              return (
                <label key={p.key} htmlFor={id} className={allowed ? "flex items-start gap-2 text-sm" : "flex items-start gap-2 text-sm text-muted-foreground"}>
                  <input id={id} type="checkbox" name="permissions" value={p.key} className="mt-0.5 size-4 accent-primary"
                    checked={selected.has(p.key)} disabled={!allowed}
                    onChange={(ev) => setSelected((s) => togglePermission(s, p.key, ev.target.checked, catalog))} />
                  <span>
                    {p.label}
                    {p.description && <span className="block text-xs text-muted-foreground">{p.description}</span>}
                    {!allowed && <span className="block text-xs">You don&apos;t have this permission, so you can&apos;t give it.</span>}
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </fieldset>
      {/* A permission someone else ticked may need one this editor can't give. */}
      {missing && (
        <p role="alert" className="text-sm text-destructive">
          &quot;{missing.permission.label}&quot; needs &quot;{missing.needs.label}&quot;.
        </p>
      )}
      <div>
        <SubmitButton pendingLabel="Saving…">{role ? "Save role" : "Create role"}</SubmitButton>
      </div>
    </form>
  );
}

/** Reset a built-in role, or delete a role the company made. */
export function RoleDangerButtons({ roleId, builtIn, inUse }: { roleId: string; builtIn: boolean; inUse: boolean }) {
  const [state, action] = useActionState(builtIn ? resetRole : deleteRole, initialActionState);
  return (
    <form action={action} className="grid gap-2"
      onSubmit={(ev) => {
        const q = builtIn ? "Put this role back to its default permissions?" : "Delete this role?";
        if (!window.confirm(q)) ev.preventDefault();
      }}>
      <input type="hidden" name="roleId" value={roleId} />
      <div className="flex items-center gap-3">
        <SubmitButton variant={builtIn ? "outline" : "destructive"} disabled={!builtIn && inUse}
          pendingLabel={builtIn ? "Resetting…" : "Deleting…"}>
          {builtIn ? "Reset to default" : "Delete role"}
        </SubmitButton>
        {!builtIn && inUse && <span className="text-xs text-muted-foreground">Take this role away from everyone to delete it.</span>}
      </div>
      <FormMessage state={state} />
    </form>
  );
}
