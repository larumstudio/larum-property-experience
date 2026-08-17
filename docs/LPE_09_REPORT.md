# LPE-09 Revisions / Publish / Rollback — Implementation Report

**Date:** 2026-08-16  
**Status:** COMPLETE — all tests PASS

---

## What was built

Immutable `experience_revisions` table + publish pointer on `properties` +
`?source=db-v2` loader path + admin revision lifecycle functions + revision-aware
concierge dossier fetch.

**Core mechanic:** `properties.experience_revision_id` is the publish pointer. It is
the single source of truth for which revision visitors see. Rollback = repoint the FK;
old revisions keep their status.

---

## Files modified / created

### Modified

| File | Change |
|---|---|
| `property-loader.js` | Added `loadFromDbV2()`, `loadPropertyRevision()`, `?source=db-v2` branch in `autoLoad()`; added 'db-v2' to `_wantedSource()` allowed list; exposed new functions in public API |
| `admin/admin-property-store.js` | Added `experience_revision_id` to INDEX_COLUMNS; added `createRevision()`, `publishRevision()`, `rollback()` |
| `api/_data.mjs` | Narrow change in `fetchDossier()` only: adds `experience_revision_id` to SELECT; reads from revision snapshot when pointer is set, falls back to property content |
| `schemas/property.schema.json` | Added optional `experienceRevisionId` and `organizationId` fields |
| `schemas/experience-revision.schema.json` | Added optional `publishedAt`, `changeSummary`, `approvalBy`, `sourceRevisionId`, `validationReport` fields |
| `package.json` | Added `test:lpe-09` script |

### Created

| File | Purpose |
|---|---|
| `docs/migrations/005_experience_revisions.sql` | Migration: CREATE TABLE experience_revisions + ALTER TABLE properties ADD COLUMN experience_revision_id + RLS |
| `docs/LPE_09_DISCOVERY_REPORT.md` | Pre-implementation discovery (all 5 decisions resolved) |
| `tests/lpe-09-revisions.test.mjs` | 23-test suite (ESM, CJS loader via createRequire) |
| `docs/LPE_09_REPORT.md` | This file |
| `docs/LPE_09_CLOSURE.md` | Closure declaration |

### Build artifacts updated (timestamp only)

| File | Change |
|---|---|
| `api/_pack.mjs` | `Built:` timestamp refreshed by `npm run build` |
| `property-pack.js` | `Built:` timestamp refreshed by `npm run build` |

---

## Architecture

### Migration 005

```sql
CREATE TABLE experience_revisions (
  id, property_id, revision_number, status CHECK(...),
  manifest, content_snapshot, knowledge_snapshot, assets_snapshot,
  created_by, created_at,
  -- optional: published_at, change_summary, approval_by, source_revision_id, validation_report
  UNIQUE (property_id, revision_number)
);
ALTER TABLE properties ADD COLUMN experience_revision_id UUID REFERENCES experience_revisions(id);
```

RLS:
- `anon reads current revision` — WHERE `EXISTS (SELECT 1 FROM properties p WHERE p.experience_revision_id = id AND p.status = 'published')`
- `authenticated all revisions` — USING (true)

The anon policy uses the FK pointer (not `status='published'` on the revision) as the gate.
This means only the one revision the property currently points at is visible — rollback
leaves superseded revisions in place without exposing them.

### `?source=db-v2` path

```
autoLoad(?source=db-v2)
  └─ loadFromDbV2(basePath)
       ├─ index query: properties + experience_revision_id
       └─ for default property: loadPropertyRevision(slug)
            ├─ if experience_revision_id: query experience_revisions by id
            │    → uses content_snapshot / knowledge_snapshot / assets_snapshot
            └─ if no revision / revision unavailable: fallback to properties.content/knowledge/assets
```

**Not in the auto cascade.** Only runs when `?source=db-v2` is explicitly requested.
Fails closed: if the source is explicitly requested and the load fails, `autoLoad` returns
false (does not cascade to db/files/pack).

### `api/_data.mjs` — `fetchDossier` change

Old: `SELECT content,knowledge FROM properties WHERE slug=... AND status=published`  
New: `SELECT content,knowledge,experience_revision_id FROM properties WHERE slug=... AND status=published`

If `experience_revision_id` is set:
- Secondary fetch: `SELECT content_snapshot,knowledge_snapshot FROM experience_revisions WHERE id=...`
- If revision row is valid: use its snapshots
- If fetch fails: silently fall back to `properties.content/knowledge`

All other functions in `api/_data.mjs` are unchanged.

### Admin revision lifecycle

```
createRevision(slug, {content, knowledge, assets, createdBy})
  1. SELECT properties.id WHERE slug=...
  2. SELECT MAX(revision_number) FROM experience_revisions WHERE property_id=...
  3. INSERT experience_revisions (status='draft', revision_number=latest+1, ...)
  → returns inserted row

publishRevision(slug, revisionId)
  1. SELECT properties.id WHERE slug=...
  2. UPDATE experience_revisions SET status='published', published_at=now() WHERE id=revisionId
  3. UPDATE properties SET experience_revision_id=revisionId WHERE id=...
  → clears store cache for slug; updates in-memory index

rollback(slug, targetRevisionId)
  1. SELECT properties.id WHERE slug=...
  2. UPDATE properties SET experience_revision_id=targetRevisionId WHERE id=...
  → NO revision status mutation; clears store cache; updates in-memory index
```

**Rollback design:** atomic repoint only. The previously active revision retains its
status (still 'published' in its row). The FK pointer is the single source of truth.
No revision status is mutated on rollback.

---

## Test results

```
npm run test:lpe-09    → 23/23 PASS
npm run test:lpe-01    → PASS
npm run test:lpe-02    → PASS
npm run test:lpe-03    → PASS
npm run test:lpe-04    → PASS
npm run test:lpe-05    → PASS
npm run test:lpe-06    → PASS
npm run test:lpe-07    → PASS
npm run test:lpe-08    → 19/19 PASS
npm run test:lpe-10    → PASS
npm run check          → 0 issues / 5 warnings (pre-existing; no regression)
```

### Test coverage (lpe-09 suite)

| Test | What it verifies |
|---|---|
| T-S1 | `property.schema.json` has `experienceRevisionId` + `organizationId` (optional) |
| T-S2 | `experience-revision.schema.json` has 5 new optional fields; `additionalProperties:false` preserved |
| T-S3 | All original required fields of experience-revision.schema unchanged |
| T1 | `loadFromDbV2` fires index query exactly once |
| T2 | When revision exists, `content_snapshot` is used (not `properties.content`) |
| T3 | When no revision pointer, falls back to `properties.content/knowledge/assets` |
| T4 | Revision unavailable → fallback to property row (no crash) |
| T5 | `loadPropertyRevision` idempotent — no duplicate revision queries |
| T6 | On-demand marbella load via `loadPropertyRevision` (no revision → fallback) |
| T7 | `data.source = 'db-v2'` after `autoLoad` with `?source=db-v2` |
| T8 | `getIndexSlugs()` / `getIndexLabel()` work after `loadFromDbV2` |
| T9 | `?source=db` path unchanged — still reads from `properties.content` |
| T10 | `createRevision` — correct 3-call Supabase sequence; `status='draft'` |
| T11 | `createRevision` — `revision_number` = latest + 1 |
| T12 | `publishRevision` — updates revision status then property pointer (3 calls) |
| T13 | `rollback` — repoints property pointer only, zero revision mutations (2 calls) |
| T14 | Full lifecycle: current → draft → publish → draft-2 → publish → rollback → previous |
| T15 | Existing `loadFromDb` path unchanged |
| T16 | Pack path unchanged |
| T17 | Failed `?source=db-v2` does not cascade to db/files/pack |
| T18–T20 | Error paths: createRevision / publishRevision / rollback throw correctly |

---

## `api/_data.mjs` change evidence

**Only `fetchDossier` was modified.** No other function in `_data.mjs` was touched:
- `extractDossier` — unchanged
- `fromBundle` — unchanged
- `getDossier` — unchanged
- `propertyKnown` — unchanged
- `persistTurn` — unchanged
- `upsertConversation` — unchanged
- `bumpConversation` — unchanged
- `insertMessages` — unchanged

---

## Deviations from spec

None. All five decisions from the discovery (D1–D5) implemented as specified.

**One design note on rollback:** The spec says "rollback = repoint to prior approved" and
"never mutate." The implementation does NOT mutate the revision being rolled back FROM
(it keeps its `status='published'`). This is correct — the property FK pointer is the
gate, not the revision status.

---

## Deuda técnica

### `MODULE_TYPELESS_PACKAGE_JSON` warning (pre-existing)

Node.js emits a warning when importing `admin/admin-property-store.js` from `test.mjs`
because the package.json has no `"type": "module"`. This cannot be fixed by adding
`"type": "module"` (would break all existing CJS tests). The warning is non-fatal and
does not affect test results. **Pre-existing limitation from the Admin ESM file design.**

### Admin UI wiring not implemented

`createRevision`, `publishRevision`, and `rollback` are in `admin-property-store.js` but
no UI buttons/panels exist yet. The admin workspace (`admin-workspace.js`, `admin.html`)
would need wiring in a follow-up. This is explicitly outside LPE-09 scope per the
instructions: "admin UI adicional fuera de admin-property-store.js salvo que la spec
lo exija explícitamente."

### Migration 005 not yet applied to Supabase

The SQL file is authored and committed. Applying it requires explicit authorization
and is NOT part of LPE-09 code delivery.

---

## LPE-08 regression (pre-existing deuda técnica)

The `MODULE_IDS SyntaxError` from `module-registry.js` remains (LPE-07 deuda técnica).
Not introduced by LPE-09 and not changed.
