import Link from "next/link";
import { Suspense } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrg } from "@/lib/auth";
import { CustomerStatusBadge } from "@/modules/customers/components/status-badge";
import {
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPES,
  CUSTOMER_TYPE_LABELS,
  type CustomerStatus,
  type CustomerType,
} from "@/modules/customers/labels";
import { canEditCustomers } from "@/modules/customers/permissions";
import { listCustomers } from "@/modules/customers/queries";
import { sanitizeSearch } from "@/modules/customers/search";
import { PageLoading } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Customers · Fleet Manage Pro" };

export default function CustomersPage({ searchParams }: PageProps<"/customers">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Customers searchParams={searchParams} />
    </Suspense>
  );
}

async function Customers({ searchParams }: Pick<PageProps<"/customers">, "searchParams">) {
  const { active } = await requireOrg();
  const sp = await searchParams;
  const search = sanitizeSearch(sp.q);
  const type = CUSTOMER_TYPES.includes(sp.type as CustomerType) ? (sp.type as CustomerType) : undefined;
  const status = CUSTOMER_STATUSES.includes(sp.status as CustomerStatus) ? (sp.status as CustomerStatus) : undefined;
  const includeArchived = sp.archived === "1";
  const customers = await listCustomers(active.organizationId, { search, type, status, includeArchived });
  const filtered = !!(search || type || status || includeArchived);

  return (
    <div className="grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        {canEditCustomers(active.role) && <Link href="/customers/new" className={buttonVariants()}>Add customer</Link>}
      </div>
      <form method="get" role="search" className="flex flex-wrap items-center gap-3 text-sm">
        <Input name="q" defaultValue={search} placeholder="Search name or MC number" aria-label="Search customers" className="h-7 w-64" />
        <NativeSelect name="type" defaultValue={type ?? ""} aria-label="Filter by type" size="sm" className="min-w-40">
          <NativeSelectOption value="">All types</NativeSelectOption>
          {CUSTOMER_TYPES.map((t) => <NativeSelectOption key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Filter by status" size="sm" className="min-w-40">
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          {CUSTOMER_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{CUSTOMER_STATUS_LABELS[s]}</NativeSelectOption>)}
        </NativeSelect>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} />
          Show archived
        </label>
        <Button type="submit" size="sm" variant="outline">Apply</Button>
      </form>
      <Card>
        <CardContent>
          {customers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {filtered ? "No customers match these filters." : "No customers yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>MC #</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Billing email</TableHead>
                  <TableHead className="text-right">Terms</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id} data-testid={`customer-${c.name}`}>
                    <TableCell className="font-medium">
                      <Link href={`/customers/${c.id}`} className="hover:underline">{c.name}</Link>
                    </TableCell>
                    <TableCell>{CUSTOMER_TYPE_LABELS[c.customer_type]}</TableCell>
                    <TableCell>{c.mc_number ?? "—"}</TableCell>
                    <TableCell>{[c.city, c.state].filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell>{c.billing_email ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">Net {c.payment_terms_days}</TableCell>
                    <TableCell><CustomerStatusBadge status={c.status} archived={!!c.archived_at} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
