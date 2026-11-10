import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ComplianceList } from "@/components/expiry-badges";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgRole } from "@/lib/auth";
import { formatCalendarDate, todayIn } from "@/lib/dates";
import { driverCompliance, isBlockedFromDriving } from "@/modules/drivers/compliance";
import {
  DeductionForm,
  DeletePayRuleButton,
  DriverArchiveForm,
  EndDeductionButton,
  PayRuleForm,
} from "@/modules/drivers/components/pay-rule-controls";
import { DriverStatusBadge } from "@/modules/drivers/components/status-badge";
import { DRIVER_TYPE_LABELS } from "@/modules/drivers/labels";
import { describeExtras, describePayRule, isRuleLocked, ruleInEffect } from "@/modules/drivers/pay-rules";
import { DRIVER_READERS, canEditDrivers, canViewPay } from "@/modules/drivers/permissions";
import { getDriver, listDeductions, listPayRules } from "@/modules/drivers/queries";
import { formatCents } from "@/lib/money";
import { DetailList, NotBuiltYet, PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Driver · Fleet Manage Pro" };

export default function DriverPage({ params }: PageProps<"/drivers/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <DriverDetail params={params} />
    </Suspense>
  );
}

async function DriverDetail({ params }: Pick<PageProps<"/drivers/[id]">, "params">) {
  const { active } = await requireOrgRole(DRIVER_READERS);
  const id = z.uuid().safeParse((await params).id);
  const driver = id.success ? await getDriver(active.organizationId, id.data) : null;
  if (!driver) notFound();
  const today = todayIn(active.timezone);
  const compliance = driverCompliance(driver, today);
  const archived = !!driver.archived_at;
  const name = `${driver.first_name} ${driver.last_name}`;
  const editable = canEditDrivers(active.role);

  return (
    <div className="grid max-w-5xl gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Link href="/drivers" className="text-sm text-muted-foreground hover:underline">← Drivers</Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {name}
            <DriverStatusBadge status={driver.status} archived={archived} />
          </h1>
          <p className="text-sm text-muted-foreground">{DRIVER_TYPE_LABELS[driver.driver_type]}</p>
        </div>
        {editable && (
          <div className="flex items-start gap-2">
            {!archived && <Link href={`/drivers/${driver.id}/edit`} className={buttonVariants({ variant: "outline" })}>Edit</Link>}
            <DriverArchiveForm id={driver.id} archived={archived} name={name} />
          </div>
        )}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <SectionCard title="Details">
          <DetailList
            rows={[
              ["Phone", driver.phone],
              ["Email", driver.email],
              ["Hire date", driver.hire_date ? formatCalendarDate(driver.hire_date) : null],
              ["CDL", driver.cdl_number ? `${driver.cdl_number} (${driver.cdl_state}${driver.cdl_class ? `, class ${driver.cdl_class}` : ""})` : null],
              ["Default truck", driver.default_truck ? (
                <Link key="truck" href={`/trucks/${driver.default_truck.id}`} className="hover:underline">
                  {driver.default_truck.unit_number}
                </Link>
              ) : null],
              ["Emergency contact", [driver.emergency_contact_name, driver.emergency_contact_phone].filter(Boolean).join(" · ") || null],
              ["Notes", driver.notes],
            ]}
          />
        </SectionCard>

        <SectionCard title="Compliance" description="Warned 60 and 30 days before expiry.">
          <div className="grid gap-3">
            <ComplianceList items={compliance} />
            {isBlockedFromDriving(compliance) && (
              <Badge variant="destructive">Can&apos;t be dispatched until renewed</Badge>
            )}
          </div>
        </SectionCard>

        {canViewPay(active.role) && (
          <SectionCard title="Pay" description="A raise is a new rule with a start date. Rules already in effect are kept as history.">
            <Suspense fallback={<PageLoading />}>
              <PayRules organizationId={active.organizationId} driverId={driver.id} today={today} editable={editable && !archived}
                defaultType={driver.driver_type === "owner_operator" ? "percent" : "per_mile"} />
            </Suspense>
          </SectionCard>
        )}

        {canViewPay(active.role) && (
          <SectionCard title="Deductions" description="Taken off every weekly statement while active: % of the week's gross or a fixed amount per week.">
            <Suspense fallback={<PageLoading />}>
              <Deductions organizationId={active.organizationId} driverId={driver.id} today={today} editable={editable && !archived} />
            </Suspense>
          </SectionCard>
        )}

        <NotBuiltYet title="Loads and pay history">
          Loads driven, miles and calculated pay will appear here once dispatch is built.
        </NotBuiltYet>
      </div>
    </div>
  );
}

async function PayRules({ organizationId, driverId, today, editable, defaultType }: {
  organizationId: string; driverId: string; today: string; editable: boolean; defaultType: "percent" | "per_mile";
}) {
  const rules = await listPayRules(organizationId, driverId);
  const current = ruleInEffect(rules, today);
  return (
    <div className="grid gap-5">
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pay rule yet. Add one so pay can be calculated for this driver&apos;s loads.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From</TableHead>
              <TableHead>Pay</TableHead>
              <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => {
              const locked = isRuleLocked(r, today);
              return (
                <TableRow key={r.id} data-testid={`pay-rule-${r.effective_from}`}>
                  <TableCell className="align-top">
                    {formatCalendarDate(r.effective_from)}
                    <div>
                      {r.id === current?.id && <Badge>Current</Badge>}
                      {!locked && <Badge variant="secondary">Upcoming</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{describePayRule(r)}</div>
                    {describeExtras(r) && <div className="text-xs text-muted-foreground">{describeExtras(r)}</div>}
                    {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    {editable && !locked && <DeletePayRuleButton id={r.id} driverId={driverId} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {editable && <PayRuleForm driverId={driverId} today={today} defaultType={defaultType} />}
    </div>
  );
}

async function Deductions({ organizationId, driverId, today, editable }: {
  organizationId: string; driverId: string; today: string; editable: boolean;
}) {
  const deductions = await listDeductions(organizationId, driverId);
  return (
    <div className="grid gap-5">
      {deductions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No deductions.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deduction</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deductions.map((d) => {
              const ended = d.ends_on !== null && d.ends_on < today;
              return (
                <TableRow key={d.id} data-testid={`deduction-${d.name}`}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.kind === "percent_of_gross" ? `${Number(d.percent)}% of gross` : `${formatCents(d.amount_cents ?? 0)} / week`}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatCalendarDate(d.starts_on)} – {d.ends_on ? formatCalendarDate(d.ends_on) : "ongoing"}
                  </TableCell>
                  <TableCell className="text-right">
                    {editable && !ended && d.ends_on === null && <EndDeductionButton id={d.id} driverId={driverId} name={d.name} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {editable && <DeductionForm driverId={driverId} today={today} />}
    </div>
  );
}
