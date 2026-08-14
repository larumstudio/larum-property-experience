# Larum Property Experience — Full Project Handoff

**Snapshot date:** 2026-08-14
**Snapshot cause:** relocating the repo to a different machine to continue development.
**Author:** Simon (Larum Studio) + Claude Opus 4.7

This is the single canonical document for taking the entire repository — visitor experience, admin, API, deploy, database — to another PC and resuming work cleanly. Read this end-to-end before touching anything.

Companion documents:
- `docs/LARUM_ADMIN_HANDOFF_M5.5C.md` — deep detail on the Admin phase / M5.5 milestones (still current)
- `docs/NEXT_PHASES.md` — short "what's next"

---

## 0 · TL;DR (30 seconds)

- **Project:** Larum Property Experience — private prototype. A luxury real-estate experience per property + a grounded AI concierge + a private admin.
- **Stack:** static HTML/CSS/vanilla JS, one Vercel serverless function (`api/concierge.mjs`), Supabase (Postgres + Auth + RLS), Anthropic Claude Sonnet 5. Node ≥20. One npm dep: `@anthropic-ai/sdk`.
- **Where the code lives:** GitHub `larumstudio/larum-property-experience` on branch `master`. Deployed to Vercel (this repo has a `.vercel/` link).
- **Git state at handoff:** `HEAD = eab3a92` (`M5.5b`). **4 unpushed commits** ahead of `origin/master`. **M5.5c is fully implemented + validated but uncommitted**.
- **Where to resume:** commit M5.5c → start M5.6 (Audits + Larum Score). See §11.

---

## 1 · Exact git state at handoff

| Field | Value |
|---|---|
| Repo | `larumstudio/larum-property-experience` |
| Local branch | `master` |
| Local HEAD | `eab3a9255f57c4f076deced285912e2444e44e06` — `eab3a92` |
| Local HEAD message | `M5.5b: concierge history panel` |
| Remote (`origin`) | GitHub `larumstudio/larum-property-experience` |
| `origin/master` HEAD | `918af67` — `M5.2: content editor, GitHub preparation` |
| Local ahead of origin | **4 commits, unpushed** |
| Working tree | **NOT clean** — M5.5c is fully implemented but **uncommitted by design** |

### Unpushed commits (oldest → newest)

```
1748109  M5.3: workspace overview enrichment
5687274  M5.4: assets editor with URL-only media management
d0037f1  M5.5a: experience preview tab
eab3a92  M5.5b: concierge history panel     ← HEAD
```

### Working tree — M5.5c changes (uncommitted)

```
Modified:
  admin.html                            (+62 CSS lines, .ke-*)
  admin/admin-concierge-panel.js        (+47 / -14; Knowledge subtab)
  admin/admin-property-store.js         (+14; saveKnowledge)

Untracked (code):
  admin/admin-knowledge-editor.js       (new, 1123 lines)

Untracked (docs, this handoff):
  docs/LARUM_PROJECT_HANDOFF.md
  docs/LARUM_ADMIN_HANDOFF_M5.5C.md
  docs/NEXT_PHASES.md
```

Nothing else has drifted.

---

## 2 · What this project is

A private demo aimed at ultra-high-end residences. Each property has its own **experience page** — cinematic scroll, DNA analysis, spatial map, concierge chat, calculator — served from static HTML rendered by a single vanilla JS runtime, hydrated from either the Supabase database (canonical) or local JSON files (authoring) or an offline pack (fallback).

Complementing the visitor experience:

- A **grounded AI concierge** (`api/concierge.mjs`) that answers only from the property's dossier — never invents facts about a €4M residence. Powered by Claude Sonnet 5 with prompt caching.
- A **private admin** at `/admin.html` behind Supabase Auth — property list, per-property workspace with content / assets / experience preview / concierge history + knowledge editor.
- A **Larum Studio skill layer** (referenced but lives in a separate repo) that generates outbound content, audits and prospecting materials.

Two live properties: `madrid` (Christie's M1558, Barrio de Salamanca) and `marbella` (NVOGA NVG-H11, Nueva Andalucía).

---

## 3 · Repository structure

```
prototype/                            ← the repo root (git root)
├── index.html                        Visitor entry point
├── admin.html                        Admin entry (behind Supabase Auth)
│
├── app.js                            Visitor runtime (~2000 LOC vanilla JS)
├── analytics.js                      Client-side event engine + qualifier
├── consent.js                        Cookie/consent gate
├── property-loader.js                Loader: db → files → pack (+ validator)
├── property-pack.js                  Generated offline pack (build-pack.js)
├── build-pack.js                     Regenerates property-pack.js
├── validate-content.js               CLI validator (uses property-loader)
├── supabase-config.js                Anon client bootstrap
├── styles.css                        All visitor styles
│
├── contact-config.json               Global contact settings
├── purchase-config.json              Regional acquisition tax matrix
│
├── admin/
│   ├── admin-router.js               Hash-based SPA router
│   ├── admin-core.js                 Auth gate, session, shared state, helpers
│   ├── admin-ui.js                   Reusable components (tabs, badges, charts…)
│   ├── admin-dashboard.js            /dashboard
│   ├── admin-clients.js              /clients (leads dashboard)   [named admin-leads.js on disk]
│   ├── admin-leads.js                Leads section
│   ├── admin-sessions.js             Session drawer
│   ├── admin-properties.js           /properties list
│   ├── admin-workspace.js            Per-property workspace (tab controller)
│   ├── admin-property-store.js       Property index + cache + save methods
│   ├── admin-content-editor.js       M5.2 — content editor
│   ├── admin-assets-editor.js        M5.4 — assets editor (URL-only)
│   ├── admin-experience-preview.js   M5.5a — iframe of the visitor experience
│   ├── admin-concierge-panel.js      M5.5b — History + Knowledge subtab controller
│   └── admin-knowledge-editor.js     M5.5c — Knowledge editor (uncommitted)
│
├── api/                              Vercel serverless functions
│   ├── concierge.mjs                 POST /api/concierge — the concierge endpoint
│   ├── _data.mjs                     Persist turn, dossier fetch, warm cache
│   ├── _pack.mjs                     Pack fetch helper for server context
│   └── _rate.mjs                     Per-IP + per-session rate limiter
│
├── properties/
│   ├── index.json                    Registry: default + order + rules
│   ├── _template/                    Canonical scaffold (content/knowledge/assets)
│   ├── madrid/                       content.json · knowledge.json · assets.json
│   └── marbella/                     content.json · knowledge.json · assets.json
│
├── tools/
│   └── generate-seed.js              Reads properties/*.json → 002_seed SQL
│
├── docs/                             This document + specs (NOT deployed)
│   ├── LARUM_PROJECT_HANDOFF.md      ← this file
│   ├── LARUM_ADMIN_HANDOFF_M5.5C.md  Admin-specific deep handoff
│   ├── NEXT_PHASES.md                Short companion
│   ├── PROJECT_HANDOFF.md            Original Phase-1 handoff (kept as history)
│   ├── PROJECT_CONTROL.md            Milestone control doc
│   ├── PHASE_1_SPEC.md               Phase 1 spec (still authoritative)
│   ├── TECH_SPEC.md                  Tech spec (still authoritative)
│   ├── AI_CONCIERGE_SPEC.md          Concierge spec
│   ├── DATABASE.md                   Schema reference
│   ├── DEPLOY.md                     Deploy runbook
│   ├── V2_SCOPE.md                   V2 scope doc
│   ├── V1_GAP_ANALYSIS.md            V1 gap analysis
│   ├── VISUAL_DIRECTION.md           Visual direction
│   ├── ASSET_PERMISSION_EMAILS.md    Templates for agency asset requests
│   ├── START_V2.md                   V2 kickoff notes
│   ├── supabase-schema.sql           Original single-file schema (superseded)
│   ├── supabase-fix-rls.sql          One-off RLS fix (already applied)
│   └── migrations/                   Applied migrations (see §7)
│       ├── 001_phase1_schema.sql
│       ├── 002_seed_properties.sql
│       ├── 003_concierge_conversation_key.sql
│       └── 004_concierge_conversation_unique.sql
│
├── assets/                           Local JPGs (superseded by CDN URLs — kept for authoring)
│
├── package.json                      npm scripts (build, validate, seed, check)
├── package-lock.json
├── vercel.json                       Deploy config (headers, function memory)
├── .vercelignore                     Excludes docs/, .claude/, *.md
├── .gitignore                        Excludes .env*, .vercel, node_modules, .claude/settings.local.json
├── README.md                         Public README
├── CLAUDE_CODE_PROMPT.md             Working prompt for Claude Code
│
├── .env.local                        SECRETS — NOT in git (see §6)
├── .vercel/                          Vercel project link — NOT in git
└── node_modules/                     NOT in git
```

---

## 4 · Runtime pieces

### 4a · Visitor runtime (`index.html` → `app.js`)

1. `index.html` loads Supabase JS from CDN, then `supabase-config.js` to create `window.supabaseClient` with the anon key (public — RLS gates every read).
2. `property-loader.js` runs `LarumLoader.autoLoad()` which tries **database → files → offline pack** in that order (override with `?source=db|files|pack`).
3. `app.js` renders one property at a time (`?property=madrid` etc.), driven by hydrated data. All UI is vanilla JS + CSS in `styles.css`. No framework.
4. Analytics events buffer in `analytics.js` and eventually POST to `analytics_events` under RLS.
5. Concierge chat: client posts to `POST /api/concierge` → grounded response with cited spaces/scenes. Falls back to a client-side keyword engine if the API is down.

### 4b · Admin (`admin.html` → `admin/*.js`)

1. `admin.html` gates behind Supabase Auth (`admin-core.js::boot`). Only signed-in operators reach the app; RLS still enforces per-row.
2. `admin-router.js` is hash-based: `#dashboard`, `#properties`, `#workspace/<slug>`, etc.
3. `admin-property-store.js` is the admin's data layer: `loadIndex()` (generated columns only), `loadProperty(slug)` (full row + cache), and `saveContent / saveAssets / saveKnowledge`.
4. Property Workspace lives in `admin-workspace.js` and hosts the tab tree (see §5).

### 4c · API (Vercel serverless)

`api/concierge.mjs` (the only endpoint):
- POST-only, requires `ANTHROPIC_API_KEY`. Returns 503 if unset (client falls back).
- Rate-limited by `api/_rate.mjs` (per IP + per session).
- Loads the property dossier via `api/_data.mjs::getDossier` (Supabase read with warm in-memory cache; falls back to server-side pack).
- Prompt-caches the dossier under Anthropic `cache_control: ephemeral`.
- Persists every turn to `concierge_conversations` + `concierge_messages` via service role (see `persistTurn` + `upsertConversation`).
- Response schema is a JSON object with `answer / confidence / spaces / scenes / documents / interests / followUp`.

### 4d · Skills layer (separate repo)

Referenced by user memory (`larum-content-engine` repo). Not part of this repo. This project only exposes an audit table and a pattern for concierge grounding — the actual skill runtime (WhatsApp, email, blog, brochure, etc.) lives elsewhere.

---

## 5 · Property Workspace — tab tree

```
Property Workspace  (admin/admin-workspace.js)
├─ Overview       ✅ M5.3      (renderOverview)
├─ Audit          ⏳ M5.6      (placeholder emptyState)
├─ Content        ✅ M5.2      (admin-content-editor.js)
├─ Assets         ✅ M5.4      (admin-assets-editor.js)
├─ Experience     ✅ M5.5a     (admin-experience-preview.js)
├─ Concierge      ✅ M5.5b + M5.5c   (admin-concierge-panel.js)
│    ├─ History   ✅ M5.5b     (in-panel)
│    └─ Knowledge ✅ M5.5c     (admin-knowledge-editor.js)
├─ Analytics      ⏳ M5.7      (placeholder emptyState)
└─ Leads          ⏳ M5.7      (placeholder emptyState)
```

Full detail lives in **`docs/LARUM_ADMIN_HANDOFF_M5.5C.md`** — read it before touching M5.6 or M5.7.

---

## 6 · Bringing the project up on a new PC

### 6.1 Prerequisites

- **Git** (any recent)
- **Node ≥ 20** (from `package.json engines`)
- **npm** (bundled with Node)
- **Python** (for the local static server used by `.claude/launch.json`) OR any other static server on port 4173
- **Vercel CLI** (`npm i -g vercel`) if you'll deploy from this machine
- A modern browser + the Claude Code / Claude Desktop tooling if you'll continue with agents

Windows-native repo (CRLF warnings are expected; do not "fix" them).

### 6.2 Clone

```bash
git clone https://github.com/larumstudio/larum-property-experience.git
cd larum-property-experience
```

### 6.3 Install

```bash
npm install         # only one dep: @anthropic-ai/sdk
```

### 6.4 Restore the uncommitted M5.5c work

The 4 unpushed commits will come with the clone **only if you first push them from the old machine**. Two paths:

**Path A — push M5.5b (recommended before moving machines):**
1. On the current machine: `git push origin master` (moves origin/master from `918af67` to `eab3a92`).
2. Bundle M5.5c working-tree changes into a patch:
   ```bash
   git add admin.html admin/admin-concierge-panel.js \
           admin/admin-property-store.js admin/admin-knowledge-editor.js \
           docs/LARUM_PROJECT_HANDOFF.md docs/LARUM_ADMIN_HANDOFF_M5.5C.md docs/NEXT_PHASES.md
   git diff --cached > m5.5c.patch
   git reset          # keep working tree, unstage
   ```
   Copy `m5.5c.patch` to the new machine; on it after clone: `git apply m5.5c.patch`.

**Path B — carry the whole `prototype/` folder verbatim** (working tree + `.git`) via any file-sync method. This is what Simon is doing per the prompt. On the new machine, verify with:

```bash
git rev-parse HEAD                         # must be eab3a92
git log --oneline origin/master..HEAD      # 4 commits: M5.3 → M5.5b
git status --short                         # 3 modified + 4 untracked (M5.5c + 3 handoff docs)
```

Do NOT run `npm install` on top of the copied `node_modules/`; delete it first if platforms differ.

### 6.5 Environment variables (`.env.local` — NOT in git)

Create `.env.local` at the repo root with:

```
# Anthropic — required by api/concierge.mjs
ANTHROPIC_API_KEY=sk-ant-...

# Supabase — SERVICE ROLE key (server-only, never ship to browser)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Optional: override the concierge model without code change
# CONCIERGE_MODEL=claude-sonnet-5   (default)

# Vercel auto-injects VERCEL_OIDC_TOKEN when linked; do not set by hand
```

Values you need to carry over from the old machine's `.env.local`:
- `ANTHROPIC_API_KEY` — Larum Studio's Anthropic key
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard → Project Settings → API

Both are ALSO configured in the Vercel project (Production + Preview envs). If deploying via `vercel --prod`, the deployed function reads from Vercel env — the local `.env.local` is only for `vercel dev` or `node`-based tooling.

Public values already in git:
- Supabase URL (`mtyemgfovvmjrsxevcgh.supabase.co`) — in `supabase-config.js`
- Supabase anon key — in `supabase-config.js` (safe: RLS enforces every read)

### 6.6 Local run

```bash
# Static server for the visitor + admin
python -m http.server 4173
# → open http://localhost:4173/           (visitor)
# → open http://localhost:4173/admin.html (admin — needs Supabase Auth login)
```

The admin requires an operator account created **by hand** in Supabase → Authentication → Users. Simon's account is `contactolarum@gmail.com`.

To run the concierge endpoint locally (needs both env vars):

```bash
npm i -g vercel
vercel dev            # serves both static + /api/concierge on port 3000
```

### 6.7 npm scripts

```
npm run build       # regenerate property-pack.js from properties/*
npm run validate    # run property-loader validator against the local files
npm run seed        # emit tools/generate-seed.js SQL from local JSON
npm run check       # build + validate
```

None of these touch the database.

### 6.8 Deploy

**Vercel** is the deploy target. `vercel.json` sets:
- No build command (static repo).
- `api/concierge.mjs` runs with 1024MB / 30s.
- Global `X-Robots-Tag: noindex, nofollow` + strict referrer policy.
- `.vercelignore` keeps `docs/`, `.claude/`, `*.md`, and the local `assets/*.jpg` out of the deploy.

To deploy:

```bash
vercel                # preview URL
vercel --prod         # promote to production (requires Simon's AUTORIZO)
```

Deploy history + preview URLs are visible in the Vercel dashboard for the linked project. The current M5.4 was deployed on 2026-08-10 (per user memory). **M5.5a / b / c have NOT been deployed** — the last live version is M5.4 committed at `5687274`.

---

## 7 · Supabase — schema and state

**Project:** `mtyemgfovvmjrsxevcgh` (public URL: `https://mtyemgfovvmjrsxevcgh.supabase.co`).

### Migrations already applied (in order)

```
docs/migrations/001_phase1_schema.sql        Canonical entity tree + RLS + concierge tables
docs/migrations/002_seed_properties.sql      Seed madrid + marbella from local JSON
docs/migrations/003_concierge_conversation_key.sql
docs/migrations/004_concierge_conversation_unique.sql
docs/supabase-fix-rls.sql                    One-off RLS repair (already applied)
```

`docs/supabase-schema.sql` is the original single-file schema, superseded by the migrations. Kept as history.

### Tables the admin currently reads / writes

| Table | Admin reads | Admin writes | Notes |
|---|---|---|---|
| `properties` | index + workspace load | `content` (M5.2), `assets` (M5.4), `knowledge` (M5.5c) | Generated cols `name_en/name_es/location/reference/cover_image/property_type/price` |
| `concierge_conversations` | M5.5b History | never | RLS: `authenticated reads conversations` |
| `concierge_messages` | M5.5b expand | never | RLS: `authenticated reads messages` |
| `leads / sessions / analytics_events` | pre-M5 | pre-M5 | historical text `property` col preserved |
| `organizations / agents` | placeholders | not yet | reserved for future project B (Agent Experience) |
| `audits` | none yet | none yet | table exists (001 §4); M5.6 will consume it |

### RLS relevant to the admin

- `authenticated all properties` — full read/write for signed-in operator
- `authenticated reads conversations` / `authenticated reads messages` — SELECT only
- `authenticated all audits` — full read/write (for M5.6)

### Runtime data facts (verified 2026-08-14)

- `properties` rows: 2 (madrid, marbella)
- `concierge_conversations`: 13 (madrid 10, marbella 3) — **all have `property_id = NULL`** (see risk R2)
- `concierge_messages`: 20
- `properties.updated_at` for madrid after M5.5c validation: `2026-08-14T19:03:37.563387+00:00` (baseline semantic-restored)

### Applying migrations on a new environment

If you ever spin up a fresh Supabase project (do not do this on the production one without AUTORIZO): run `001 → 002 → 003 → 004` in order via Supabase SQL Editor. Each is idempotent per its own header. Then create an operator account by hand in Authentication → Users.

---

## 8 · Milestone history

Complete list of milestones executed on this repo:

| # | Scope | State | Commit |
|---|---|---|---|
| Phase-1 M1–M4 | schema, seeds, concierge persistence, RLS | ✅ deployed | pre-`918af67` |
| **M5.2** | Content editor | ✅ deployed 2026-08-10 | `918af67` (origin/master) |
| **M5.3** | Workspace Overview enrichment | ✅ done, unpushed | `1748109` |
| **M5.4** | Assets editor (URL-only) | ✅ done, unpushed | `5687274` |
| **M5.5a** | Experience preview tab | ✅ done, unpushed | `d0037f1` |
| **M5.5b** | Concierge History panel | ✅ done, unpushed | `eab3a92` (HEAD) |
| **M5.5c** | Concierge Knowledge editor | ✅ done + real-save validated, **uncommitted** | working tree |
| M5.6 | Audits + Larum Score | ⏳ pending | — |
| M5.7 | Analytics (global + per-property + Leads tab) | ⏳ pending | — |

---

## 9 · Locked architectural decisions

Do not renegotiate these while continuing M5.6 / M5.7:

1. **Additive-only for M5.** Every editor writes to a single JSONB column via `UPDATE properties`. No schema changes, no new tables, no RLS changes.
2. **Cache write-through in property_store.** After UPDATE, mutate the cached row with a deep-clone. No re-fetch.
3. **Deep-clone draft, unknown-key preservation.** Editors never normalize the JSONB. What was loaded round-trips on save (modulo jsonb key reordering — R3).
4. **Local event delegation for new editors.** Post-M5.5b editors use `data-*-action` + one `addEventListener('click', …)` on their container. Zero `window.__*` globals. Older editors kept globals — not a defect (R4).
5. **No visitor / API / migration / RLS changes.** Locked since M5 approval.
6. **Concierge panel is a two-subtab controller.** Knowledge lives inside Concierge, not as a top-level tab.
7. **`property_slug` is the concierge history filter** (not `property_id`). See R2.
8. **`facts[key].value` type-preserved.** string / number / null all supported.
9. **Space cross-ref safety in Knowledge editor.** Referenced spaces cannot be removed via UI; rename requires two confirms. Editor never mutates `content`.
10. **Unknown surroundings shapes → read-only JSON.** Structured editors only for known shapes.

### Protected files (byte-identical throughout M5.3 → M5.5c)

Do **not** touch during M5.6 or M5.7 unless the milestone scope explicitly permits it:

```
api/**                                    (concierge, data, rate, pack)
docs/migrations/**                        (001–004)
property-loader.js                        (visitor loader + validator)
property-pack.js                          (offline pack — generated)
app.js                                    (visitor runtime)
analytics.js                              (client analytics engine)
build-pack.js                             (pack generator)
validate-content.js                       (CLI validator)
consent.js                                (cookie gate)
supabase-config.js                        (anon client)
styles.css                                (visitor styles)
index.html                                (visitor entry)

admin/admin-content-editor.js             (M5.2)
admin/admin-assets-editor.js              (M5.4)
admin/admin-experience-preview.js         (M5.5a)
admin/admin-workspace.js                  (no tab reorder / no mount removal)
admin/admin-router.js
admin/admin-core.js
admin/admin-ui.js
admin/admin-dashboard.js
admin/admin-clients.js
admin/admin-leads.js
admin/admin-sessions.js
admin/admin-properties.js
admin/admin-property-store.js *           (additive extensions only)
admin/admin-concierge-panel.js **         (only if M5.6/M5.7 adds a new subtab per pattern)
admin/admin-knowledge-editor.js           (M5.5c)
```

`*` additive extensions like `saveScore` for M5.6 are the only expected mutations.
`**` if M5.6 adds an Audit sub-view under the workspace, do NOT touch this file; the Audit tab is a top-level workspace tab.

---

## 10 · Risks / technical debt (do NOT fix now)

**R1. Singleton editor state.** Every editor keeps state at module scope. An ad-hoc second mount overwrites the singleton. In production only one mount is ever live; the hazard is only exposed by ad-hoc test mounts. M5.5b eliminated the `ReferenceError` variant; state contention remains as a design property.

**R2. `property_id` NULL on every concierge conversation.** `api/_data.mjs::upsertConversation` does not resolve slug → uuid. History filters on `property_slug` today. When/if the API writes `property_id`, extend the filter to `.or('property_slug.eq.…,property_id.eq.…')` before disabling the slug branch. Do NOT modify `api/_data.mjs` in M5.6/M5.7 scope.

**R3. PostgreSQL jsonb key order.** Dicts (`facts`, `systems`, `spaces`, `interestSignals`, …) may come back reordered. Arrays preserve order. Any knowledge-byte comparison must be semantic (see the `semEqual` helper used in M5.5c validation). Not corruption.

**R4. Older editors still use `window.__ce* / __ae* / __ex*` globals.** Works in single-mount production; shares the M5.5b bug class if ever double-mounted. Not scheduled for refactor. If M5.6 introduces a companion Audit editor, migrate them to local delegation first.

**R5. Interest name / qualification trigger schema drift.** Editor allows any strings; visitor consumers gate on hardcoded enums. Warnings surface at edit time; no DB enforcement.

**R6. Knowledge editor `+ Add surroundings block` only creates `{en, es, status}`.** Exotic shapes require SQL. Acceptable for M5.

**R7. Concierge History pagination is snapshot at mount.** New turns don't appear without remount. No realtime subscription.

**R8. `admin-knowledge-editor.js` is 1123 lines (2× the design-pass estimate).** Well-factored but monolithic. If M5.6 needs a similar editor, extract a shared repeater helper first.

**R9. Windows CRLF warnings.** Cosmetic. Repo is Windows-native.

**R10. Uncommitted M5.5c on handoff.** First action on the new terminal: `git status` to observe → then commit M5.5c before starting M5.6.

**R11. M5.3–M5.5c not deployed.** Vercel still runs M5.4-era code (per user memory, deployed 2026-08-10). Simon must AUTORIZO before pushing/deploying newer commits.

**R12. Only 2 seeded properties.** Everything (validators, UI, tests) has been exercised against `madrid` + `marbella`. Adding a third property is straightforward but untested end-to-end.

---

## 11 · Continuation checklist for the new PC

```bash
# 1. Verify state
git rev-parse HEAD                        # must be eab3a92
git log --oneline origin/master..HEAD     # 4 commits (M5.3 → M5.5b)
git status --short                        # 3 modified + untracked M5.5c + this doc

# 2. Install
npm install

# 3. Restore .env.local (values from old machine or Vercel dashboard)
#    ANTHROPIC_API_KEY
#    SUPABASE_SERVICE_ROLE_KEY

# 4. Smoke test
python -m http.server 4173
# → http://localhost:4173/admin.html — log in as contactolarum@gmail.com

# 5. Commit M5.5c (recommended first action)
git add admin.html admin/admin-concierge-panel.js \
        admin/admin-property-store.js admin/admin-knowledge-editor.js
git commit -m "M5.5c: concierge knowledge editor

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"

# 6. Commit handoff docs (separate commit, historical only)
git add docs/LARUM_PROJECT_HANDOFF.md docs/LARUM_ADMIN_HANDOFF_M5.5C.md docs/NEXT_PHASES.md
git commit -m "docs: project handoff for M5.5c → M5.6

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"

# 7. Only after Simon's AUTORIZO:
git push origin master                    # 5 or 6 commits at once
vercel --prod                             # deploy
```

### Then start M5.6 (Audits + Larum Score)

Read before implementing:
- `docs/PHASE_1_SPEC.md` §Audit
- `docs/migrations/001_phase1_schema.sql` §4 (audits table)
- `docs/AI_CONCIERGE_SPEC.md` (concierge-anchored scoring hints)
- Workspace Audit tab today: `emptyState('Audit & Readiness', 'Coming in M5.6.')` — that's the mount point.

For M5.7 (Analytics) read `admin/admin-core.js` (existing analytics_events queries), `analytics.js` (event schema), and `admin/admin-ui.js` (barChart / donutChart / interestBars ready to reuse).

Do not push to `origin/master` until Simon explicitly authorizes.

---

## 12 · Future projects (out of scope for M5)

Developed as separate projects once M5 closes:

- **A. Property Experience visual improvements** — visitor-facing refinements (`app.js`, `styles.css`, section layouts, motion, imagery). Owned by design + frontend.
- **B. Agent Experience / Agent pages** — fills the "Agentes" sidebar placeholder. Full agent CRUD + Agent Presence pages per `docs/PHASE_1_SPEC.md` §Agent.
- **C. Sales / Prospecting Engine** — Larum's outbound engine (WhatsApp / email skills, prospecting, scoring). Lives in `larum-content-engine` per user memory, not this repo.

Do not begin any of the three from within M5.6 or M5.7.

---

## 13 · Reference

- Repo: <https://github.com/larumstudio/larum-property-experience>
- Supabase project: `mtyemgfovvmjrsxevcgh`
- Anthropic model in use: `claude-sonnet-5` (overridable via `CONCIERGE_MODEL`)
- Operator account: `contactolarum@gmail.com`
- Production property URLs (external): Christie's Madrid M1558 · NVOGA Marbella NVG-H11
- Companion docs: `LARUM_ADMIN_HANDOFF_M5.5C.md`, `NEXT_PHASES.md`, `PHASE_1_SPEC.md`, `TECH_SPEC.md`, `AI_CONCIERGE_SPEC.md`, `DATABASE.md`, `DEPLOY.md`

### Reference commit hashes

```
eab3a92  M5.5b     ← HEAD (local)
d0037f1  M5.5a
5687274  M5.4
1748109  M5.3
918af67  M5.2      ← origin/master
```

*M5.5c is at HEAD + working tree; not yet committed.*

---

*End of full-project handoff.*
