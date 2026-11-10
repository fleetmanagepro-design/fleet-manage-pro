import "server-only";
import { z } from "zod";

/**
 * Server-only configuration. Never import this from a Client Component.
 *
 * Email delivery (first match wins):
 *   RESEND_API_KEY set → Resend (production)
 *   MAILPIT_URL set    → local Mailpit started by `supabase start` (development, e2e)
 *   neither            → sending fails with a clear error; the invite link is still shown
 */
const serverEnvSchema = z.object({
  RESEND_API_KEY: z.string().min(1).optional(),
  MAILPIT_URL: z.url().optional(),
  EMAIL_FROM: z.string().min(3).default("Fleet Manage Pro <notifications@fleetmanagepro.com>"),
});

export const serverEnv = serverEnvSchema.parse({
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  MAILPIT_URL: process.env.MAILPIT_URL || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || undefined,
});

/**
 * On Vercel production, warn when NEXT_PUBLIC_SITE_URL doesn't match the project's
 * production domain: email links (invitations, sign-up) would point to the wrong host.
 * VERCEL_* are system variables Vercel sets at runtime.
 */
function checkSiteUrl() {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV !== "production" || !productionHost) return;
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  let configuredHost: string | undefined;
  try {
    configuredHost = configured ? new URL(configured).host : undefined;
  } catch {
    configuredHost = undefined;
  }
  if (configuredHost !== productionHost) {
    console.warn(
      `[env] NEXT_PUBLIC_SITE_URL is "${configured}" but this deployment's production domain is ` +
        `"${productionHost}". Email links will point to the configured value. See docs/DEPLOYMENT.md.`,
    );
  }
}
checkSiteUrl();
