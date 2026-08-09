# Deploy — larum-property-experience

Everything is built and verified locally. Deployment is two commands.

## Once

```bash
npm i -g vercel
```

## Deploy

From `prototype/`:

```bash
vercel
```

(`--name` is deprecated in the current CLI — type the name at the prompt instead.)

First run asks a short series of questions:

| Question | Answer |
|---|---|
| Set up and deploy? | **Y** |
| Which scope? | **Larum Studio's projects** |
| Link to existing project? | **N** — this creates it |
| What's your project's name? | **larum-property-experience** |
| In which directory is your code? | **./** (press Enter) |
| Want to modify these settings? | **N** — `vercel.json` already sets them |

You get a preview URL. To publish to the production URL:

```bash
vercel --prod
```

## Then: the concierge key

The site works without it — the concierge falls back to the keyword engine and the visitor sees no error. To switch on the real one:

1. **console.anthropic.com** → API Keys → Create Key → copy it
2. Vercel → **larum-property-experience** → Settings → **Environment Variables** → Add
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key
   - Environments: tick all three
3. `vercel --prod` again — environment variables only reach a new deployment

Never put the key in a file. It lives in Vercel; `api/concierge.mjs` reads it from the environment and it never reaches the browser.

## Shareable links

The address bar is the share button. Every property and language switch keeps it accurate:

```
https://<your-url>/?property=marbella&lang=es
https://<your-url>/?property=madrid&lang=en&chapter=concierge
```

`chapter` drops the visitor straight into a section (`identity`, `sequence`, `spatial`, `concierge`, `calculator`, `documents`). It is an arrival instruction, not state — it is stripped from the URL once they are in, so it never travels on into a link they copy for someone else.

## Before you send the link to anyone real

**Run `docs/supabase-fix-rls.sql` first.** The live database currently lets anyone holding the anon key — which ships in the page source by design — read the `leads` table. It is empty today, so nothing is exposed yet; the moment a real enquiry lands, it would be. The same script also fixes the insert policy that is silently discarding enquiries.

## What is not deployed

`.vercelignore` keeps these off the public URL:

- `docs/` — internal working documents
- ~~`admin.html`~~ — now ships. It reads Supabase behind Supabase Auth, the read policies are scoped to `authenticated`, and it is `noindex, nofollow`. Signed out it shows nothing but a login box
- `assets/*.jpg` — superseded by the CDN URLs in `properties/*/assets.json`

`noindex, nofollow` is set both in the page and as an `X-Robots-Tag` header, so a shared link cannot be indexed while stand-in photography and unauthorised agency names are in use.

## After changing property data

```bash
node build-pack.js && node validate-content.js
```

`build-pack.js` regenerates both the offline pack and the concierge dossier. Deploy again after any content change.
