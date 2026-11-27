import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { NavLinks, type NavGroup, type NavLinkItem } from "@/components/nav-links";
import { requireOrg } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { signOut } from "@/modules/accounts/actions";
import { OrganizationSwitcher } from "@/modules/accounts/components/organization-switcher";
import { GlobalSearch } from "@/modules/search/components/global-search";

/** `needs`: the permission that opens the page; none = every member. */
type NavItem = NavLinkItem & { needs?: Permission };

/** Only modules that exist are listed; more appear as they are built. */
const NAV: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }] },
  {
    title: "Operations",
    items: [
      { href: "/dispatch", label: "Dispatch board", icon: "dispatch", needs: "loads.view" },
      { href: "/loads", label: "Loads", icon: "loads", needs: "loads.view" },
      { href: "/customers", label: "Customers", icon: "customers", needs: "customers.view" },
    ],
  },
  {
    title: "Fleet",
    items: [
      { href: "/trucks", label: "Trucks", icon: "trucks", needs: "fleet.view" },
      { href: "/trailers", label: "Trailers", icon: "trailers", needs: "fleet.view" },
      { href: "/drivers", label: "Drivers", icon: "drivers", needs: "drivers.view" },
    ],
  },
  { title: "Finance", items: [{ href: "/statements", label: "Driver pay", icon: "pay", needs: "pay.view" }] },
  {
    title: "Settings",
    items: [
      { href: "/settings/members", label: "Members", icon: "members", needs: "members.manage" },
      { href: "/settings/roles", label: "Roles", icon: "roles", needs: "members.manage" },
    ],
  },
];

export async function AppSidebar() {
  const { user, memberships, active } = await requireOrg();
  const groups: NavGroup[] = NAV.map((g) => ({
    title: g.title,
    items: g.items.filter((i) => !i.needs || active.permissions.has(i.needs)).map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full flex-col gap-5 p-4 text-sidebar-foreground">
      <Link href="/dashboard" className="px-1"><BrandLogo onDark /></Link>
      <div className="grid gap-0.5 rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-3 py-2.5">
        <span className="truncate text-sm font-semibold text-white" data-testid="active-org">{active.organizationName}</span>
        <span className="truncate text-xs text-gold" data-testid="active-role">{active.roleNames.join(", ")}</span>
      </div>
      <OrganizationSwitcher memberships={memberships} activeId={active.organizationId} />
      <GlobalSearch />
      <NavLinks groups={groups} />
      <div className="mt-auto grid gap-1 border-t border-sidebar-border pt-3">
        <Link href="/onboarding" className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-white">
          <Plus aria-hidden className="size-4" /> New organization
        </Link>
        <div className="grid gap-1 px-3 pt-1">
          <span className="truncate text-xs text-sidebar-muted" title={user.email}>{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap text-sidebar-foreground hover:bg-sidebar-accent hover:text-white">
              <LogOut aria-hidden className="size-3.5" /> Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
