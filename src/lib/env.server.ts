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
