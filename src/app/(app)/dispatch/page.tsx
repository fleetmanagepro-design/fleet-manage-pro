import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth";
import { formatCalendarDate, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatInZone, zonedLocalToUtc } from "@/lib/zoned-time";
import { addDays, boardDays, boardStart } from "@/modules/dispatch/board";
import { loadRevenueCents } from "@/modules/dispatch/calculations";
import { AssignForm } from "@/modules/dispatch/components/assign-form";
import { DispatchBoard } from "@/modules/dispatch/components/board";
import { LoadStatusBadge } from "@/modules/dispatch/components/status-badge";
import { boardData, loadFormOptions } from "@/modules/dispatch/queries";
import { canEditLoads, canOverrideOverlap } from "@/modules/dispatch/status";
import { PageLoading } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Dispatch board · Fleet Manage Pro" };

export default function DispatchPage({ searchParams }: PageProps<"/dispatch">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}

async function Board({ searchParams }: Pick<PageProps<"/dispatch">, "searchParams">) {
  const { active } = await requireOrg();
  const sp = await searchParams;
  const tz = active.timezone;
  const today = todayIn(tz);
  const start = boardStart(typeof sp.start === "string" ? sp.start : undefined, today);
  const days = boardDays(start);
  const fromIso = zonedLocalToUtc(`${days[0]}T00:00`, tz);
  const toIso = zonedLocalToUtc(`${addDays(days[days.length - 1], 1)}T00:00`, tz);
  const editable = canEditLoads(active.role);
  const [data, options] = await Promise.all([
    boardData(active.organizationId, fromIso, toIso),
    editable ? loadFormOptions(active.organizationId) : Promise.resolve(null),
  ]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dispatch board</h1>
          <p className="text-sm text-muted-foreground">
            {formatCalendarDate(days[0])} – {formatCalendarDate(days[days.length - 1])} · days in company time
          </p>
        </div>
        <nav aria-label="Week" className="flex gap-2">
          <Link href={`/dispatch?start=${addDays(start, -7)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>← Previous week</Link>
          <Link href="/dispatch" className={buttonVariants({ variant: "outline", size: "sm" })}>Today</Link>
          <Link href={`/dispatch?start=${addDays(start, 7)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Next week →</Link>
          {editable && <Link href="/loads/new" className={buttonVariants({ size: "sm" })}>New load</Link>}
        </nav>
      </div>

      <DispatchBoard days={days} today={today} timeZone={tz} trucks={data.trucks} loads={data.loads} />

      <Card>
        <CardHeader>
          <CardTitle>Unassigned loads ({data.unassigned.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.unassigned.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every open load has a truck.</p>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {data.unassigned.map((l) => {
                const pickup = l.stops.find((s) => s.stop_type === "pickup");
                const delivery = l.stops.findLast((s) => s.stop_type === "delivery");
                return (
                  <li key={l.id} className="grid gap-3 rounded-lg border p-3" data-testid={`unassigned-${l.load_number}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <Link href={`/loads/${l.id}`} className="font-semibold hover:underline">Load {l.load_number}</Link>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{formatCents(loadRevenueCents(l, l.accessorials))}</span>
                        <LoadStatusBadge status={l.status} />
                      </span>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground">{l.customer?.name}</div>
                      <div>
                        {pickup ? `${pickup.city}, ${pickup.state}` : "—"} → {delivery ? `${delivery.city}, ${delivery.state}` : "—"}
                      </div>
                      {pickup?.appointment_start && (
                        <div className="text-xs text-muted-foreground">Pickup {formatInZone(pickup.appointment_start, pickup.timezone)}</div>
                      )}
                    </div>
                    {options && (
                      <AssignForm loadId={l.id} loadNumber={l.load_number} options={options} today={today}
                        canOverride={canOverrideOverlap(active.role)} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
