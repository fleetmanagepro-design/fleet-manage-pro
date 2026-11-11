"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/action-state";
import { finalizeStatement, voidStatement } from "../actions";

export function FinalizeStatementForm({ driverId, week, net }: { driverId: string; week: string; net: string }) {
  const [state, action] = useActionState(finalizeStatement, initialActionState);
  return (
    <form action={action} className="grid justify-items-start gap-2 print:hidden"
      onSubmit={(ev) => { if (!window.confirm(`Finalize this statement (net pay ${net})? It can't be edited afterwards, only voided.`)) ev.preventDefault(); }}>
      <input type="hidden" name="driverId" value={driverId} />
      <input type="hidden" name="week" value={week} />
      <SubmitButton pendingLabel="Finalizing…">Finalize statement</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function VoidStatementForm({ statementId }: { statementId: string }) {
  const [state, action] = useActionState(voidStatement, initialActionState);
  const e = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const v = state.status === "error" ? (state.values ?? {}) : {};
  return (
    <form action={action} className="grid max-w-md justify-items-start gap-2 print:hidden">
      <input type="hidden" name="statementId" value={statementId} />
      <FormField id="voidReason" name="reason" label="Reason for voiding" defaultValue={v.reason} errors={e.reason} />
      <SubmitButton variant="destructive" pendingLabel="Voiding…">Void statement</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
      Print / Save as PDF
    </Button>
  );
}
