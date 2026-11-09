# Deployment

Production runs on **Vercel** (app) and **Supabase** (database, auth). Set up 11/09/2026.

| What | Where |
|---|---|
| App | https://fleet-manage-pro-fj28.vercel.app (later `app.fleetmanagepro.com`) |
| Supabase project | `shrynboejmrxomoxwxqh` (East US) |
| GitHub | `fleetmanagepro-design/fleet-manage-pro` |

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
Vercel won't turn a Sensitive variable back into a plain one; delete and re-add it instead.

### GitHub → Settings → Secrets and variables → Actions
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID` (used by Deploy database).

### Supabase → Authentication
- **URL Configuration:** Site URL = the app URL; Redirect URLs = `<app URL>/**`.
  Email links are built from the Site URL, so a wrong value sends people to the wrong host (e.g. localhost).
- **Email Templates:** "Confirm signup" and "Reset password" must use the token-hash links in
  `supabase/templates/confirmation.html` and `recovery.html` (copy subject and body).
- **SMTP:** until custom SMTP is configured, Supabase only emails members of the Supabase project team.

## When the domain moves to app.fleetmanagepro.com
1. Vercel → Settings → Domains → add `app.fleetmanagepro.com`; add the DNS record Vercel shows at the registrar.
2. Change `NEXT_PUBLIC_SITE_URL` and Redeploy.
3. Supabase → URL Configuration: update Site URL and add the new Redirect URL.
