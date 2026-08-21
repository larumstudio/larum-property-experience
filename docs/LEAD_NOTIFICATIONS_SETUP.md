# Lead notifications — one-time setup (M6.7a)

`api/notify-lead.mjs` is written and tested (`tests/notify-lead.test.mjs`, mocked — no live send required to pass). It does nothing in production until two things are configured outside this repo, same as every migration under `docs/migrations/` needs a manual step outside of code.

## 1 · Vercel environment variables

Project → Settings → Environment Variables (all three environments):

| Name | Value |
|---|---|
| `RESEND_API_KEY` | Your Resend API key (resend.com → API Keys) |
| `LEAD_NOTIFY_SECRET` | A random shared secret — Claude generated one for this session; do not reuse it for anything else |
| `RESEND_FROM` *(optional)* | Defaults to `Larum <onboarding@resend.dev>` (Resend's shared test sender — works immediately, no domain verification needed). Once a real sending domain is verified in Resend, set this to e.g. `Larum <notificaciones@yourdomain.com>` |

Deploy again after adding these — environment variables only reach a new deployment, same rule as `ANTHROPIC_API_KEY`.

## 2 · Supabase Database Webhook

Dashboard → Database → Webhooks → Create a new webhook, on the **production** project (`mtyemgfovvmjrsxevcgh`):

| Field | Value |
|---|---|
| Name | `notify-new-lead` (or anything) |
| Table | `leads` |
| Events | `Insert` only |
| Type | HTTP Request |
| Method | `POST` |
| URL | `https://larum-property-experience.vercel.app/api/notify-lead` |
| Headers | `x-notify-secret: <the same LEAD_NOTIFY_SECRET value from step 1>` |

Supabase sends `{ type: 'INSERT', table: 'leads', schema: 'public', record: {...new row...}, old_record: null }` — `notify-lead.mjs` reads `record` directly, no further configuration needed.

## Why a Database Webhook and not a code change

Leads are inserted directly by the visitor's browser (`app.js` → `supabaseClient.from('leads').insert(...)`, no serverless function in that path) — there is nothing server-side in the insert flow itself to hook into without adding one. A Database Webhook fires after the row exists, in Postgres, independent of how the row was inserted — consistent with how every other automatic behavior in this project (`resolve_lead_agent_id`, `touch_leads`, `log_lead_changes`) already lives in the database rather than in `app.js`. `app.js` itself is untouched by M6.7a.

## Verifying it works

1. Complete both steps above.
2. Submit a real enquiry on the live site (or insert a test row via the Supabase Table Editor).
3. Check the Resend dashboard's "Emails" log, or the assigned agent's / an admin's inbox.
4. If nothing arrives, check Vercel's function logs for `api/notify-lead` — every skip and failure path logs a specific reason (`no_property`, `no_recipients`, `email_not_configured`, or the raw Resend error).
