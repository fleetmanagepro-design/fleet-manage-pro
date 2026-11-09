/**
 * Turn an untrusted `next` value (query string, email link) into a same-origin
 * path, so sign-in and email links can never redirect to another site.
 *
 * Accepts relative paths ("/invite/abc?x=1") and absolute URLs on `origin`
 * (Supabase emails pass the full redirect URL). Anything else → `fallback`.
 */
export function safeNextPath(
  next: string | null | undefined,
  origin: string,
  fallback = "/dashboard",
): string {
  if (!next) return fallback;
  const value = next.trim();
  if (value === "" || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return fallback;
  }
  if (url.origin !== new URL(origin).origin) return fallback;
  // A relative value must itself start with a single "/" (rejects "//evil.com" and "evil").
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && (!value.startsWith("/") || value.startsWith("//"))) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
