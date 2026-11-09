import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireOrg } from "@/lib/auth";
import { signOut } from "@/modules/accounts/actions";
import { OrganizationSwitcher } from "@/modules/accounts/components/organization-switcher";
import { ROLE_LABELS, canManageMembers, type OrgRole } from "@/modules/accounts/permissions";
import { canViewDrivers } from "@/modules/drivers/permissions";

type NavItem = { href: string; label: string; visible: (role: OrgRole) => boolean };

/** Only modules that exist are listed; more appear as they are built. */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", visible: () => true },
  { href: "/trucks", label: "Trucks", visible: () => true },
  { href: "/trailers", label: "Trailers", visible: () => true },
  { href: "/drivers", label: "Drivers", visible: canViewDrivers },
  { href: "/settings/members", label: "Members", visible: canManageMembers },
];

export async function AppSidebar() {
  const { user, memberships, active } = await requireOrg();
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="grid gap-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Fleet Manage Pro</span>
        <span className="font-semibold" data-testid="active-org">{active.organizationName}</span>
        <span className="text-xs text-muted-foreground" data-testid="active-role">{ROLE_LABELS[active.role]}</span>
      </div>
      <OrganizationSwitcher memberships={memberships} activeId={active.organizationId} />
      <nav aria-label="Main" className="flex flex-row flex-wrap gap-1 md:flex-col">
        {NAV.filter((item) => item.visible(active.role)).map((item) => (
          <Link key={item.href} href={item.href} className="rounded-md px-2 py-1.5 text-sm hover:bg-muted">
            {item.label}
          </Link>
        ))}
        <Link href="/onboarding" className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted">
          New organization
        </Link>
      </nav>
      <div className="mt-auto grid gap-2">
        <Separator />
        <span className="truncate text-xs text-muted-foreground" title={user.email}>{user.email}</span>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm" className="w-full">Sign out</Button>
        </form>
      </div>
    </div>
  );
}
