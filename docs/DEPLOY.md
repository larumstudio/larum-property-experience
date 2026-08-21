# Deploy — larum-property-experience

Everything is built and verified locally. Deployment is two commands — but `vercel` is **not** installed globally in this environment; always use `npx vercel`, a plain `vercel` command fails with "command not found."

## Once

Nothing to install globally. `npx vercel` pulls what it needs on first run.

## Deploy

From `prototype/`:

```bash
npx vercel deploy --prod --yes
```

This pushes straight to the production URL (`https://larum-property-experience.vercel.app`) — `vercel.json` already carries the project settings, so there's no interactive prompt sequence to answer. If a deploy fails with `"Not authorized"`, that has been transient every time it's happened — retry immediately before investigating further.

Standard discipline before any deploy: run the relevant test suite(s) (`node tests/<file>.test.mjs` — no framework needed), confirm 0 regressions, `git status` to review exactly what's staged (never `git add -A`), commit, push, then deploy — then verify live in the browser, not just "tests passed."

## Then: the concierge key

The site works without it — the concierge falls back to the keyword engine and the visitor sees no error. To switch on the real one:

1. **console.anthropic.com** → API Keys → Create Key → copy it
2. Vercel → **larum-property-experience** → Settings → **Environment Variables** → Add
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key
   - Environments: tick all three
3. Deploy again — environment variables only reach a new deployment

Never put the key in a file. It lives in Vercel; `api/concierge.mjs` reads it from the environment and it never reaches the browser.

## Auth, RLS and the Admin panel (current architecture, as of M6.6)

`admin.html` ships (it is not excluded — see below) but is useless without an account: it sits behind real Supabase Auth, and every table it touches is protected by Row Level Security defined in `docs/migrations/006_authorization_foundation.sql` + `006_policies_prepared.sql`, both live in production. Two roles exist:

- **admin** — full read/write within their organization (`memberships.role = 'admin'`).
- **agent** — scoped to their own assigned properties/leads only (`memberships.role = 'agent'`, linked via `agents.auth_user_id`).

Agent accounts are created from inside the Admin panel itself (Agentes → create/invite), not from this file — the invite flow is `api/admin-invite-agent.mjs`, a serverless endpoint that calls the Supabase Auth Admin API.

**Required Vercel environment variable for invites to work:** `SUPABASE_SERVICE_ROLE_KEY` (private — Environment Variables in Vercel, same three-environments checkbox as `ANTHROPIC_API_KEY` above). This key is never sent to the browser and never logged; only `api/admin-invite-agent.mjs` reads it. The `redirect_to` value the invite endpoint sends to Supabase Auth **must** be a URL query parameter, never a JSON body field — GoTrue silently ignores it in the body.

`docs/supabase-fix-rls.sql` is **obsolete** — it described a pre-Auth state (anon could read `leads`) that Migration 006 fully superseded. Do not run it; there is nothing left for it to fix.

### Applying a new migration

Every file in `docs/migrations/` is meant to be run manually, once, via the Supabase Dashboard's **SQL Editor** — there is no automated execution channel (no linked CLI, no direct Postgres connection string, no MCP database tool) from this environment. Before touching production:

1. Test the migration against a disposable, isolated Supabase project first (a free-tier project is enough) — never against the real project.
2. Run the isolated test suite that matches it (see the corresponding `tests/*.test.mjs` file's own header for the exact `ISOLATED_SUPABASE_*` environment variables it needs).
3. Only once that passes, run the same SQL in the **production** project's SQL Editor.
4. If a new table isn't immediately reachable via the REST API right after running DDL, that's PostgREST's schema cache lagging — wait a few seconds or use the dashboard's "Reload schema cache" button (Settings → API) before assuming the migration failed.

`docs/migrations/` is the single source of truth for what schema exists — this file intentionally does not enumerate every migration, since that list would go stale the moment a new one lands.

## Shareable links

The address bar is the share button. Every property and language switch keeps it accurate:

```
https://<your-url>/?property=marbella&lang=es
https://<your-url>/?property=madrid&lang=en&chapter=concierge
```

`chapter` drops the visitor straight into a section (`identity`, `sequence`, `spatial`, `concierge`, `calculator`, `documents`). It is an arrival instruction, not state — it is stripped from the URL once they are in, so it never travels on into a link they copy for someone else.

## What is not deployed

`.vercelignore` keeps these off the public URL:

- `docs/` — internal working documents (including this file and every migration)
- `assets/*.jpg` — superseded by the CDN URLs in `properties/*/assets.json`

`admin.html` **does** ship — it is `noindex, nofollow` (both in-page and as an `X-Robots-Tag` header) and shows nothing but a login box to anyone without a Supabase Auth session, so a shared/crawled link exposes no data.

## After changing property data

```bash
node build-pack.js && node validate-content.js
```

`build-pack.js` regenerates both the offline pack and the concierge dossier. Deploy again after any content change.
