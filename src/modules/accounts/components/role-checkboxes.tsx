/** A role the person may pick (or not, when it has permissions they don't have). */
export type RoleChoice = { id: string; name: string; grantable: boolean };

/** Checkboxes named `roleIds`, one per role. Roles that can't be given are shown but disabled. */
export function RoleCheckboxes({ roles, checked, idPrefix }: { roles: RoleChoice[]; checked: readonly string[]; idPrefix: string }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {roles.map((r) => {
        const id = `${idPrefix}-${r.id}`;
        return (
          <label key={r.id} htmlFor={id} className={r.grantable ? "flex items-center gap-2 text-sm" : "flex items-center gap-2 text-sm text-muted-foreground"}>
            <input id={id} type="checkbox" name="roleIds" value={r.id} defaultChecked={checked.includes(r.id)} disabled={!r.grantable}
              className="size-4 accent-primary" />
            {r.name}
          </label>
        );
      })}
    </div>
  );
}
