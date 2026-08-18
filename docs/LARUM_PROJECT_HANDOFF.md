# Larum Property Experience — Full Project Handoff

**Snapshot date:** 2026-08-18
**Snapshot cause:** Project State Reconciliation — the previous version of this document (dated 2026-08-14, HEAD `eab3a92`) was 15+ commits stale: it predated M5.6, M5.7, all of LPE-01→12, and Admin-M5.X. This version was reconstructed from `git log`, the current test suite, and each phase's own closure document — not from chat history.
**Author:** Simon (Larum Studio) + Claude

This is the single canonical document for taking the entire repository — visitor experience, admin, API, deploy, database — to another machine and resuming work cleanly. Read this end-to-end before touching anything. If this document and `git log --oneline -30` ever disagree, **trust `git log`** and re-derive this file; do not assume this file is current just because it says so at the top.

Companion documents:
- `docs/NEXT_PHASES.md` — short "what's closed / what's open / what's next," reconciled alongside this file
- `docs/M5_X_CLOSURE.md`, `docs/LPE_07_CLOSURE.md` … `docs/LPE_12_CLOSURE.md` — the authoritative record for each individual phase; this document summarizes, they are the source
- `docs/LARUM_ADMIN_HANDOFF_M5.5C.md` — deep detail on M5.2–M5.5c specifically; **historical**, written 2026-08-14, superseded by this document and by the M5.6/M5.7/Admin-M5.X closures for anything after M5.5c

---

## 0 · TL;DR (30 seconds)

- **Project:** Larum Property Experience — private prototype. A luxury real-estate experience per property + a grounded AI concierge + a private admin.
- **Stack:** static HTML/CSS/vanilla JS, one Vercel serverless function (`api/concierge.mjs`), Supabase (Postgres + Auth + RLS), Anthropic Claude. Node ≥20. One production npm dependency: `@anthropic-ai/sdk`; four dev-only (`@playwright/test`, `axe-core`, `lighthouse`, `chrome-launcher`, added in LPE-12).
- **Where the code lives:** GitHub `larumstudio/larum-property-experience`, branch `master`. Deployed to Vercel (repo has a `.vercel/` link). Repo root is `prototype/`.
- **Git state at this snapshot:** `HEAD = cd825d0` (`feat(admin-m5x): create property, revisions and status transitions`). **17 unpushed commits** ahead of `origin/master` (`origin/master` is still at `918af67`, M5.2 — the last thing ever pushed). Working tree clean except a pre-existing untracked `test-results/` (Playwright artifact, harmless).
- **Where things stand:** M5 (Admin, M5.0→M5.7) is fully closed. LPE (Visitor Experience, LPE-01→12) is fully closed. Admin-M5.X (a follow-on Admin phase, unnumbered in either track) is fully closed. **No phase is currently in progress.** The next decision is what LPE-13 should be — not yet defined, see §12.

---

## 1 · Exact git state at this snapshot

| Field | Value |
|---|---|
| Repo | `larumstudio/larum-property-experience` |
| Local branch | `master` |
| Local HEAD | `cd825d0` — `feat(admin-m5x): create property, revisions and status transitions` |
| `origin/master` HEAD | `918af67` — `M5.2: content editor, GitHub preparation` |
| Local ahead of origin | **17 commits, unpushed** |
| Working tree | Clean, except untracked `test-results/` (Playwright output, not part of any change, not gitignored — low-priority cleanup item) |

### Full commit history, oldest → newest (`git log --oneline --all`)

```
e3289f2  Baseline: Larum Property Experience v2.1.0 as deployed
34f6ac0  docs: Phase 1 specification and visual direction
c9d71aa  M2: canonical property entity, ownership chain, concierge persistence
605a2d3  M3: the experience reads properties from the database
edb3d00  docs: record the payload cost M3 introduced
b502e12  M4: rate limiting, conversation persistence, dossier from database
1807968  M5.1: admin property index and lazy loading
918af67  M5.2: content editor, GitHub preparation          ← origin/master HEAD
1748109  M5.3: workspace overview enrichment
5687274  M5.4: assets editor with URL-only media management
d0037f1  M5.5a: experience preview tab
eab3a92  M5.5b: concierge history panel
392f016  M5.5c: concierge knowledge editor
cba0c0d  docs: M5.5c handoff package and next-phases companion
386becd  M5.6: audits + Larum Score
e4489be  M5.7: property analytics, property leads, global analytics
8dcb90e  docs: M5 final handoff — admin milestone complete
5746934  integrate LPE-01->06 + LPE-10: visitor experience architecture
6c3d3b9  LPE-07: Build Readiness model — headless readiness() + admin Readiness tab
49ad05a  feat(lpe-08): lazy loading — split loadFromDb into loadIndex + loadProperty
6f07b92  LPE-09: experience_revisions + db-v2 loader + admin revision lifecycle
8c1d9c8  LPE-10: Canonical analytics IDs — admin null-report surfacing
4fcbb78  LPE-11: Villa vertical slice — acceptance test suite
48ae6b1  LPE-12: Harden QA — Playwright smoke, axe-core, Lighthouse gates
cd825d0  feat(admin-m5x): create property, revisions and status transitions   ← HEAD
```

No commit has been pushed since `918af67`. Nothing here has been reverted, amended, or rebased — this is a straight linear history.

---

## 2 · What this project is

A private demo aimed at ultra-high-end residences. Each property has its own **experience page** — cinematic scroll, DNA analysis, spatial map, concierge chat, calculator — served from static HTML rendered by a single vanilla JS runtime, hydrated from the Supabase database (canonical, two variants — see §4a), local JSON files (authoring), or an offline pack (fallback).

Complementing the visitor experience:

- A **grounded AI concierge** (`api/concierge.mjs`) that answers only from the property's dossier — never invents facts about a multi-million-euro residence. Powered by Claude with prompt caching.
- A **private admin** at `/admin.html` behind Supabase Auth — property list (with Create Property), per-property workspace with content / assets / experience preview / concierge history+knowledge / audits / readiness / revisions / analytics / leads tabs, plus global dashboard / leads / analytics / sessions views.
- A **Larum Studio skill layer** (referenced but lives in a separate repo, `larum-content-engine`) that generates outbound content, audits and prospecting materials. Not part of this repo.

Two live properties: `madrid` (Christie's M1558, Barrio de Salamanca) and `marbella` (NVOGA NVG-H11, Nueva Andalucía).

---

## 3 · Repository structure (as of this snapshot)

```
prototype/                            ← the repo root (git root)
├── index.html                        Visitor entry point
├── admin.html                        Admin entry (behind Supabase Auth)
│
├── app.js                            Visitor runtime (vanilla JS)
├── experience-shell.js               LPE-03 shell — module mounting/lifecycle
├── analytics.js                      Client-side event engine + canonical-ID dual-write (LPE-10)
├── consent.js                        Cookie/consent gate
├── property-loader.js                Loader: db-v2 → db → files → pack (+ validator)
├── property-pack.js                  Generated offline pack (build-pack.js)
├── build-pack.js                     Regenerates property-pack.js
├── validate-content.js               CLI validator (uses property-loader)
├── supabase-config.js                Anon client bootstrap
├── styles.css                        All visitor styles
│
├── contact-config.json               Global contact settings
├── purchase-config.json              Regional acquisition tax matrix
│
├── modules/                          LPE-04 — 6 P0 experience modules + registry
│   ├── arrival.js
│   ├── property-dna.js
│   ├── lived-sequence.js
│   ├── verified-intelligence.js
│   ├── concierge.js
│   ├── enquiry-handoff.js
│   └── registry.js
│
├── schemas/                          LPE-01/02/05/07 — domain schemas, adapters, readiness
│   ├── *.schema.json                 property / content / knowledge / asset / module / family-theme /
│   │                                 experience-manifest / experience-revision / asset-contract
│   ├── adapters/                     legacy → canonical adapters (index.js declares MODULE_IDS — see §11 R13)
│   ├── families.js                   family recipes (also declares MODULE_IDS — see §11 R13)
│   ├── module-registry.js
│   ├── asset-contracts.js / asset-resolver.js
│   └── readiness.js                  LPE-07 headless readiness model
│
├── admin/
│   ├── admin-router.js               Hash-based SPA router (deep-link / refresh capable)
│   ├── admin-core.js                 Auth gate, session, shared state, helpers
│   ├── admin-ui.js                   Reusable components (tabs, badges, charts…)
│   ├── admin-dashboard.js            /dashboard
│   ├── admin-clients.js              /clients (leads dashboard)   [named admin-leads.js on disk]
│   ├── admin-leads.js                Leads section (M5.7)
│   ├── admin-sessions.js             Session drawer
│   ├── admin-analytics.js            Global analytics (M5.7) + LPE-10 null-report card
│   ├── admin-properties.js           /properties list + Create Property (Admin-M5.X)
│   ├── admin-workspace.js            Per-property workspace (tab controller) — Overview/Audit/Readiness/
│   │                                 Content/Assets/Experience/Concierge/Revisions/Analytics/Leads
│   ├── admin-property-store.js       Property index + cache + save methods + revision lifecycle
│   ├── admin-content-editor.js       M5.2 — content editor
│   ├── admin-assets-editor.js        M5.4 — assets editor (URL-only)
│   ├── admin-experience-preview.js   M5.5a — iframe of the visitor experience
│   ├── admin-concierge-panel.js      M5.5b/c — History + Knowledge subtab controller
│   ├── admin-knowledge-editor.js     M5.5c — Knowledge editor
│   ├── admin-audit-panel.js          M5.6 — Audit tab
│   ├── admin-readiness-panel.js      LPE-07 — Readiness tab
│   ├── admin-property-analytics.js   M5.7 — per-property Analytics tab
│   └── admin-property-leads.js       M5.7 — per-property Leads tab
│
├── api/                              Vercel serverless functions
│   ├── concierge.mjs                 POST /api/concierge — the concierge endpoint
│   ├── _data.mjs                     Persist turn, dossier fetch (revision-aware, LPE-09), warm cache
│   ├── _pack.mjs                     Pack fetch helper for server context
│   └── _rate.mjs                     Per-IP + per-session rate limiter
│
├── properties/
│   ├── index.json                    Registry: default + order + rules
│   ├── _template/                    Canonical scaffold (content/knowledge/assets)
│   ├── madrid/                       content.json · knowledge.json · assets.json
│   └── marbella/                     content.json · knowledge.json · assets.json
│
├── tests/                            LPE-01 → LPE-12 + Admin-M5.X suites (see §8)
│   └── e2e/                          Playwright smoke + a11y specs (LPE-12), static-server.js
│
├── tools/
│   └── generate-seed.js              Reads properties/*.json → 002_seed SQL
│
├── docs/                             This document + specs (NOT deployed)
│   ├── LARUM_PROJECT_HANDOFF.md      ← this file
│   ├── NEXT_PHASES.md                Short companion — closed/open/pending/next
│   ├── M5_X_CLOSURE.md               Admin-M5.X closure
│   ├── LPE_07_CLOSURE.md … LPE_12_CLOSURE.md   per-phase closures (+ matching *_REPORT.md)
│   ├── LPE_09_DISCOVERY_REPORT.md, LPE_10_PRE_IMPLEMENTATION_DISCOVERY.md
│   ├── LARUM_ADMIN_HANDOFF_M5.5C.md  Admin-specific deep handoff — historical, see note in §0
│   ├── PROJECT_HANDOFF.md            Original Phase-1 handoff (kept as history)
│   ├── PROJECT_CONTROL.md            Milestone control doc
│   ├── PHASE_1_SPEC.md               Phase 1 spec (still authoritative)
│   ├── TECH_SPEC.md                  Tech spec (still authoritative)
│   ├── AI_CONCIERGE_SPEC.md          Concierge spec
│   ├── DATABASE.md                   Schema reference
│   ├── DEPLOY.md                     Deploy runbook
│   ├── V2_SCOPE.md, V1_GAP_ANALYSIS.md, VISUAL_DIRECTION.md, START_V2.md
│   ├── ASSET_PERMISSION_EMAILS.md    Templates for agency asset requests
│   ├── supabase-schema.sql           Original single-file schema (superseded by migrations/)
│   ├── supabase-fix-rls.sql          One-off RLS fix (already applied)
│   └── migrations/                   Authored migrations — see §7 for applied-vs-authored status
│       ├── 001_phase1_schema.sql
│       ├── 002_seed_properties.sql
│       ├── 003_concierge_conversation_key.sql
│       ├── 004_concierge_conversation_unique.sql
│       └── 005_experience_revisions.sql          AUTHORED, NOT APPLIED — see §7
│
├── playwright.config.js              LPE-12 — desktop + mobile projects
├── assets/                           Local JPGs (superseded by CDN URLs — kept for authoring)
│
├── package.json                      npm scripts (build, validate, seed, check, test:*)
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
2. `property-loader.js` runs `LarumLoader.autoLoad()`, which tries sources **in this order**: `db-v2` (LPE-09, revision-aware + lazy) → `db` (LPE-08, lazy, no revisions) → `files` → `pack` (offline fallback, eager, both properties bundled). Override with `?source=db-v2|db|files|pack`.
3. `experience-shell.js` (LPE-03) mounts the 6 P0 modules (`modules/*.js`) via `modules/registry.js`, driven by the derived experience manifest (`schemas/`).
4. `app.js` orchestrates one property at a time (`?property=madrid` etc.). No framework.
5. Analytics events buffer in `analytics.js` and POST to `analytics_events` under RLS, dual-writing canonical `property_id`/`revision_id` fields (LPE-10) — these resolve to real UUIDs only once migration 005 is applied and a revision is published (see §7).
6. Concierge chat: client posts to `POST /api/concierge` → grounded response, revision-aware (LPE-09) with graceful fallback to the property's live content if no revision pointer exists. Falls back to a client-side keyword engine if the API is down.

### 4b · Admin (`admin.html` → `admin/*.js`)

1. `admin.html` gates behind Supabase Auth (`admin-core.js::boot`). Only signed-in operators reach the app; RLS still enforces per-row.
2. `admin-router.js` is hash-based: `#dashboard`, `#properties`, `#workspace/<slug>`, `#auditorias`, `#leads`, `#analytics`, `#sessions`, etc. **Supports direct deep-link and page refresh** — `init()` reads `location.hash` on load and routes straight there, without requiring any other view to have rendered first. This matters: `admin-property-store.js` is written so `loadProperty()` alone (no prior `loadIndex()`) is enough to load a Workspace correctly, including its migration-005 self-healing (Admin-M5.X fix — see `docs/M5_X_CLOSURE.md`).
3. `admin-property-store.js` is the admin's data layer: `loadIndex()` / `loadProperty(slug)` (full row + cache), `createProperty()`, `saveContent` / `saveAssets` / `saveKnowledge` / `savePropertyStatus` / `savePropertyMeta`, `createRevision` / `publishRevision` / `rollback`, `loadAgents`, `loadAudits`/`createAudit`/etc.
4. Property Workspace lives in `admin-workspace.js` and hosts the full tab tree (see §5).

### 4c · API (Vercel serverless)

`api/concierge.mjs` (the only endpoint):
- POST-only, requires `ANTHROPIC_API_KEY`. Returns 503 if unset (client falls back).
- Rate-limited by `api/_rate.mjs` (per IP + per session).
- Loads the property dossier via `api/_data.mjs::getDossier`/`fetchDossier` (Supabase read with warm in-memory cache, revision-aware since LPE-09; falls back to server-side pack).
- Prompt-caches the dossier under Anthropic `cache_control: ephemeral`.
- Persists every turn to `concierge_conversations` + `concierge_messages` via service role.
- Response schema is a JSON object with `answer / confidence / spaces / scenes / documents / interests / followUp`.

### 4d · Skills layer (separate repo)

Referenced by user memory (`larum-content-engine` repo). Not part of this repo.

---

## 5 · Property Workspace — tab tree (current, all closed)

```
Property Workspace  (admin/admin-workspace.js)
├─ Overview       ✅ M5.3 + Admin-M5.X   (status transitions, metadata, agent assignment added in M5.X)
├─ Audit          ✅ M5.6                (admin-audit-panel.js)
├─ Readiness      ✅ LPE-07              (admin-readiness-panel.js)
├─ Content        ✅ M5.2                (admin-content-editor.js)
├─ Assets         ✅ M5.4                (admin-assets-editor.js)
├─ Experience     ✅ M5.5a               (admin-experience-preview.js)
├─ Concierge      ✅ M5.5b + M5.5c       (admin-concierge-panel.js)
│    ├─ History   ✅ M5.5b
│    └─ Knowledge ✅ M5.5c               (admin-knowledge-editor.js)
├─ Revisions      ✅ Admin-M5.X          (UI for the LPE-09 store functions; data-empty until migration 005 applied)
├─ Analytics      ✅ M5.7                (admin-property-analytics.js)
└─ Leads          ✅ M5.7                (admin-property-leads.js)
```

Every tab is implemented. Nothing in the Workspace is a placeholder anymore.

---

## 6 · Bringing the project up on a new machine

### 6.1 Prerequisites

- **Git** (any recent)
- **Node ≥ 20** (from `package.json engines`)
- **npm** (bundled with Node)
- **Python** (for the local static server used by `.claude/launch.json`) OR any other static server on port 4173
- **Vercel CLI** (`npm i -g vercel`) if you'll deploy from this machine
- A modern browser + Claude Code / Claude Desktop if continuing with agents
- Chrome/Chromium in PATH if running LPE-12's Lighthouse gate locally

Windows-native repo (CRLF warnings are expected; do not "fix" them).

### 6.2 Clone

```bash
git clone https://github.com/larumstudio/larum-property-experience.git
cd larum-property-experience
```

**Note:** cloning gets only what has been pushed — `origin/master` is still at `918af67`. Everything from `1748109` (M5.3) through `cd825d0` (HEAD) exists only locally until pushed. If moving machines, carry the whole `prototype/` folder (working tree + `.git`) rather than relying on a fresh clone, or push first if authorized.

### 6.3 Install

```bash
npm install
```

### 6.4 Environment variables (`.env.local` — NOT in git)

```
# Anthropic — required by api/concierge.mjs
ANTHROPIC_API_KEY=sk-ant-...

# Supabase — SERVICE ROLE key (server-only, never ship to browser)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Optional: override the concierge model without code change
# CONCIERGE_MODEL=claude-sonnet-5   (default)
```

Both are also configured in the Vercel project (Production + Preview envs).

Public values already in git: Supabase URL and anon key, in `supabase-config.js` (safe: RLS enforces every read).

### 6.5 Local run

```bash
python -m http.server 4173
# → http://localhost:4173/           (visitor)
# → http://localhost:4173/admin.html (admin — needs Supabase Auth login)
```

The admin requires an operator account created by hand in Supabase → Authentication → Users. Operator account: `contactolarum@gmail.com`.

To run the concierge endpoint locally: `vercel dev` (serves both static + `/api/concierge`).

### 6.6 npm scripts

```
npm run build            # regenerate property-pack.js from properties/*
npm run validate         # run property-loader validator against local files
npm run seed             # emit tools/generate-seed.js SQL from local JSON
npm run check            # build + validate — 0 issues / 5 warnings is the current baseline
npm run test:lpe-01 … test:lpe-12       # per-phase LPE suites
npm run test:lpe-12:smoke / :a11y / :perf   # Playwright/axe/Lighthouse individually
npm run test:admin-m5x   # Admin-M5.X suite (43 tests)
```

None of these touch the database.

### 6.7 Deploy

```bash
vercel                # preview URL
vercel --prod          # promote to production (requires Simon's AUTORIZO)
```

The current live production version is still **M5.2** (deployed 2026-08-10). Everything from M5.3 onward — all of M5.3–M5.7, all of LPE, and Admin-M5.X — exists on `master` locally/unpushed but has **never been deployed**.

---

## 7 · Supabase — schema and state

**Project:** `mtyemgfovvmjrsxevcgh` (public URL: `https://mtyemgfovvmjrsxevcgh.supabase.co`). *(Carried forward from the prior handoff — not re-verified this session; confirm against the Supabase dashboard if in doubt.)*

### Migrations — authored vs. applied

```
docs/migrations/001_phase1_schema.sql        APPLIED — canonical entity tree + RLS + concierge tables
docs/migrations/002_seed_properties.sql      APPLIED — seed madrid + marbella
docs/migrations/003_concierge_conversation_key.sql   APPLIED
docs/migrations/004_concierge_conversation_unique.sql APPLIED
docs/supabase-fix-rls.sql                    APPLIED — one-off RLS repair
docs/migrations/005_experience_revisions.sql AUTHORED (LPE-09), COMMITTED, NOT APPLIED
```

**Migration 005 in detail:** creates `experience_revisions` (append-only revision snapshots) and `properties.experience_revision_id` (nullable publish pointer). Additive and idempotent; does not touch 001–004. Every consumer already degrades gracefully in its absence (`property-loader.js`'s `db-v2` path falls back to `db`; `analytics.js` writes `null` canonical IDs; the Admin Revisions tab shows an explanatory message; `admin-property-store.js` self-heals its own column detection, fixed in Admin-M5.X). **Not blocking anything today.** Applying it requires Simon's explicit **AUTORIZO** — it is a real production database change, low-risk but not something to run unattended.

### Tables the admin currently reads / writes

| Table | Admin reads | Admin writes | Notes |
|---|---|---|---|
| `properties` | index + workspace load | `content`, `assets`, `knowledge`, `status`, `display_order`, `is_default`, `agent_id` (Admin-M5.X) | Generated cols `name_en/name_es/location/reference/cover_image/property_type/price`; `experience_revision_id` present only if migration 005 applied |
| `experience_revisions` | Revisions tab (Admin-M5.X) | create/publish/rollback (Admin-M5.X UI over LPE-09 store functions) | Table does not exist until migration 005 is applied |
| `concierge_conversations` / `concierge_messages` | History subtab | never (writes happen server-side via service role) | |
| `leads` / `sessions` / `analytics_events` | M5.7 dashboards | pre-M5 write paths | historical text `property` column preserved |
| `organizations` / `agents` | Create Property, agent dropdowns | not yet | `agents` seeded manually; `createProperty` assumes exactly one organization row |
| `audits` | M5.6 Audit tab | M5.6 create/update/delete | |

### RLS relevant to the admin

- `authenticated all properties` / `authenticated all audits` — full read/write for signed-in operator
- `authenticated reads conversations` / `authenticated reads messages` — SELECT only
- `authenticated all revisions` — full read/write (from migration 005, once applied)
- `anon reads published properties` — visitors, published rows only
- `anon reads current revision` — visitors, only the revision a published property's pointer references (from migration 005, once applied)

---

## 8 · Testing state

```
tests/lpe-01-schemas.test.js       PASS
tests/lpe-02-manifest.test.js      PASS
tests/lpe-03-shell.test.js         PASS
tests/lpe-04-modules.test.js       PASS
tests/lpe-05-families.test.js      PASS
tests/lpe-06-assets.test.js        PASS
tests/lpe-07-readiness.test.js     PASS
tests/lpe-08-lazy.test.js          19/19 PASS
tests/lpe-09-revisions.test.mjs    23/23 PASS
tests/lpe-10-analytics.test.js     PASS
tests/lpe-11-villa.test.js         38/38 PASS
tests/lpe-12-gates.test.js         33/33 PASS
tests/e2e/smoke/smoke.spec.js      18/18 PASS (Playwright, desktop+mobile)
tests/e2e/smoke/a11y.spec.js       6/6 PASS (axe-core, desktop+mobile)
tests/lpe-12-lighthouse.js         PASS (runnable-now gates) — see §9 for the performance nuance
tests/admin-m5x.test.mjs           43/43 PASS
npm run check                      0 issues / 5 warnings (stable baseline since LPE-08)
```

All of the above pass as of `cd825d0`. No known failing test anywhere in the suite.

---

## 9 · Performance state

Lighthouse (`tests/lpe-12-lighthouse.js`) reports Performance 66 desktop / 62 mobile, LCP 3.06s / 5.44s. **This is measured against `?source=pack`** — the offline fallback route, which loads both properties' full payload with no lazy loading possible by design. The primary online route (`db-v2` → `db`, both closed since LPE-08/09) is not measured by this harness, because CI has no live Supabase instance to test against. This is a measurement gap, not a confirmed product performance problem — see the correction added to `docs/LPE_12_CLOSURE.md` and `docs/LPE_12_REPORT.md` on 2026-08-18. It does not block any phase.

---

## 10 · Locked architectural decisions

Some of these were written for a specific milestone's scope (M5.6/M5.7) and have since been superseded by later phases actually shipping; they are marked accordingly. Treat unmarked items as still globally valid.

1. **Additive-only for admin edits.** Every editor writes to a JSONB column or an allow-listed set of relational columns via `UPDATE properties` — never a schema change from the admin layer itself. *(Still valid — Admin-M5.X's `savePropertyStatus`/`savePropertyMeta` follow this exactly.)*
2. **Cache write-through in the property store.** After a write, mutate the cached row in place (deep-clone or direct field assignment) rather than re-fetching. *(Still valid — and the specific bug this discipline exists to prevent is exactly what Admin-M5.X found and fixed in `publishRevision`/`rollback`; see `docs/M5_X_CLOSURE.md`.)*
3. **Deep-clone draft, unknown-key preservation.** Editors never normalize the JSONB; what was loaded round-trips on save. *(Still valid.)*
4. **No visitor / API / migration / RLS changes without explicit scope.** *(Originally written as a blanket lock for M5.6/M5.7. Superseded in spirit: LPE-07 through LPE-12 did modify `property-loader.js`, `api/_data.mjs`, `analytics.js`, and authored (not applied) migration 005 — each under its own phase's explicit, documented authorization. Read this rule today as "no changes to visitor/API/migration/RLS outside of an approved phase's stated scope," not as a permanent prohibition.)*
5. **`property_slug` is the concierge history filter, not `property_id`.** `api/_data.mjs::upsertConversation` still does not resolve slug → UUID for `concierge_conversations`; this is unchanged since M5.5b.
6. **Protected-files lists are per-phase, not global.** Every phase from LPE-07 onward states its own list of files it will not touch (see each `docs/LPE_*_CLOSURE.md` §"Immovable constraints"). There is no single permanent list — check the closure doc of whichever phase is active for what is currently off-limits.

---

## 11 · Known issues / technical debt

**R13. `MODULE_IDS` double declaration (SyntaxError).** `schemas/families.js` and `schemas/adapters/index.js` both declare a top-level `const MODULE_IDS`. Confirmed reproducible if both load as classic (non-module) `<script>` tags in the same document — the second declaration throws. First flagged LPE-07, unresolved through LPE-12. Non-fatal in current usage. **Not yet scheduled** — a candidate for LPE-13, pending Simon's decision (see `docs/NEXT_PHASES.md`). Do not fix opportunistically without that approval.

**R14. Lighthouse performance gate measures the wrong route.** See §9. Candidate to close the measurement gap in a future phase; not a blocker.

**R15. `createProperty()` assumes exactly one `organizations` row.** `.from('organizations').select('id').limit(1)` has no explicit ordering. Correct today (single-org design, per migration 001's own comment), would need attention if a second organization is ever seeded.

**R16. `test-results/` untracked, not gitignored.** Playwright output. Harmless, low-priority cleanup.

**R2 (carried forward, still accurate). `property_id` NULL on every concierge conversation.** History filters on `property_slug`. Unchanged since M5.5b.

**R3 (carried forward, still accurate). PostgreSQL jsonb key order** is not guaranteed on read; any knowledge-byte comparison must be semantic, not literal.

**R9 (carried forward). Windows CRLF warnings.** Cosmetic; repo is Windows-native, do not "fix."

Superseded / resolved since the 2026-08-14 handoff (kept here only so a search for the old risk IDs finds where they went): the old **R1** (singleton editor state), **R4** (older editors' `window.__*` globals), **R5** (interest/qualification schema drift), **R6** (knowledge editor surroundings block shape), **R7** (concierge history pagination), **R8** (knowledge editor file size), **R10** (uncommitted M5.5c), **R11** (M5.3+ not deployed — still true, see §6.7, just no longer "a risk," it's the accepted state), **R12** (only 2 seeded properties — still true, still accepted) — none of these were actively fixed; they remain background facts about the codebase, not tracked as open risks requiring action. Consult the 2026-08-14 version of this document via git history if the original R1–R12 wording is needed verbatim.

---

## 12 · Next decision point

**LPE-13 is not yet defined.** A `PROJECT STATE RECONCILIATION REPORT` (2026-08-18) surveyed the evidence and identified candidate directions — fixing R13 (`MODULE_IDS`), closing the R14 performance-measurement gap, applying migration 005 (operational, not a code phase), or picking up whatever the external LPE roadmap package defines next — without selecting one. See `docs/NEXT_PHASES.md` for the current state of that decision. Do not begin implementing any of these without Simon's explicit `APPROVE LPE-13` (or equivalent) first.

---

## 13 · Future projects (out of scope)

Unchanged:

- **A. Property Experience visual improvements** — visitor-facing refinements. Owned by design + frontend.
- **B. Agent Experience / Agent pages** — fills the "Agentes" sidebar placeholder. Full agent CRUD + Agent Presence pages per `docs/PHASE_1_SPEC.md` §Agent.
- **C. Sales / Prospecting Engine** — lives in `larum-content-engine`, separate repo.

Do not begin any of the three without a dedicated approval.

---

## 14 · Reference

- Repo: <https://github.com/larumstudio/larum-property-experience>
- Supabase project: `mtyemgfovvmjrsxevcgh`
- Operator account: `contactolarum@gmail.com`
- Production property URLs (external): Christie's Madrid M1558 · NVOGA Marbella NVG-H11
- Companion docs: `NEXT_PHASES.md`, `M5_X_CLOSURE.md`, `LPE_07_CLOSURE.md`…`LPE_12_CLOSURE.md`, `LARUM_ADMIN_HANDOFF_M5.5C.md` (historical), `PHASE_1_SPEC.md`, `TECH_SPEC.md`, `AI_CONCIERGE_SPEC.md`, `DATABASE.md`, `DEPLOY.md`

### Reference commit hashes

```
cd825d0  Admin-M5.X   ← HEAD (local)
48ae6b1  LPE-12
4fcbb78  LPE-11
8c1d9c8  LPE-10
6f07b92  LPE-09
49ad05a  LPE-08
6c3d3b9  LPE-07
5746934  LPE-01→06 integration
8dcb90e  M5 final handoff (docs)
e4489be  M5.7
386becd  M5.6
392f016  M5.5c
eab3a92  M5.5b
d0037f1  M5.5a
5687274  M5.4
1748109  M5.3
918af67  M5.2      ← origin/master HEAD
```

---

*End of full-project handoff.*
