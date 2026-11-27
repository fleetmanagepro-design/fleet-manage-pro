"use client";

import {
  BadgeDollarSign,
  Building2,
  CalendarRange,
  Container,
  LayoutDashboard,
  type LucideIcon,
  Package,
  ShieldCheck,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export const NAV_ICONS = {
  dashboard: LayoutDashboard,
  dispatch: CalendarRange,
  loads: Package,
  customers: Building2,
  trucks: Truck,
  trailers: Container,
  drivers: UserRound,
  pay: BadgeDollarSign,
  members: Users,
  roles: ShieldCheck,
} satisfies Record<string, LucideIcon>;

export type NavLinkItem = { href: string; label: string; icon: keyof typeof NAV_ICONS };
export type NavGroup = { title: string | null; items: NavLinkItem[] };

/** The main menu, grouped; the current section is highlighted with a gold bar. */
export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav aria-label="Main" className="flex flex-row flex-wrap gap-x-1 gap-y-4 md:flex-col">
      {groups.map((g) => (
        <div key={g.title ?? "main"} className="flex flex-row flex-wrap gap-0.5 md:flex-col">
          {g.title && (
            <div className="hidden px-3 pb-1 text-[11px] font-semibold tracking-[0.08em] text-sidebar-muted uppercase md:block">{g.title}</div>
          )}
          {g.items.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            const on = current(item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  on ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white",
                )}>
                {on && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-gold" />}
                <Icon aria-hidden className={cn("size-4", on ? "text-gold" : "text-sidebar-muted")} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
