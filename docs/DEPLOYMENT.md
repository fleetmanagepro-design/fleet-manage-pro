# Deployment

Production runs on **Vercel** (app) and **Supabase** (database, auth). Set up 11/09/2026.

| What | Where |
|---|---|
| App | https://app.fleetmanagepro.com (also https://fleet-manage-pro-fj28.vercel.app) |
| Marketing site | `fleetmanagepro.com` — not built yet; the root domain is still parked at GoDaddy |
| Supabase project | `shrynboejmrxomoxwxqh` (East US) |
| GitHub | `fleetmanagepro-design/fleet-manage-pro` |
| Vercel project | `fleet-manage-pro-fj28` |
| DNS | GoDaddy (`app` CNAME → Vercel; `send`, `rsend`, `resend._domainkey` → Resend) |

## How changes reach production
- **App:** every push to `main` is deployed by Vercel automatically. Pull requests get preview deployments.
- **Database:** `.github/workflows/deploy-database.yml` runs `supabase db push --remote` when files in
  `supabase/migrations/` land on `main` (or on manual run: Actions → Deploy database → Run workflow).
  `seed.sql` is never run in production.
- **Checks:** `.github/workflows/ci.yml` runs lint, typecheck, unit, database, build and e2e on every PR.

## Configuration

### Vercel → Settings → Environment Variables
| Name | Value | Type |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://shrynboejmrxomoxwxqh.supabase.co` | plain (not Sensitive) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API Keys → Publishable key | plain |
| `NEXT_PUBLIC_SITE_URL` | the app's public URL, no trailing slash | plain |
| `RESEND_API_KEY` | Resend API key (when email is set up) | **Sensitive** |
| `EMAIL_FROM` | `Fleet Manage Pro <notifications@fleetmanagepro.com>` | plain |

`NEXT_PUBLIC_*` values are built into the app: after changing one, **Redeploy**.
A variable can exist several times with different values per environment (Production / Preview / Development);
check that there is only one `NEXT_PUBLIC_SITE_URL` and that it covers all three. On production the app logs a
warning (`[env] NEXT_PUBLIC_SITE_URL is …`) in Vercel → Logs when it doesn't match the production domain.
Vercel won't turn a Sensitive variable back into a plain one; delete and re-add it instead.

### GitHub → Settings → Secrets and variables → Actions
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID` (used by Deploy database).

### Resend (email)
- Domain `fleetmanagepro.com` verified (DKIM `resend._domainkey`, CNAME `send` and `rsend`), region us-east-1.
- API key "vercel-app" → Vercel `RESEND_API_KEY` (invitation emails sent by the app).
- API key "supabase-smtp" → Supabase SMTP password (sign-up and password-reset emails).

### Supabase → Authentication
- **URL Configuration:** Site URL = the app URL; Redirect URLs = `<app URL>/**`.
  Email links are built from the Site URL, so a wrong value sends people to the wrong host (e.g. localhost).
- **Email Templates:** "Confirm signup" and "Reset password" must use the token-hash links in
  `supabase/templates/confirmation.html` and `recovery.html` (copy subject and body).
- **SMTP** (Authentication → Emails → SMTP Settings): host `smtp.resend.com`, port `465`, username `resend`,
  password = Resend API key, sender `notifications@fleetmanagepro.com`, name `Fleet Manage Pro`.
  Without custom SMTP, Supabase only emails members of the Supabase project team.

## Changing the app's domain
1. Vercel → Settings → Domains → add the domain; add the DNS record Vercel shows at GoDaddy (Name = only the subdomain, e.g. `app`).
2. Change `NEXT_PUBLIC_SITE_URL` and Redeploy.
3. Supabase → URL Configuration: update Site URL and add `<new URL>/**` to Redirect URLs.

## Removing a whole organization
There is no in-app way yet (planned). Until then it's a one-off SQL in Supabase → SQL Editor: look the organization
up by name **and** owner email, then delete its rows from every `public` table with an `organization_id`
column and the organization itself, in one transaction with `session_replication_role = replica`
(the audit log is otherwise insert-only). Done once on 11/10/2026 for a test organization.
