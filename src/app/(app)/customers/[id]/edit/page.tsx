import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireOrgRole } from "@/lib/auth";
import { CustomerForm } from "@/modules/customers/components/customer-form";
import { CUSTOMER_EDITORS } from "@/modules/customers/permissions";
import { getCustomer } from "@/modules/customers/queries";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Edit customer · Fleet Manage Pro" };

export default function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditCustomer params={params} />
    </Suspense>
  );
}

async function EditCustomer({ params }: Pick<PageProps<"/customers/[id]/edit">, "params">) {
  const { active } = await requireOrgRole(CUSTOMER_EDITORS);
  const id = z.uuid().safeParse((await params).id);
  const customer = id.success ? await getCustomer(active.organizationId, id.data) : null;
  if (!customer) notFound();
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Edit {customer.name}</h1>
      <SectionCard title="Customer details">
        <CustomerForm customer={customer} />
      </SectionCard>
    </div>
  );
}
