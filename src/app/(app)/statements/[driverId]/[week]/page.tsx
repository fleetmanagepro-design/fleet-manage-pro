import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireOrgRole } from "@/lib/auth";
import { addDays, formatCalendarDate, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatInZone } from "@/lib/zoned-time";
import { listMembers } from "@/modules/accounts/queries";
import { finalizeBlockers } from "@/modules/drivers/calculations";
import { StatementTable } from "@/modules/drivers/components/statement";
import { FinalizeStatementForm, PrintButton, VoidStatementForm } from "@/modules/drivers/components/statement-actions";
import { DRIVER_TYPE_LABELS } from "@/modules/drivers/labels";
import { DRIVER_EDITORS } from "@/modules/drivers/permissions";
import { payWeekSchema } from "@/modules/drivers/schemas";
import { getDriverWeekStatement } from "@/modules/drivers/statement-queries";
import { PageLoading } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Pay statement · Fleet Manage Pro" };

export default function StatementPage({ params }: PageProps<"/statements/[driverId]/[week]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <StatementDetail params={params} />
    </Suspense>
  );
}

async function StatementDetail({ params }: Pick<PageProps<"/statements/[driverId]/[week]">, "params">) {
  const { active } = await requireOrgRole(DRIVER_EDITORS);
  const p = await params;
  const driverId = z.uuid().safeParse(p.driverId);
  const week = payWeekSchema.safeParse(p.week);
  if (!driverId.success || !week.success) notFound();
  const tz = active.timezone;
  const s = await getDriverWeekStatement(active.organizationId, driverId.data, week.data, tz);
  if (!s) notFound();
  const members = s.finalized || s.voided.length ? await listMembers(active.organizationId) : [];
  const names = new Map(members.map((m) => [m.userId, m.name ?? m.email]));
  const who = (id: string | null) => (id && names.get(id)) || "a former member";

  const f = s.finalized;
  const totals = f
    ? { grossCents: f.gross_cents, companyFeeCents: f.company_fee_cents, extrasCents: f.extras_cents, deductionsCents: f.deductions_cents, carriedInCents: f.carried_in_cents, netCents: f.net_cents }
    : s.draft;
  const lines = f ? s.lines : s.draft.lines;
  const showFee = s.driver.driver_type === "owner_operator" || totals.companyFeeCents !== 0;
  const blockers = f ? [] : [
    ...finalizeBlockers(s.draft, todayIn(tz)),
    ...(s.laterFinalized ? ["A later week is already finalized. Void it first to finalize this one."] : []),
  ];
  const w = week.data;

  return (
    <div className="grid max-w-4xl gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Link href={`/statements?week=${w}`} className="text-sm text-muted-foreground hover:underline print:hidden">← Driver pay</Link>
          <span className="hidden text-sm font-medium print:block">{active.organizationName}</span>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            Pay statement · {s.driver.first_name} {s.driver.last_name}
            {f ? <Badge data-testid="statement-status">Finalized</Badge> : <Badge variant="secondary" data-testid="statement-status">Draft</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {DRIVER_TYPE_LABELS[s.driver.driver_type]} · week of {formatCalendarDate(w)} – {formatCalendarDate(addDays(w, 6))}
            {f && <> · finalized {formatInZone(f.finalized_at, tz)} by {who(f.finalized_by)}</>}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link href={`/statements/${s.driver.id}/${addDays(w, -7)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>← Week</Link>
          <Link href={`/statements/${s.driver.id}/${addDays(w, 7)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Week →</Link>
          <PrintButton />
        </div>
      </div>

      {!f && (
        <p className="text-sm text-muted-foreground print:hidden">
          Draft — calculated from current loads, pay rules and deductions. Finalizing saves it as it is now.
        </p>
      )}
      {!f && s.draft.pending.length > 0 && (
        <Alert className="print:hidden">
          <AlertDescription>
            Picked up this week but not delivered yet:{" "}
            {s.draft.pending.map((l, i) => (
              <span key={l.loadId}>{i > 0 && ", "}<Link href={`/loads/${l.loadId}`} className="underline">load {l.loadNumber}</Link></span>
            ))}. They are paid on this statement once delivered.
          </AlertDescription>
        </Alert>
      )}
      {!f && s.draft.missingRule.length > 0 && (
        <Alert variant="destructive" className="print:hidden">
          <AlertDescription>
            No pay rule in effect on the pickup day for load {s.draft.missingRule.map((l) => l.loadNumber).join(", ")}.{" "}
            <Link href={`/drivers/${s.driver.id}`} className="underline">Add one on the driver&apos;s page</Link>.
          </AlertDescription>
        </Alert>
      )}

      <StatementTable lines={lines} totals={totals} showFee={showFee} />

      <div className="grid gap-3 border-t pt-4 print:hidden">
        {f ? (
          <VoidStatementForm statementId={f.id} />
        ) : blockers.length ? (
          <ul className="grid gap-1 text-sm text-muted-foreground" data-testid="finalize-blockers">
            {blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        ) : (
          <FinalizeStatementForm driverId={s.driver.id} week={w} net={formatCents(s.draft.netCents)} />
        )}
      </div>

      {s.voided.length > 0 && (
        <section className="grid gap-2 text-sm print:hidden">
          <h2 className="font-medium">Voided statements for this week</h2>
          {s.voided.map((v) => (
            <div key={v.id} className="rounded-lg border p-3" data-testid="voided-statement">
              Net {formatCents(v.net_cents)} · voided {v.voided_at ? formatInZone(v.voided_at, tz) : ""} by {who(v.voided_by)} — {v.void_reason}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
