"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "cn";

// True once the user has moved between pages inside the app in this tab (a full page load starts over).
let movedInApp = false;

/** Notes in-app page changes so Back knows whether the previous page is ours. Render once in the app layout. */
export function NavigationTracker() {
  const pathname = usePathname();
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname !== first.current) movedInApp = true;
  }, [pathname]);
  return null;
}

/**
 * "← Back": returns to the previous page (keeping its filters and scroll) when the user came from inside the app;
 * otherwise goes to `fallback` (a page opened in a new tab, from a bookmark or after a reload).
 */
export function BackLink({ fallback, className }: { fallback: string; className?: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      className={cn("text-sm text-muted-foreground hover:underline", className)}
      onClick={(ev) => {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return; // new tab/window: plain link
        if (movedInApp) {
          ev.preventDefault();
          router.back();
        }
      }}
    >
      ← Back
    </Link>
  );
}
