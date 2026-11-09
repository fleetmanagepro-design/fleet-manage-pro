import { Suspense } from "react";
import { requireOrgRole } from "@/lib/auth";
import { CustomerForm } from "@/modules/customers/components/customer-form";
import { CUSTOMER_EDITORS } from "@/modules/customers/permissions";
import { PageLoading, SectionCard } from "@/modules/fleet/components/asset-page";

export const metadata = { title: "Add customer · Fleet Manage Pro" };

export default function NewCustomerPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewCustomer />
    </Suspense>
  );
}

async function NewCustomer() {
  await requireOrgRole(CUSTOMER_EDITORS);
  return (
    <div className="grid max-w-3xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Add customer</h1>
      <SectionCard title="Customer details" description="You can add contacts on the next page.">
        <CustomerForm />
      </SectionCard>
    </div>
  );
}
