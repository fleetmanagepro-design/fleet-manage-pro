import type { ReactNode } from "react";
import { cn } from "cn";

export type Tone = "neutral" | "blue" | "amber" | "green" | "red" | "gold";

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--tone-neutral-bg)] text-[var(--tone-neutral-fg)]",
  blue: "bg-[var(--tone-blue-bg)] text-[var(--tone-blue-fg)]",
  amber: "bg-[var(--tone-amber-bg)] text-[var(--tone-amber-fg)]",
  green: "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)]",
  red: "bg-[var(--tone-red-bg)] text-[var(--tone-red-fg)]",
  gold: "bg-[var(--tone-gold-bg)] text-[var(--tone-gold-fg)]",
};

/** A soft colored pill with a dot: the color carries the state, the text names it. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5.5 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", TONE[tone], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}
