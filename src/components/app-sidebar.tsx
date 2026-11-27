import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireOrg } from "@/lib/auth";
import { signOut } from "@/modules/accounts/actions";
import { OrganizationSwitcher } from "@/modules/accounts/components/organization-switcher";
import type { Permission } from "@/lib/permissions";
import { GlobalSearch } from "@/modules/search/components/global-search";

/** `needs`: the permission that opens the page; none = every member. */
type NavItem = { href: string; label: string; needs?: Permission };

/** Only modules that exist are listed; more appear as they are built. */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dispatch", label: "Dispatch board", needs: "loads.view" },
  { href: "/loads", label: "Loads", needs: "loads.view" },
  { href: "/customers", label: "Customers", needs: "customers.view" },
  { href: "/trucks", label: "Trucks", needs: "fleet.view" },
  { href: "/trailers", label: "Trailers", needs: "fleet.view" },
  { href: "/drivers", label: "Drivers", needs: "drivers.view" },
  { href: "/statements", label: "Driver pay", needs: "pay.view" },
  { href: "/settings/members", label: "Members", needs: "members.manage" },
  { href: "/settings/roles", label: "Roles", needs: "members.manage" },
];

export async function AppSidebar() {
  const { user, memberships, active } = await requireOrg();
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="grid gap-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Fleet Manage Pro</span>
        <span className="font-semibold" data-testid="active-org">{active.organizationName}</span>
        <span className="text-xs text-muted-foreground" data-testid="active-role">{active.roleNames.join(", ")}</span>
      </div>
      <OrganizationSwitcher memberships={memberships} activeId={active.organizationId} />
      <GlobalSearch />
      <nav aria-label="Main" className="flex flex-row flex-wrap gap-1 md:flex-col">
        {NAV.filter((item) => !item.needs || active.permissions.has(item.needs)).map((item) => (
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
