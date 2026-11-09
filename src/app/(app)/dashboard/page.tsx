import { Suspense } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth";

export const metadata = { title: "Dashboard · Fleet Manage Pro" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const { active } = await requireOrg();
  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{active.organizationName}</h1>
      <Card>
        <CardHeader>
          <CardTitle>The dashboard isn&apos;t built yet</CardTitle>
          <CardDescription>
            Revenue, costs, profit per truck and alerts will appear here once loads, expenses and
            maintenance are in place. See docs/ROADMAP.md for the order of work.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
