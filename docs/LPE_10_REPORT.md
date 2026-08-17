# LPE-10 Canonical Analytics IDs — Implementation Report

**Date:** 2026-08-17  
**Status:** COMPLETE — all tests PASS

---

## What was built

Dual-write of canonical analytics IDs (`property_id`, `experience_revision_id`,
`module_id`, `family`, `event_schema`) alongside the legacy `property` slug on every
`analytics_events` and `sessions` row. Plus an in-memory null-report reconciliation
instrument and a read-only admin surfacing of canonical ID coverage.

**Core mechanic:** consume-when-present (Decision E). Analytics writes `null` for
canonical IDs if they are not provided at `init()` — never throws, legacy slug always
written. Non-zero missing counts are expected until LPE-08/09 surface canonical UUIDs
to the visitor runtime.

---

## Discovery finding

LPE-10's analytics core (`analytics.js`, `app.js`, `tests/lpe-10-analytics.test.js`,
`package.json` `test:lpe-10` script) was already fully implemented in the real repo
before this session began. The pre-implementation discovery (`docs/LPE_10_PRE_IMPLEMENTATION_DISCOVERY.md`)
confirmed this. The one residual item was the admin surfacing (HANDOFF §5), which was
implemented in this session.

---

## Files modified / created

### Modified

| File | Change |
|---|---|
| `admin/admin-analytics.js` | Added `renderNullReport(events)` function + "Canonical ID coverage" card call in `draw()` |

### Created

| File | Purpose |
|---|---|
| `docs/LPE_10_PRE_IMPLEMENTATION_DISCOVERY.md` | Pre-implementation discovery (analytics core already present; admin surfacing pending) |
| `docs/LPE_10_REPORT.md` | This file |
| `docs/LPE_10_CLOSURE.md` | Closure declaration |

### Already present in real repo (no changes in this session)

| File | What it implements |
|---|---|
| `analytics.js` | `init(property, lang, ids)`, `track(type, data, moduleId)`, `enqueueRemote()`, `buildSessionRow()`, `nullReport()`, `KNOWN_MODULE_IDS`, `nullCounts` |
| `app.js` | `buildCtx()` 3-arg track seam; `mountModules()` per-module ctx with bound module id; `render()` passes `{family}` to `init()` |
| `tests/lpe-10-analytics.test.js` | 10-group test suite; 10/10 PASS |
| `package.json` | `test:lpe-10` script |

---

## Architecture

### Dual-write event fields (analytics.js)

Every `enqueueRemote()` call writes:

```js
{
  event_schema:            1,                          // Decision A — constant
  property_id:             state.propertyId || null,   // UUID when LPE-08/09 surface it
  experience_revision_id:  state.revisionId  || null,  // UUID when LPE-09 published
  module_id:               validatedModuleId || null,  // Decision B — from ctx.track
  family:                  state.family      || null,  // Decision C — from manifest.family
  property:                state.property             // legacy slug, always written
}
```

Every `buildSessionRow()` call writes the same minus `module_id`.

### consume-when-present (Decision E)

`init(property, lang, ids)` — `ids` is `ids || {}`. Canonical IDs are assigned **after**
`loadPersisted()` so the runtime always wins over localStorage:

```js
state.propertyId  = ids.propertyId  || null;
state.revisionId  = ids.revisionId  || null;
state.family      = ids.family      || null;
```

### module_id via ctx.track (Decision B)

`mountModules()` gives each P0 module a ctx copy where `track` is bound to the module's
own id:
```js
const moduleCtx = Object.assign({}, ctx, {
  track: function(ev, d) { LarumAnalytics.track(ev, d, id); }
});
```

`buildCtx()` passes 3-arg track for direct callers:
```js
track: function(ev, d, m) { LarumAnalytics.track(ev, d, m); }
```

### Null report (in-memory reconciliation instrument)

`nullCounts` resets on each `init()`. Counts events missing each canonical field.
`nullReport()` returns:

```js
{
  totalEvents,
  missingPropertyId,
  missingRevisionId,
  missingModuleId,
  missingFamily,
  schemaVersion: 1
}
```

### Admin surfacing (HANDOFF §5 — added in this session)

`admin/admin-analytics.js`: new `renderNullReport(events)` function reads from
`state.events` (already loaded by `admin-core.js` via `select('*')` on `analytics_events`,
up to 3,000 rows). Filters to `event_schema === 1` to identify LPE-10 events vs.
pre-LPE-10 events. Computes coverage ratios for the four canonical fields.

Rendered as a full-width card at the bottom of the global Analytics view with
`ga-signals` / `ga-signal` CSS classes (existing pattern from `renderSignals()`).

Two states:
- **No LPE-10 events:** empty message with dual-write retention note
- **LPE-10 events present:** coverage table (property_id, experience_revision_id, module_id, family)
  with pct + n/total per field

**Read-only.** No writes, no mutations, no new entities, no new API calls.

---

## Test results

```
npm run test:lpe-10    → 10/10 PASS
npm run test:lpe-01    → PASS
npm run test:lpe-02    → PASS
npm run test:lpe-03    → PASS
npm run test:lpe-04    → PASS
npm run test:lpe-05    → PASS
npm run test:lpe-06    → PASS
npm run test:lpe-07    → PASS
npm run test:lpe-08    → 19/19 PASS
npm run test:lpe-09    → 23/23 PASS
npm run check          → 0 issues / 5 warnings (pre-existing; no regression)
```

### LPE-10 test suite coverage (10 groups)

| Group | What it verifies |
|---|---|
| 1 | `event_schema: 1` on every event row |
| 2 | Legacy slug (`property`) always present regardless of canonical IDs |
| 3 | Consume-when-present: canonical IDs written when provided; `null` when not |
| 4 | `module_id` stamping from 3rd arg; unknown module id → `null` |
| 5 | Structural: `app.js` has `buildCtx` 3-arg seam + `mountModules` bound id |
| 6 | `family` captured at `init()` and written to session row |
| 7 | `nullReport()` counts; resets on new-property init |
| 8 | Dual-write session row: `property`, `property_id`, `event_schema` |
| 9 | Allow-list: no event names outside the 12-name canonical set |
| 10 | No scoring fields on any row |

---

## Browser smoke test

Preview server: `http://localhost:4173` (Vite, port 4173)

| Check | Result |
|---|---|
| Admin page loads | ✅ Login gate renders; all sidebar nav buttons present |
| Analytics route (`#analytics`) | ✅ Empty state correct — no Supabase session in preview |
| `renderNullReport` logic | ✅ Verified via JS execution: `event_schema===1` filter correct, coverage ratios correct |
| Other nav tabs intact | ✅ No broken JS in shell |
| Visitor experience (`index.html`) | ✅ Hero, consent dialog, navigation, concierge all intact |
| New JS errors from LPE-10 | None — existing `MODULE_IDS` SyntaxError is pre-existing (see Deuda técnica) |

---

## HANDOFF decisions — conformance

| Decision | Spec | Implemented |
|---|---|---|
| A — `event_schema: 1` | Constant field on every row | ✅ `enqueueRemote` + `buildSessionRow` |
| B — `module_id` via ctx.track | 3-arg track; mountModules binds owning id | ✅ `app.js:350,381–384` |
| C — `family` at init | From `manifest.family` at `render()` | ✅ `app.js:406` |
| D — consume-when-present | Never throw; null if absent | ✅ `ids = ids \|\| {}` |
| E — migration deferred | No migration 005 changes | ✅ Not touched |

---

## Deuda técnica

### Canonical IDs are null in production today

`deriveManifest()` in `schemas/adapters/index.js` returns legacy IDs
(`propertyId: slug`, `revisionId: '${slug}-legacy'`). `app.js render()` only passes
`{family}` to `init()`, not `propertyId` / `revisionId`. Until LPE-08/09 surface
canonical UUIDs from the database at render time, all `property_id` and
`experience_revision_id` fields will be `null`. This is documented in the null report
and is expected (consume-when-present).

### Migration 005 not yet applied to Supabase

The `analytics_events` table does not yet have columns for `property_id`,
`experience_revision_id`, `module_id`, `family`, `event_schema`. These columns need to
be added (likely in a future migration) before the dual-write fields persist to the DB.
Until then, Supabase upserts may silently ignore the canonical fields.

### `MODULE_IDS` SyntaxError (pre-existing, LPE-07 deuda)

`schemas/families.js` and `schemas/module-registry.js` both declare `const MODULE_IDS`
in the global scope alongside `schemas/adapters/index.js`. This fires a SyntaxError on
both `admin.html` and `index.html` page load. The error is documented in `admin.html:593`
and is not caused by LPE-10. Non-fatal: adapters are available (`LarumDomainAdapters`
defined) and the admin + visitor runtime both render correctly.

### `MODULE_TYPELESS_PACKAGE_JSON` warning (pre-existing, LPE-09 deuda)

Node.js warning from importing `admin/admin-property-store.js` (ESM) in the LPE-09 test
suite. Cannot be fixed without breaking existing CJS tests.
