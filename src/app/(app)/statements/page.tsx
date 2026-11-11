import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgRole } from "@/lib/auth";
import { addDays, formatCalendarDate, mondayOf, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { DRIVER_TYPE_LABELS } from "@/modules/drivers/labels";
import { DRIVER_EDITORS } from "@/modules/drivers/permissions";
import { type WeekRow, listWeekStatements } from "@/modules/drivers/statement-queries";
import { pickPayWeek } from "@/modules/drivers/statement-week";
import { PageLoading } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Driver pay · Fleet Manage Pro" };

export default function StatementsPage({ searchParams }: PageProps<"/statements">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Statements searchParams={searchParams} />
    </Suspense>
  );
}

function StatusBadge({ row }: { row: WeekRow }) {
  if (row.finalized) return <Badge>Finalized</Badge>;
  if (row.draft.pending.length) return <Badge variant="outline">{row.draft.pending.length} not delivered</Badge>;
  if (row.draft.missingRule.length) return <Badge variant="destructive">No pay rule</Badge>;
  return <Badge variant="secondary">Draft</Badge>;
}

async function Statements({ searchParams }: Pick<PageProps<"/statements">, "searchParams">) {
  const { active } = await requireOrgRole(DRIVER_EDITORS);
  const today = todayIn(active.timezone);
  const week = pickPayWeek((await searchParams).week, today);
  const rows = await listWeekStatements(active.organizationId, week, active.timezone);
  const net = (r: WeekRow) => r.finalized?.net_cents ?? r.draft.netCents;
  const gross = (r: WeekRow) => r.finalized?.gross_cents ?? r.draft.grossCents;

  return (
    <div className="grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Driver pay</h1>
          <p className="text-sm text-muted-foreground" data-testid="pay-week">
            Week of {formatCalendarDate(week)} – {formatCalendarDate(addDays(week, 6))} · loads count in the week they were picked up
          </p>
        </div>
        <nav aria-label="Week" className="flex gap-2">
          <Link href={`/statements?week=${addDays(week, -7)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>← Previous week</Link>
          <Link href="/statements" className={buttonVariants({ variant: "outline", size: "sm" })}>Last week</Link>
          <Link href={`/statements?week=${addDays(week, 7)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Next week →</Link>
        </nav>
      </div>
      {week >= mondayOf(today) && (
        <p className="text-sm text-muted-foreground">This week isn&apos;t over yet — amounts can still change.</p>
      )}
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No loads, deductions or balances for any driver this week.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Loads</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net pay</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.driver.id} data-testid={`pay-row-${r.driver.last_name}`}>
                    <TableCell>
                      <Link href={`/statements/${r.driver.id}/${week}`} className="font-medium hover:underline">
                        {r.driver.first_name} {r.driver.last_name}
                      </Link>
                    </TableCell>
                    <TableCell>{DRIVER_TYPE_LABELS[r.driver.driver_type]}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.finalized?.load_count ?? r.draft.loadCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(gross(r))}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums" data-testid="pay-net">{formatCents(net(r))}</TableCell>
                    <TableCell><StatusBadge row={r} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4}>To pay this week <span className="text-xs text-muted-foreground">(negative balances carry over)</span></TableCell>
                  <TableCell className="text-right font-medium tabular-nums" data-testid="pay-total">{formatCents(rows.reduce((s, r) => s + Math.max(0, net(r)), 0))}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
