import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate, formatDate } from "@/lib/dates";
import { formatMiles } from "@/lib/miles";
import { ASSET_STATUSES, METER_LABELS, STATUS_LABELS, type AssetStatus } from "../labels";
import type { MeterReading } from "../queries";

export const ASSET_TABS = [
  { key: "overview", label: "Overview" },
  { key: "loads", label: "Loads" },
  { key: "expenses", label: "Expenses" },
  { key: "maintenance", label: "Maintenance" },
  { key: "documents", label: "Documents" },
] as const;
export type AssetTab = (typeof ASSET_TABS)[number]["key"];

export function parseTab(value: string | string[] | undefined): AssetTab {
  return ASSET_TABS.some((t) => t.key === value) ? (value as AssetTab) : "overview";
}

export function parseStatusFilter(value: string | string[] | undefined): AssetStatus | undefined {
  return ASSET_STATUSES.includes(value as AssetStatus) ? (value as AssetStatus) : undefined;
}

export function AssetTabs({ basePath, current }: { basePath: string; current: AssetTab }) {
  return (
    <nav aria-label="Sections" className="flex flex-wrap gap-1 border-b">
      {ASSET_TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === "overview" ? basePath : `${basePath}?tab=${t.key}`}
          aria-current={t.key === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            t.key === current ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Honest placeholder for parts of the product that don't exist yet (CLAUDE.md rule 14). */
export function NotBuiltYet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title} — not built yet</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function ListFilters({ status, includeArchived }: { status?: AssetStatus; includeArchived: boolean }) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-3 text-sm" role="search">
      <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Filter by status" size="sm" className="min-w-40">
        <NativeSelectOption value="">All statuses</NativeSelectOption>
        {ASSET_STATUSES.map((s) => (
          <NativeSelectOption key={s} value={s}>{STATUS_LABELS[s]}</NativeSelectOption>
        ))}
      </NativeSelect>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} />
        Show archived
      </label>
      <Button type="submit" size="sm" variant="outline">Apply</Button>
    </form>
  );
}

export function DetailList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReadingHistory({ readings, timeZone }: { readings: MeterReading[]; timeZone: string }) {
  if (readings.length === 0) return <p className="text-sm text-muted-foreground">No readings yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Meter</TableHead>
          <TableHead className="text-right">Reading</TableHead>
          <TableHead>Note</TableHead>
          <TableHead>Recorded</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {readings.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{formatCalendarDate(r.read_on)}</TableCell>
            <TableCell>{METER_LABELS[r.reading_type].label}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMiles(r.reading)} {METER_LABELS[r.reading_type].unit}
            </TableCell>
            <TableCell>
              {r.is_correction && <span className="mr-1 font-medium text-amber-700 dark:text-amber-400">Correction:</span>}
              {r.note}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(r.created_at, timeZone)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function PageLoading() {
  return <p className="text-sm text-muted-foreground">Loading…</p>;
}

export function SectionCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
