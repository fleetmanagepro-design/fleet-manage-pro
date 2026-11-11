import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-b bg-muted/30 print:hidden md:w-64 md:shrink-0 md:border-r md:border-b-0">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
          <AppSidebar />
        </Suspense>
      </aside>
      <main className="flex-1 p-4 print:p-0 md:p-8">{children}</main>
    </div>
  );
}
