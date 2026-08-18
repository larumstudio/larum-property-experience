# Admin-M5.X — Create Property, Revisions, Status Transitions — Closure

**Date:** 2026-08-18
**Phase:** Admin-M5.X CLOSED
**Commit:** `cd825d0` — `feat(admin-m5x): create property, revisions and status transitions`

Not part of the M5.0–M5.7 or LPE-01–12 numbering. A follow-on Admin phase started after both M5.7 and LPE-12 were already closed, to fill a gap neither track owned: creating a property from the Admin UI, and exposing the LPE-09 revision lifecycle (`createRevision`/`publishRevision`/`rollback`, store-only since LPE-09) through actual buttons in the Workspace.

---

## Objective

Give the Admin operator (Simon) three things that did not exist before:

1. A way to create a new property from the UI, instead of by hand in Supabase.
2. A way to change a property's lifecycle status (draft → in_production → ready → published → archived) from the UI.
3. A way to actually use the revision system LPE-09 built at the store level — create a revision, publish it, roll back to a previous one — none of which had a UI before this phase (LPE-09 explicitly scoped that out: "Does not wire Admin UI buttons for publish/rollback").

## Scope

In scope: `admin/admin-properties.js`, `admin/admin-property-store.js`, `admin/admin-workspace.js`, `package.json` (one new test script), `tests/admin-m5x.test.mjs` (new).

Out of scope, and confirmed untouched: everything under LPE ownership (`app.js`, `modules/*`, `schemas/*`, `property-loader.js`, `analytics.js`, `experience-shell.js`, `consent.js`, `api/*`, `properties/**/*.json`, `docs/migrations/*`, `index.html`, `styles.css`), and every other `admin/*.js` file not listed above.

## Functionality implemented

- **Create Property** (`admin-properties.js`) — a form (slug, location label, brand, subtitle, region, property type, reference price, agent) with client-side slug validation (`^[a-z0-9]+(-[a-z0-9]+)*$`, matching the DB's `properties_slug_shape` CHECK constraint byte-for-byte) and a uniqueness check against the loaded index before submit. On success, navigates straight into the new property's Workspace.
- **`createProperty()`** (`admin-property-store.js`) — seeds `content`/`knowledge`/`assets` from an initial-shape template matching the existing property JSON contract, resolves the organization, inserts the row, and writes-through to both the in-memory cache and index (no re-fetch).
- **Status transitions** (`admin-workspace.js`, Overview tab) — a `STATUS_TRANSITIONS` map mirroring the DB's `properties_status_valid` CHECK constraint exactly, with a confirm/cancel step gating the two irreversible-feeling transitions (`published`, `archived`).
- **`savePropertyStatus()` / `savePropertyMeta()`** (`admin-property-store.js`) — status updates (auto-stamping `published_at`), and an allow-listed metadata patch (`display_order`, `is_default`, `agent_id`) that rejects any other key even if present in the input object.
- **Revisions tab** (`admin-workspace.js`) — lists revisions for the current property, create/publish/rollback buttons wired to the LPE-09 store functions, and a graceful "Migration 005 not applied" message when the `experience_revisions` table doesn't exist yet.
- **`loadAgents()`** (`admin-property-store.js`) — feeds the agent dropdown in both Create Property and the Workspace's management card.

## Files changed

| File | Nature of change |
|---|---|
| `admin/admin-properties.js` | Create Property form + submit flow |
| `admin/admin-property-store.js` | `createProperty`, `savePropertyStatus`, `savePropertyMeta`, `loadAgents`, migration-005 self-healing (see below), publish/rollback state-sync fix |
| `admin/admin-workspace.js` | Status transition UI, Revisions tab, agent dropdown in Overview |
| `package.json` | added `test:admin-m5x` script |
| `tests/admin-m5x.test.mjs` | new, 43 tests |

## Bugs found during QA and fixes applied

QA was run as a self-review before commit (Fase 1–5 audit, then a POST-FIX AUDIT after fixes). Two real bugs and one cosmetic defect were found and fixed before this phase was considered closeable — none of these were present in the original draft's self-assessment; all three were caught by re-deriving the code against the actual DB schema and the actual SPA routing behavior, not by running against production.

1. **`loadProperty()` was not resilient to migration 005 being unapplied**, unlike `loadIndex()`. Because the Admin router is a hash-based SPA that supports direct deep-links and page refresh (`admin-router.js::init()` reads `location.hash` on load), a refresh or bookmark straight to `#workspace/<slug>` would call `loadProperty()` without `loadIndex()` ever having run — defeating the retry-on-missing-column logic that only lived in `loadIndex()`. Fixed by extracting the detection into a single shared `ensureRevisionColumnKnown()`, called by `loadIndex()`, `loadProperty()`, and `createProperty()` alike, with an in-flight probe (`revisionDetection`) so concurrent first-callers share one round trip instead of racing independent detections.
2. **Publishing or rolling back a revision left the Workspace showing the previous revision as "Active"** until the user left and re-entered. `publishRevision()`/`rollback()` were deleting the cache entry (`store.cache.delete(slug)`) instead of mutating it, which broke the object-reference link the Workspace's `currentProperty` relied on — a second, stale copy of the same state. Fixed by mutating `experience_revision_id` on the cached object in place, matching the pattern `savePropertyStatus`/`savePropertyMeta` already used, so there is exactly one source of truth for a loaded property's state, not two.
3. **Cosmetic:** `var(--warning)` and `var(--bg-hover)` were used in the Workspace's inline styles but never defined in `admin.html`'s `:root`. Replaced with `var(--orange)` and `var(--surface-2)`, matching the existing convention used elsewhere in the Admin (e.g. `admin-readiness-panel.js` for warnings, `.ex-lang-active`/`.ke-type-active` for active-state rows).

## Migration 005 fallback behaviour

Confirmed self-healing, independent of call order:

- If `experience_revision_id` does not exist on `properties`, `ensureRevisionColumnKnown()` detects this on the first Supabase call of the session (from whichever of `loadIndex`/`loadProperty`/`createProperty` runs first) and every subsequent query in the session omits the column.
- The Revisions tab shows an explanatory "Migration 005 not applied" message instead of erroring, driven by inspecting the Supabase error message for `experience_revisions`/`relation`/`does not exist`.
- No part of Admin-M5.X requires migration 005 to function for property creation, status transitions, or basic property browsing — only the Revisions tab's actual data depends on it.

## Publish / rollback status

Functionally wired end-to-end at the code level (UI → store → Supabase, verified via mocked call-sequence tests reproducing the exact sequence the pre-existing LPE-09 tests already validated). **Not verified against a live Supabase instance with migration 005 applied** — no test environment with that migration applied was available in this session, and applying it to the production database was explicitly out of scope pending Simon's AUTORIZO.

## Final state

- Tests: `tests/admin-m5x.test.mjs` 43/43 PASS (39 original + 4 added during the bug-fix round to cover the two real bugs behaviorally, not just structurally).
- Regression: `tests/lpe-09-revisions.test.mjs` 23/23 PASS (same store module, exact Supabase call-sequence assertions unaffected by the cache-mutation fix). Full `tests/lpe-01` → `lpe-11` + `lpe-12-gates` suites and `npm run check` all pass unchanged.
- No live browser/Playwright verification against real Supabase was performed — `admin.html` authenticates against production Supabase Auth, and exercising Create/Publish/Rollback against it would be a real production write, which was out of scope. The mocked test suite substitutes for this by reproducing exact call sequences and state transitions deterministically.
- Working tree at commit time contained exactly the 5 files listed above; two build artifacts regenerated as a side effect of running `npm run check` (`api/_pack.mjs`, `property-pack.js` — timestamp-only diff) were reverted before commit to keep the change scoped.

## Known limitations

- No automated end-to-end verification against a live Supabase project (credentials not available in this session; would also have required either a test project or accepting a production write).
- The Revisions tab's publish/rollback flows have never been exercised against a database with migration 005 actually applied — only against mocks that assert the correct call sequence.
- `savePropertyMeta`'s organization lookup for `createProperty` (`.from('organizations').select('id').limit(1)`) has no explicit ordering; correct only under the documented single-organization assumption ("Larum itself is the first organization" — migration 001 §2). Not a bug today, but would need an explicit `agent_id`/`organization_id` selection path if a second organization is ever seeded.

## What this phase did NOT do

- Did not apply migration 005 to Supabase.
- Did not modify Supabase schema, RLS, or any migration file.
- Did not touch any LPE-owned file (`app.js`, `modules/*`, `schemas/*`, `property-loader.js`, `analytics.js`, `experience-shell.js`, `consent.js`, `api/*`, `properties/**/*.json`, `docs/migrations/*`, `index.html`, `styles.css`).
- Did not touch any other `admin/*.js` file beyond the three listed.
- Did not push to `origin/master` or deploy to Vercel.
- Did not fix the pre-existing `MODULE_IDS` SyntaxError (unrelated to this phase's scope; tracked separately as technical debt, see `docs/NEXT_PHASES.md`).

## Next dependency

None blocking. The Revisions tab built here will only show real data once migration 005 is applied (Simon's AUTORIZO required) — no code change is needed on that day, only the migration itself.

**STOP.**
