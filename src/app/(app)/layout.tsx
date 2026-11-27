import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { NavigationTracker } from "@/components/back-link";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="bg-sidebar print:hidden md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto">
        <Suspense fallback={<div className="p-4 text-sm text-sidebar-muted">Loading…</div>}>
          <AppSidebar />
        </Suspense>
      </aside>
      <Suspense fallback={null}>
        <NavigationTracker />
      </Suspense>
      <main className="min-w-0 flex-1 p-4 print:p-0 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
