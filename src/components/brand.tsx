import { cn } from "cn";

/** The Fleet Manage Pro mark: a navy tile with a gold road running to the horizon. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="#1e3a8a" />
      <path d="M13.5 25 L15.2 8 H16.8 L18.5 25 Z" fill="#c9a227" />
      <path d="M6 25 L13 8" stroke="#c9a227" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      <path d="M26 25 L19 8" stroke="#c9a227" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      <path d="M15.6 11 v2.2 M15.6 16 v2.6 M15.6 21.4 v2.6" stroke="#1e3a8a" strokeWidth="0.9" />
    </svg>
  );
}

/** Mark + wordmark. `onDark` for the navy sidebar and the sign-in panel. */
export function BrandLogo({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className={cn("text-[15px] leading-tight font-semibold tracking-tight", onDark ? "text-white" : "text-foreground")}>
        Fleet Manage <span className="text-gold">Pro</span>
      </span>
    </span>
  );
}
