import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrg } from "@/lib/auth";
import { AddContactForm, CustomerArchiveForm, RemoveContactButton } from "@/modules/customers/components/customer-controls";
import { CustomerStatusBadge } from "@/modules/customers/components/status-badge";
import { CUSTOMER_TYPE_LABELS } from "@/modules/customers/labels";
import { canEditCustomers } from "@/modules/customers/permissions";
import { getCustomer, listContacts } from "@/modules/customers/queries";
import { DetailList, NotBuiltYet, PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Customer · Fleet Manage Pro" };

export default function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <CustomerDetail params={params} />
    </Suspense>
  );
}

async function CustomerDetail({ params }: Pick<PageProps<"/customers/[id]">, "params">) {
  const { active } = await requireOrg();
  const id = z.uuid().safeParse((await params).id);
  const customer = id.success ? await getCustomer(active.organizationId, id.data) : null;
  if (!customer) notFound();
  const editable = canEditCustomers(active.role);
  const archived = !!customer.archived_at;
  const address = [customer.address_line1, [customer.city, customer.state].filter(Boolean).join(", "), customer.zip]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid max-w-5xl gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Link href="/customers" className="text-sm text-muted-foreground hover:underline">← Customers</Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {customer.name}
            <CustomerStatusBadge status={customer.status} archived={archived} />
          </h1>
          <p className="text-sm text-muted-foreground">{CUSTOMER_TYPE_LABELS[customer.customer_type]}</p>
        </div>
        {editable && (
          <div className="flex items-start gap-2">
            {!archived && <Link href={`/customers/${customer.id}/edit`} className={buttonVariants({ variant: "outline" })}>Edit</Link>}
            <CustomerArchiveForm id={customer.id} archived={archived} name={customer.name} />
          </div>
        )}
      </div>

      {customer.status === "do_not_use" && (
        <Alert variant="destructive">
          <AlertTitle>Do not use this customer</AlertTitle>
          <AlertDescription>{customer.do_not_use_reason}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <SectionCard title="Details">
          <DetailList
            rows={[
              ["MC number", customer.mc_number],
              ["Payment terms", `Net ${customer.payment_terms_days} days`],
              ["Billing email", customer.billing_email ? <a key="mail" href={`mailto:${customer.billing_email}`} className="hover:underline">{customer.billing_email}</a> : null],
              ["Phone", customer.phone],
              ["Address", address || null],
              ["Notes", customer.notes],
            ]}
          />
        </SectionCard>

        <SectionCard title="Contacts">
          <Suspense fallback={<PageLoading />}>
            <Contacts organizationId={active.organizationId} customerId={customer.id} editable={editable && !archived} />
          </Suspense>
        </SectionCard>

        <NotBuiltYet title="Loads and lanes">
          Loads, revenue, RPM and lanes for this customer will appear here once dispatch is built.
        </NotBuiltYet>
        <NotBuiltYet title="Invoices and payments">
          Open invoices, payment history and average days to pay will appear here once invoicing is built.
        </NotBuiltYet>
      </div>
    </div>
  );
}

async function Contacts({ organizationId, customerId, editable }: { organizationId: string; customerId: string; editable: boolean }) {
  const contacts = await listContacts(organizationId, customerId);
  return (
    <div className="grid gap-5">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contacts yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email / phone</TableHead>
              <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((c) => (
              <TableRow key={c.id} data-testid={`contact-${c.name}`}>
                <TableCell className="align-top">
                  <div className="font-medium">{c.name}</div>
                  {c.role && <div className="text-xs text-muted-foreground">{c.role}</div>}
                </TableCell>
                <TableCell className="align-top">
                  {c.email && <div><a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a></div>}
                  {c.phone && <div><a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a></div>}
                </TableCell>
                <TableCell className="text-right align-top">
                  {editable && <RemoveContactButton id={c.id} customerId={customerId} name={c.name} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editable && <AddContactForm customerId={customerId} />}
    </div>
  );
}
