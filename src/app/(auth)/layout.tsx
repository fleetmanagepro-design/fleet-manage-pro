export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <p className="text-lg font-semibold tracking-tight">Fleet Manage Pro</p>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
