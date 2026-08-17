# LPE-10 Pre-Implementation Discovery Report
# Canonical Analytics IDs

**Date:** 2026-08-16  
**Status:** DISCOVERY COMPLETE  
**Authority:** `LARUM_LPE_FINAL_MASTER_PACKAGE/LPE-10/LPE_10_DISCOVERY.md` · `LPE_10_DISCOVERY_QA.md` · `LPE_10_HANDOFF.md` · `docs/CONTROL_PACKAGE_V1.md` (§0.2 line 68, §6) · `docs/BLUEPRINT.md` (§12)  
**Standard gate:** `APPROVE LPE-10` + `implement LPE-10`

---

## Summary

**LPE-10 is already implemented in the real repo.** The analytics core (`analytics.js`, `app.js`, `tests/lpe-10-analytics.test.js`) matches the HANDOFF specification exactly. All 10 test groups PASS. The backfill SQL is correctly deferred (Decision E). One residual item remains: the conditional admin surfacing of `nullReport()` (HANDOFF §5) was not implemented in the analytics delivery and requires a decision on scope.

LPE-09 post-closure validation is clean: commit `6f07b92`, all regression suites PASS, migration 005 authored and uncommitted (correct state), all constraints respected.

---

## §1 — LPE-09 Post-Closure Validation

| Check | Result |
|---|---|
| Commit `6f07b92` — single commit, all deliverables | ✅ CONFIRMED |
| `npm run test:lpe-09` → 23/23 PASS | ✅ CONFIRMED |
| Full regression (lpe-01 → lpe-08, lpe-10) → all PASS | ✅ CONFIRMED |
| `npm run check` → 0 issues / 5 warnings (pre-existing) | ✅ CONFIRMED |
| Migration 005 authored, NOT applied to Supabase | ✅ CORRECT STATE |
| `api/_data.mjs` — only `fetchDossier()` modified | ✅ CONFIRMED |
| `app.js`, `modules/*`, `analytics.js`, `styles.css` — untouched | ✅ CONFIRMED |
| No push, no deploy | ✅ CONFIRMED |

**LPE-09 post-closure: CLEAN. No residual issues.**

---

## §2 — Evidence Base — Files Audited

| File | Status |
|---|---|
| `analytics.js` | Audited — LPE-10 fully implemented |
| `app.js` | Audited — LPE-10 seams fully implemented |
| `tests/lpe-10-analytics.test.js` | Audited — 10 test groups match HANDOFF §6 |
| `package.json` | Audited — `test:lpe-10` script present |
| `schemas/adapters/index.js` | Audited — `deriveManifest` legacy ID behavior confirmed |
| `admin/admin-dashboard.js` | Confirmed present |
| `admin/admin-sessions.js` | Confirmed present |
| `admin/admin-leads.js` | Confirmed present |
| `LARUM_LPE_FINAL_MASTER_PACKAGE/LPE-10/LPE_10_HANDOFF.md` | Read — authoritative spec |
| `LARUM_LPE_FINAL_MASTER_PACKAGE/LPE-10/LPE_10_DISCOVERY_QA.md` | Read — decisions A–E signed off |
| `LARUM_LPE_FINAL_MASTER_PACKAGE/LPE-10/LPE_10_REPORT.md` | Read — sandbox implementation record |
| `LARUM_LPE_FINAL_MASTER_PACKAGE/LPE-10/LPE_10_CLOSURE.md` | Read — sandbox closure record |

---

## §3 — Key Finding: LPE-10 Status in Real Repo

**LPE-10 analytics implementation is already present in the real repo.**

All four modified/created files from the HANDOFF §3 are in place:

| HANDOFF §3 | Real Repo | Match |
|---|---|---|
| `analytics.js` — modified | EXISTS, LPE-10 code present | ✅ |
| `app.js` — modified | EXISTS, LPE-10 code present | ✅ |
| `package.json` — `test:lpe-10` | `"test:lpe-10": "node tests/lpe-10-analytics.test.js"` | ✅ |
| `tests/lpe-10-analytics.test.js` — created | EXISTS, 10 test groups, PASS | ✅ |
| `docs/LPE_10_HANDOFF.md` — created | In package (not in prototype/docs/) | — |
| `docs/LPE_10_REPORT.md` — created | In package (not in prototype/docs/) | — |
| `docs/LPE_10_CLOSURE.md` — created | In package (not in prototype/docs/) | — |

**Admin surfacing files (HANDOFF §5, conditional):**

| HANDOFF §5 | Real Repo | Match |
|---|---|---|
| `admin/admin-dashboard.js` — exists (condition met) | EXISTS | ✅ Condition met |
| `admin/admin-sessions.js` — exists (condition met) | EXISTS | ✅ Condition met |
| `admin/admin-leads.js` — exists (condition met) | EXISTS | ✅ Condition met |
| Read-only reconciliation view added | NOT IMPLEMENTED | ❌ Residual |

HANDOFF §5 condition was triggered (admin files exist), but the `nullReport()` surfacing in the admin dashboard was not added in the analytics delivery. This is the only gap.

---

## §4 — Analytics.js Alignment (vs HANDOFF §4.3–§4.5)

### §4.1 — `init(property, lang, ids)` — consume-when-present (Decision D)

```js
// Real repo analytics.js:110–111
state.propertyId = ids.propertyId || null;
state.revisionId = ids.revisionId || null;
state.family     = ids.family || null;
```

- `ids` defaults to `{}` when absent (line 81: `ids = ids || {}`) — no throw ✅
- Canonical ids assigned **after** `loadPersisted()` (line 103 comment: "so they must be set AFTER loadPersisted()") ✅
- Legacy `state.property` always set from `property` arg ✅
- `nullCounts` reset on new-property init (line 100) ✅

**Decision D: FULLY IMPLEMENTED.**

### §4.2 — `track(type, data, moduleId)` + `enqueueRemote` (Decisions A, B)

```js
// Real repo analytics.js:381–405 (enqueueRemote):
const mid = (moduleId && KNOWN_MODULE_IDS.has(moduleId)) ? moduleId : null;
nullCounts.total++;
if (!state.propertyId)  nullCounts.propertyId++;
if (!state.revisionId)  nullCounts.revisionId++;
if (!mid)               nullCounts.moduleId++;
if (!state.family)      nullCounts.family++;
outbox.push({
  session_id: sessionId,
  property: state.property,          // slug — always present (dual-write)
  event_schema: 1,                   // Decision A
  property_id: state.propertyId || null,
  experience_revision_id: state.revisionId || null,
  module_id: mid,                    // Decision B: unknown → null
  family: state.family || null,
  lang: state.lang,
  event_type: type,
  event_data: data || {}
});
```

- `event_schema: 1` (Decision A) ✅
- `module_id`: validated against `KNOWN_MODULE_IDS` (14 entries: 9 MODULE_IDS + `hero`, `identity`, `image-band`, `explore`, `calculator`) ✅
- `property` slug always present alongside `property_id` (dual-write) ✅
- Unknown module → `null` ✅

**Decisions A + B: FULLY IMPLEMENTED.**

### §4.3 — `buildSessionRow()` (HANDOFF §4.2)

```js
// Real repo analytics.js:421–441:
return {
  id: sessionId,
  property: state.property,
  event_schema: 1,
  property_id: state.propertyId || null,
  experience_revision_id: state.revisionId || null,
  family: state.family || null,
  ...
};
```

- `event_schema: 1`, `property_id`, `experience_revision_id`, `family` present ✅
- `module_id` correctly absent from session row (per HANDOFF §4.2: "module_id is not a session field") ✅
- `property` slug retained ✅

### §4.4 — `nullReport()` (Decision D)

```js
// Real repo analytics.js:590–599:
function nullReport() {
  return {
    totalEvents: nullCounts.total,
    missingPropertyId: nullCounts.propertyId,
    missingRevisionId: nullCounts.revisionId,
    missingModuleId: nullCounts.moduleId,
    missingFamily: nullCounts.family,
    schemaVersion: 1
  };
}
```

Shape matches HANDOFF §4.5 exactly ✅. Also surfaced in `debug()` (analytics.js:606) ✅.

**HANDOFF §4.3–§4.5: FULLY IMPLEMENTED.**

---

## §5 — App.js Alignment (HANDOFF §4.4 — ctx.track Seam, Decision B)

### `buildCtx` — 3-arg track (line 350):
```js
track:function(ev,d,m){LarumAnalytics.track(ev,d,m);}
```
✅ Passes `m` (moduleId) through to analytics.

### `mountModules()` — per-module ctx (lines 381–384):
```js
const moduleCtx = Object.assign({}, ctx, {
  track: function(ev, d) { LarumAnalytics.track(ev, d, id); }
});
m.mount(root, moduleCtx);
```
✅ Each P0 module gets a ctx copy whose `track` stamps `id` (the owning module's id).  
✅ `modules/*` files are **untouched** — they call `ctx.track(ev, d)` and the stamping happens here, exactly as HANDOFF §4.4 specifies.

### `render()` — family init (line 406):
```js
LarumAnalytics.init(current, lang, { family: (currentManifest().family || null) });
```
✅ Family captured from `manifest.family` (Decision C).  
✅ `propertyId`/`revisionId` absent — correctly null today (consume-when-present; LPE-08/09 not surfacing them yet).

**Decision B + C seam in app.js: FULLY IMPLEMENTED.**

---

## §6 — Test Suite Alignment (HANDOFF §6)

All 10 test groups from HANDOFF §6 are present in `tests/lpe-10-analytics.test.js`:

| Group | Coverage | Status |
|---|---|---|
| 1 | `event_schema: 1` on every event row | ✅ PASS |
| 2 | `property` slug always present | ✅ PASS |
| 3 | consume-when-present: rich (with ids) + bare (no ids, no throw) | ✅ PASS |
| 4 | `module_id` stamping + unknown → null | ✅ PASS |
| 5 | `ctx.track` seam (structural grep of app.js) | ✅ PASS |
| 6 | `family` on session row | ✅ PASS |
| 7 | `nullReport()` counts + reset on new-property init | ✅ PASS |
| 8 | dual-write session row (`property` + `property_id` + `event_schema`) | ✅ PASS |
| 9 | no new event names (allow-list assert on all track() literals) | ✅ PASS |
| 10 | no scoring field (no `score`/`predict`/`rank` in any row) | ✅ PASS |

`npm run test:lpe-10` → **10/10 PASS** (confirmed in regression run).

---

## §7 — Admin Surfacing Condition (HANDOFF §5)

### Condition evaluation

HANDOFF §5: _"Only if `admin/*` exists in the real repo: add a read-only reconciliation view (reuse the existing dashboard/sessions primitives) showing the `nullReport()` counters + a 'legacy slug retention' note."_

| Condition | Real Repo |
|---|---|
| `admin/admin-dashboard.js` exists | ✅ YES |
| `admin/admin-sessions.js` exists | ✅ YES |
| `admin/admin-leads.js` exists | ✅ YES |

**Condition met.** The admin surfacing view should have been added.

### Current state

None of `admin-dashboard.js`, `admin-sessions.js`, or `admin-leads.js` have been modified to surface `LarumAnalytics.nullReport()` data. The reconciliation view is absent.

### Implication

This is the sole remaining item from the LPE-10 HANDOFF. It is:
- Read-only (no save, no publish, no scoring)
- Must reuse existing admin primitives
- Does not require a new migration
- Scope: `admin-dashboard.js` (or `admin-analytics.js`) gains a `nullReport()` readout panel

A decision is needed on whether to address this in the LPE-10 close (before approval) or treat it as a known deferred item (same rule as LPE-07's admin gap).

---

## §8 — Backfill + Migration State (Decision E)

### Decision E status

HANDOFF Decision E: _"Backfill specified architecturally; actual SQL gated on LPE-09 migrations evidence."_

| Item | Status |
|---|---|
| Dual-write new events (this phase) | ✅ DONE — analytics.js writes canonical ids when present |
| Backfill historical rows | ⏸ DEFERRED — gated on migration 005 being applied to Supabase |
| Null report as backfill parity instrument | ✅ DONE — `nullReport()` implemented |
| Legacy `property` slug column retention | ✅ DONE — slug always written alongside canonical fields |

### Migration 005 dependency

- Migration 005 (`experience_revisions` + `properties.experience_revision_id`) is authored in `docs/migrations/005_experience_revisions.sql`
- It has NOT been applied to Supabase (correct — requires explicit authorization)
- Backfill SQL (`UPDATE analytics_events SET property_id = p.id FROM properties p WHERE analytics_events.property = p.slug`) cannot be run until migration 005 is live
- LPE-10 analytics correctly operates without the backfill — null report tracks the gap

**Decision E: correctly deferred. No action needed here.**

### DB columns confirmed

From migration 001 (audited in LPE-09 discovery):
- `leads.property_id` (UUID) — column exists, app writes null today ✅
- `sessions.property_id` (UUID) — column exists, app writes null today ✅  
- `analytics_events.property_id` (UUID) — column exists, app writes null today ✅

The dual-write will populate these once canonical IDs are surfaced (when LPE-09 migration is live and `?source=db-v2` path is used).

---

## §9 — Canonical ID Surfacing Gap + Risks

### Current surfacing state

LPE-10 is consume-when-present. Canonical IDs remain `null` today because:

1. `render()` calls `LarumAnalytics.init(current, lang, { family: currentManifest().family })` — no `propertyId`/`revisionId` passed
2. `currentManifest()` → `LarumDomainAdapters.deriveManifest(slug)` → `adaptExperience(slug)` which emits `propertyId: slug` (text, not UUID) and `revisionId: '${slug}-legacy'` — NOT canonical UUIDs
3. `app.js` does not read `propertyId`/`revisionId` from the loader or DB at render time; these only become available when `?source=db-v2` is active AND migration 005 is applied

This is the designed state. The null report tracks it. When LPE-08 implementation + LPE-09 `?source=db-v2` surface canonical UUIDs, `app.js` will need a narrow addition to pass them to `init()`. That is downstream work, not a LPE-10 blocker.

### Risk table

| Risk | Severity | Mitigation |
|---|---|---|
| R1: Admin surfacing absent | LOW | Residual item; analytics core complete and tested. Add before or after approval. |
| R2: `propertyId`/`revisionId` remain null today | EXPECTED | Null report measures this explicitly. Will drop when LPE-08/09 surface IDs. |
| R3: `loadPersisted()` ordering was a bug | FIXED | Canonical IDs assigned after `loadPersisted()` in real repo; test 3 (rich) + test 8 cover it. |
| R4: `KNOWN_MODULE_IDS` in analytics.js has 14 entries vs 9 in registry | LOW | The extra 5 (`hero`, `identity`, `image-band`, `explore`, `calculator`) are frame IDs also called from app.js directly. This is additive and correct per HANDOFF ("frame id from the closed frame set"). |
| R5: No migration written | CORRECT | HANDOFF Decision E explicitly prohibits backfill SQL here. |

### What LPE-10 must NOT have changed

Per HANDOFF §3 (explicitly forbidden):

| File | Status |
|---|---|
| `property-loader.js` | ✅ Untouched |
| `build-pack.js` | ✅ Untouched |
| `validate-content.js` | ✅ Untouched |
| `index.html` | ✅ Untouched |
| `styles.css` | ✅ Untouched |
| `modules/*` | ✅ Untouched |
| `experience-shell.js` | ✅ Untouched |
| `schemas/*` (incl. adapters) | ✅ Untouched |
| `consent.js` | ✅ Untouched |
| `supabase-config.js` | ✅ Untouched |
| `api/*` | ✅ Untouched |
| `docs/migrations/*` | ✅ Untouched |
| `vercel.json` | ✅ Untouched |
| `properties/**/*.json` | ✅ Untouched |

All forbidden files confirmed untouched.

---

## §10 — Verdict

**VERDICT: IMPLEMENTED ✅**

LPE-10 (analytics core) is already implemented in the real repo and matches the HANDOFF specification exactly. No code changes are needed for the analytics core.

### Residual item

| Item | Scope | Gating |
|---|---|---|
| Admin surfacing of `nullReport()` (HANDOFF §5) | Read-only view in `admin-dashboard.js`/`admin-analytics.js` | Decision needed: close in LPE-10 or defer as known deferred item (same pattern as LPE-07 Admin gap) |

### Decision needed before formal LPE-10 approval

1. **Admin surfacing scope** — implement in LPE-10 close, or defer with a recorded note?  
   - If implement: `admin-analytics.js` (or `admin-dashboard.js`) gains a `nullReport()` read section. No migration, no save, no new architecture.
   - If defer: record as a known deferred item (same pattern as the LPE-09 admin UI wiring deferred item).

### Downstream (LPE-11+)

- LPE-11+ may assume analytics carries canonical IDs once LPE-09 migration is applied and LPE-08/09 surface them to `app.js`
- Until then `property_id`/`experience_revision_id` are null (expected; tracked by `nullReport()`)
- No action needed in LPE-10

---

## Implementation readiness checklist (if admin surfacing is in scope)

- [ ] Decision on admin surfacing scope (before or after approval)
- [ ] If in scope: `admin-analytics.js` or `admin-dashboard.js` gets read-only `nullReport()` panel (no save, no scoring, no new architecture)
- [ ] `APPROVE LPE-10` from Simon
- [ ] `implement LPE-10` instruction received

If admin surfacing is deferred:
- [ ] Record deferred note in `docs/LPE_10_CLOSURE.md`
- [ ] `APPROVE LPE-10` from Simon
- [ ] `implement LPE-10` instruction received (scope: closure docs only)

---

*Discovery performed: 2026-08-16. STOP — no implementation performed.*
