import { formatMiles } from "@/lib/miles";
import { formatCents } from "@/lib/money";
import type { StatementLine } from "../calculations";

type Totals = {
  grossCents: number; companyFeeCents: number; extrasCents: number; deductionsCents: number; carriedInCents: number; netCents: number;
};

const money = (c: number | null) => (c === null ? "" : formatCents(c));

/** A pay statement: loads, extras, deductions, balance carried in, and the totals. Same layout for drafts and finalized ones. */
export function StatementTable({ lines, totals, showFee }: { lines: readonly StatementLine[]; totals: Totals; showFee: boolean }) {
  const loads = lines.filter((l) => l.line_type === "load");
  const extras = lines.filter((l) => l.line_type === "extra");
  const deductions = lines.filter((l) => l.line_type === "deduction");
  const carry = lines.filter((l) => l.line_type === "carryover");

  return (
    <div className="grid gap-5 text-sm">
      <section className="overflow-x-auto">
        <h2 className="mb-2 font-medium">Loads</h2>
        {loads.length === 0 ? (
          <p className="text-muted-foreground">No delivered loads picked up this week.</p>
        ) : (
          <table className="w-full min-w-[34rem] tabular-nums">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">Load</th>
                <th className="py-1 text-right font-normal">{showFee ? "Load value" : "Miles"}</th>
                {showFee && <th className="py-1 text-right font-normal">Company fee</th>}
                <th className="py-1 text-right font-normal">Driver</th>
              </tr>
            </thead>
            <tbody>
              {loads.map((l, i) => (
                <tr key={i} className="border-t" data-testid="statement-load">
                  <td className="py-1.5">
                    <div>{l.description}</div>
                    {l.detail && <div className="text-xs text-muted-foreground">{l.detail}</div>}
                  </td>
                  <td className="py-1.5 text-right">{showFee ? money(l.value_cents) : l.miles === null ? "" : `${formatMiles(l.miles)} mi`}</td>
                  {showFee && <td className="py-1.5 text-right">{l.fee_cents === null ? "" : formatCents(-l.fee_cents)}</td>}
                  <td className="py-1.5 text-right">{formatCents(l.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {extras.length > 0 && (
        <Section title="Driver extras" note="Paid in full, no company fee">
          {extras.map((l, i) => <Row key={i} label={l.description} amount={l.amount_cents} testId="statement-extra" />)}
        </Section>
      )}

      {deductions.length > 0 && (
        <Section title="Deductions">
          {deductions.map((l, i) => (
            <Row key={i} label={l.description} amount={l.amount_cents} testId={`statement-deduction-${l.description}`}
              detail={l.value_cents !== null ? `${l.detail} (${formatCents(l.value_cents)})` : l.detail} />
          ))}
        </Section>
      )}

      {carry.length > 0 && (
        <Section title="Balance carried in">
          {carry.map((l, i) => <Row key={i} label={l.description} amount={l.amount_cents} testId="statement-carryover" />)}
        </Section>
      )}

      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-t pt-3 tabular-nums">
        <dt>Gross{showFee ? " (load value)" : " (mileage pay)"}</dt><dd className="text-right" data-testid="statement-gross">{formatCents(totals.grossCents)}</dd>
        {showFee && (<><dt>Company fee</dt><dd className="text-right">{formatCents(-totals.companyFeeCents)}</dd></>)}
        {totals.extrasCents !== 0 && (<><dt>Driver extras</dt><dd className="text-right">{formatCents(totals.extrasCents)}</dd></>)}
        {totals.deductionsCents !== 0 && (<><dt>Deductions</dt><dd className="text-right">{formatCents(-totals.deductionsCents)}</dd></>)}
        {totals.carriedInCents !== 0 && (<><dt>Balance carried in</dt><dd className="text-right">{formatCents(totals.carriedInCents)}</dd></>)}
        <dt className="text-base font-semibold">Net pay</dt>
        <dd className="text-right text-base font-semibold" data-testid="statement-net">{formatCents(totals.netCents)}</dd>
      </dl>
      {totals.netCents < 0 && (
        <p className="text-xs text-muted-foreground" data-testid="statement-debt-note">
          Deductions are larger than earnings. The {formatCents(-totals.netCents)} balance is carried into the next statement.
        </p>
      )}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-1">
      <h2 className="font-medium">{title}{note && <span className="ml-2 text-xs font-normal text-muted-foreground">{note}</span>}</h2>
      {children}
    </section>
  );
}

function Row({ label, amount, detail, testId }: { label: string; amount: number; detail?: string | null; testId: string }) {
  return (
    <div className="flex justify-between gap-4 border-t py-1.5 tabular-nums" data-testid={testId}>
      <span>{label}{detail && <span className="ml-2 text-xs text-muted-foreground">{detail}</span>}</span>
      <span>{formatCents(amount)}</span>
    </div>
  );
}
