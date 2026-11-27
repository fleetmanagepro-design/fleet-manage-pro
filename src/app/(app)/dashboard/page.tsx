import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireOrg } from "@/lib/auth";
import { addDays, todayIn } from "@/lib/dates";
import { formatMiles } from "@/lib/miles";
import { formatCents } from "@/lib/money";
import { formatInZone, zonedLocalToUtc } from "@/lib/zoned-time";
import { cn } from "@/lib/utils";
import { PERIODS, PERIOD_LABELS, dashboardPeriod, granularityFor, summarize, topAndBottom } from "@/modules/analytics/calculations";
import { HBars } from "@/modules/analytics/components/bars";
import { RevenueChart } from "@/modules/analytics/components/revenue-chart";
import { OPEN_STATUSES, deliveredLoads, describeDue, expiringItems, openLoads } from "@/modules/analytics/queries";
import { LoadStatusBadge } from "@/modules/dispatch/components/status-badge";
import { LOAD_STATUS_LABELS } from "@/modules/dispatch/labels";
import { canSeeDashboardPay, canViewDrivers } from "@/modules/drivers/permissions";

export const metadata = { title: "Dashboard · Fleet Manage Pro" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

function Tile({ label, value, sub, href, testId }: { label: string; value: string; sub?: string; href?: string; testId: string }) {
  const body = (
    <Card className={cn("h-full gap-1 py-4", href && "transition-colors hover:bg-muted/40")}>
      <CardContent className="grid gap-1 px-4">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className="text-xl font-semibold tracking-tight whitespace-nowrap tabular-nums" data-testid={testId}>{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

async function Dashboard({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const { active } = await requireOrg();
  const sp = await searchParams;
  const tz = active.timezone;
  const today = todayIn(tz);
  const period = dashboardPeriod(sp.period, sp.from, sp.to, today);
  const showPay = canSeeDashboardPay(active.permissions);
  const [delivered, open, expiring] = await Promise.all([
    deliveredLoads(active.organizationId, period, tz, showPay),
    openLoads(active.organizationId),
    expiringItems(active.organizationId, today, canViewDrivers(active.permissions)),
  ]);
  const s = summarize(delivered, period);
  const { top, bottom } = topAndBottom(s.trucks);
  const loadsHref = `/loads?status=delivered`;
  const inProgress = open.filter((l) => l.status !== "planned");
  // pickups before the start of the 8th day from today (company time)
  const weekAhead = zonedLocalToUtc(`${addDays(today, 8)}T00:00`, tz);
  const unassigned = open.filter((l) => l.status === "planned" && !l.truck && (!l.pickupAt || l.pickupAt < weekAhead));
  const pickup = (l: (typeof open)[number]) => (l.pickupAt && l.pickupTz ? formatInZone(l.pickupAt, l.pickupTz) : "No appointment");

  return (
    <div className="grid max-w-6xl gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{active.organizationName}</h1>
          <p className="text-sm text-muted-foreground" data-testid="dashboard-period">
            {PERIOD_LABELS[period.key]} · {period.label} · delivered loads, company time
          </p>
        </div>
        <nav aria-label="Period" className="flex flex-wrap items-center gap-1">
          {PERIODS.filter((p) => p !== "custom").map((p) => (
            <Link key={p} href={p === "month" ? "/dashboard" : `/dashboard?period=${p}`} aria-current={period.key === p ? "page" : undefined}
              className={buttonVariants({ variant: period.key === p ? "default" : "outline", size: "sm" })}>
              {PERIOD_LABELS[p]}
            </Link>
          ))}
        </nav>
      </div>
      <form method="get" className="flex flex-wrap items-center gap-2 text-sm" aria-label="Custom period">
        <input type="hidden" name="period" value="custom" />
        <span className="text-muted-foreground">Custom</span>
        <Input name="from" type="date" defaultValue={period.key === "custom" ? period.from : ""} aria-label="Period from" className="h-7 w-36" />
        <span className="text-muted-foreground">to</span>
        <Input name="to" type="date" defaultValue={period.key === "custom" ? period.to : ""} aria-label="Period to" className="h-7 w-36" />
        <Button type="submit" size="sm" variant="outline">Show</Button>
      </form>

      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", showPay ? "2xl:grid-cols-7" : "xl:grid-cols-5")}>
        <Tile label="Revenue" value={formatCents(s.revenueCents)} sub="load value delivered" href={loadsHref} testId="tile-revenue" />
        <Tile label="Loads delivered" value={String(s.loadsDelivered)} href={loadsHref} testId="tile-loads" />
        <Tile label="Total miles" value={formatMiles(s.miles)} sub={`${formatMiles(s.loadedMiles)} loaded`} testId="tile-miles" />
        <Tile label="RPM" value={s.rpmCents === null ? "—" : `${formatCents(s.rpmCents)}/mi`} sub="revenue per mile" testId="tile-rpm" />
        <Tile label="Empty miles" value={s.emptyPercent === null ? "—" : `${s.emptyPercent}%`} sub="deadhead share" testId="tile-empty" />
        {showPay && (
          <>
            <Tile label="Driver pay" value={s.driverPayCents === null ? "—" : formatCents(s.driverPayCents)}
              sub={s.driverPayCents === null ? "a load's driver has no pay rule" : "on these loads"} href="/statements" testId="tile-pay" />
            <Tile label="Contribution" value={s.contributionCents === null ? "—" : formatCents(s.contributionCents)}
              sub="revenue − driver pay" testId="tile-contribution" />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>Per {granularityFor(period)} · hover a bar for details</CardDescription>
        </CardHeader>
        <CardContent>
          {s.loadsDelivered === 0
            ? <p className="py-10 text-center text-sm text-muted-foreground">No loads delivered in this period.</p>
            : <RevenueChart points={s.series} />}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open loads</CardTitle>
            <CardDescription>Not delivered yet, by status</CardDescription>
          </CardHeader>
          <CardContent>
            <HBars rows={OPEN_STATUSES.map((st) => ({
              key: st, label: LOAD_STATUS_LABELS[st], value: open.filter((l) => l.status === st).length, href: `/loads?status=${st}`,
            }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Expiring in 30 days</CardTitle>
            <CardDescription>CDL, medical card, registration, inspection, insurance and documents</CardDescription>
          </CardHeader>
          <CardContent>
            {expiring.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing expires in the next 30 days.</p>
            ) : (
              <ul className="grid max-h-72 gap-1.5 overflow-auto text-sm" data-testid="expiring-list">
                {expiring.slice(0, 25).map((i) => (
                  <li key={i.key} className="flex items-center justify-between gap-3">
                    <Link href={i.href} className="truncate hover:underline">{i.name} · {i.what}</Link>
                    {i.state === "expired"
                      ? <Badge variant="destructive">⚠ {describeDue(i)}</Badge>
                      : <Badge variant="outline">◷ {describeDue(i)}</Badge>}
                  </li>
                ))}
                {expiring.length > 25 && <li className="text-xs text-muted-foreground">and {expiring.length - 25} more</li>}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top trucks</CardTitle>
            <CardDescription>By revenue in the period (by profit once expenses exist)</CardDescription>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? <p className="text-sm text-muted-foreground">No deliveries yet.</p> : (
              <HBars format={formatCents} rows={top.map((t) => ({
                key: `top-${t.unit}`, label: `Truck ${t.unit}`, value: t.revenueCents, href: `/trucks/${t.id}`,
                sub: `${t.loads} ${t.loads === 1 ? "load" : "loads"} · ${t.rpmCents === null ? "—" : `${formatCents(t.rpmCents)}/mi`}`,
              }))} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lowest trucks</CardTitle>
            <CardDescription>Trucks with deliveries in the period, lowest revenue first</CardDescription>
          </CardHeader>
          <CardContent>
            {bottom.length === 0 ? <p className="text-sm text-muted-foreground">Fewer than six trucks delivered in this period.</p> : (
              <HBars format={formatCents} rows={bottom.map((t) => ({
                key: `low-${t.unit}`, label: `Truck ${t.unit}`, value: t.revenueCents, href: `/trucks/${t.id}`,
                sub: `${t.loads} ${t.loads === 1 ? "load" : "loads"} · ${t.rpmCents === null ? "—" : `${formatCents(t.rpmCents)}/mi`}`,
              }))} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Loads in progress ({inProgress.length})</CardTitle>
            <CardDescription>Dispatched, at pickup or in transit</CardDescription>
          </CardHeader>
          <CardContent>
            {inProgress.length === 0 ? <p className="text-sm text-muted-foreground">No loads on the road.</p> : (
              <ul className="grid gap-2 text-sm" data-testid="in-progress">
                {inProgress.slice(0, 8).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                    <span className="grid">
                      <Link href={`/loads/${l.id}`} className="font-medium hover:underline">Load {l.load_number}</Link>
                      <span className="text-xs text-muted-foreground">{l.route} · {[l.truck && `Truck ${l.truck}`, l.driver].filter(Boolean).join(" · ")}</span>
                    </span>
                    <LoadStatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unassigned, next 7 days ({unassigned.length})</CardTitle>
            <CardDescription>Planned loads without a truck</CardDescription>
          </CardHeader>
          <CardContent>
            {unassigned.length === 0 ? <p className="text-sm text-muted-foreground">Every upcoming load has a truck.</p> : (
              <ul className="grid gap-2 text-sm" data-testid="unassigned">
                {unassigned.slice(0, 8).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                    <span className="grid">
                      <Link href={`/loads/${l.id}`} className="font-medium hover:underline">Load {l.load_number}</Link>
                      <span className="text-xs text-muted-foreground">{l.route}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{pickup(l)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/dispatch" className="mt-3 inline-block text-xs underline">Assign on the dispatch board →</Link>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Coming with the next modules</CardTitle>
          <CardDescription>
            Costs, profit, margin and CPM come with expenses · open receivables with invoicing · maintenance due with maintenance.
            They aren&apos;t shown until the data exists.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
