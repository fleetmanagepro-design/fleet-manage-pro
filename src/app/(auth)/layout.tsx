import { BrandLogo } from "@/components/brand";

const POINTS = [
  "Profit per load, truck, trailer and driver",
  "Dispatch board, driver pay and weekly statements",
  "Every document and expiration in one place",
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="grid flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden overflow-hidden bg-sidebar px-12 py-10 text-sidebar-foreground lg:flex lg:flex-col">
        {/* faint road lines toward the horizon */}
        <svg aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 w-full opacity-[0.12]" viewBox="0 0 400 300" preserveAspectRatio="none">
          <path d="M0 300 L190 0 M400 300 L210 0" stroke="#c9a227" strokeWidth="2" fill="none" />
          <path d="M200 300 L200 0" stroke="#c9a227" strokeWidth="3" strokeDasharray="14 18" fill="none" />
        </svg>
        <BrandLogo onDark />
        <div className="relative my-auto grid max-w-md gap-6">
          <h1 className="text-4xl leading-tight font-semibold text-white">
            Know where every mile <span className="text-gold">makes money.</span>
          </h1>
          <ul className="grid gap-3 text-sm">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <span aria-hidden className="size-1.5 rounded-full bg-gold" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">Built for US carriers with 5–50 trucks.</p>
      </section>
      <section className="flex flex-col items-center justify-center gap-6 px-4 py-10">
        <BrandLogo className="lg:hidden" />
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
