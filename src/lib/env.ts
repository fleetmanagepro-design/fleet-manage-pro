import { z } from "zod";

/**
 * Public (browser-safe) configuration. Validated once at import time so a
 * missing variable fails loudly instead of producing confusing auth errors.
 *
 * NEXT_PUBLIC_* values must be referenced literally for Next.js to inline them.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** Origin of this app, used in email links, e.g. https://app.fleetmanagepro.com */
  NEXT_PUBLIC_SITE_URL: z.url().transform((u) => u.replace(/\/+$/, "")),
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
