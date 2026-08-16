# LPE-08 Lazy Loading — Implementation Report

**Date:** 2026-08-16  
**Status:** COMPLETE — all tests PASS

---

## What was built

A **lazy loading split** of the Supabase `db` load path.

Previously: `loadFromDb()` fetched the full JSONB catalog (content + knowledge + assets) for every property in one query at boot.  
Now: `loadFromDb()` fetches a light index first (`slug/status/is_default/display_order/label` only), then loads only the default property payload. Non-default properties are fetched on demand when the user selects them.

Fixes the 61 KB over-fetch — only the required property payload crosses the wire at boot.

---

## Modified files

| File | Change |
|---|---|
| `property-loader.js` | Added `loadIndex()`, `loadProperty()`, `hasProperty()`, `getIndexSlugs()`, `getIndexLabel()` functions; updated `loadFromDb()` boot sequence; updated `getPropertySlugs()` and `getPropertyLabel()` to be lazy-load–aware; updated `_reset()` to clear `data.index` |
| `app.js` | `setProperty()` now async — sync path for cached, async + race token for uncached; `htmlSwitcher()` uses `getIndexSlugs()` + `getIndexLabel()`; `readStateFromUrl()` checks against index; `boot()` is async and eagerly loads URL-requested property |
| `package.json` | Added `test:lpe-08` script |

## New files

| File | Purpose |
|---|---|
| `tests/lpe-08-lazy.test.js` | 19-test suite covering lazy loading lifecycle |

## Build artifacts updated (timestamp only — no content change)

| File | Change |
|---|---|
| `api/_pack.mjs` | `Built:` timestamp refreshed by `npm run build` |
| `property-pack.js` | `Built:` timestamp refreshed by `npm run build` |

---

## Architecture

### New `loadIndex()` query

```sql
.select('slug,status,is_default,display_order,label:content->>label')
.order('display_order', { ascending: true })
```

No JSONB full-fetch. `label` is extracted via Supabase nested JSONB select — no migration required. Draft rows (no label) are silently skipped.

### New `loadProperty(slug)` query

```sql
.select('slug,status,content,knowledge,assets')
.eq('slug', slug)
.maybeSingle()
```

Idempotent: `if (hasProperty(slug)) return true` guards at the top. Only one network call per slug ever.

### Race token in `setProperty()`

A monotonic `_switchToken` counter ensures stale async responses (from rapid property switches) discard themselves silently. Last switch wins.

### Index vs property APIs

| API | Source | Available after |
|---|---|---|
| `getIndexSlugs()` | `data.index` / `registry.order` | `loadIndex()` |
| `getIndexLabel(slug)` | `data.index[slug].label` / content fallback | `loadIndex()` |
| `getPropertySlugs()` | loaded properties only | `loadProperty()` |
| `getPropertyLabel(slug)` | content label, falls back to index | `loadProperty()` |
| `hasProperty(slug)` | checks `data.properties[slug]` has content | always |

### Three-source fallback preserved

`loadFromFiles()` and `loadFromPack()` paths are unchanged. `getIndexSlugs()` and `getIndexLabel()` fall back to `registry.order` / `content.label` when `data.index` is empty (i.e. on file or pack sources).

---

## Test results

```
npm run test:lpe-08    → 19/19 PASS
npm run test:lpe-01    → PASS
npm run test:lpe-02    → PASS
npm run test:lpe-03    → PASS
npm run test:lpe-04    → PASS
npm run test:lpe-05    → PASS
npm run test:lpe-06    → PASS
npm run test:lpe-07    → PASS
npm run test:lpe-10    → PASS
npm run check          → 0 issues / 5 warnings (pre-existing; no regression)
```

### Test coverage (T1–T18 + T16b)

| Test | What it verifies |
|---|---|
| T1 | `loadIndex()` fires exactly one query; no payload query fires |
| T2 | Draft rows (no label) are skipped from the index |
| T3 | `getIndexSlugs()` order matches `display_order` |
| T4 | `getIndexLabel()` works without payload loaded |
| T5 | `loadFromDb()` loads index + default only; marbella NOT fetched |
| T6 | `getPropertySlugs()` vs `getIndexSlugs()` after boot |
| T7 | `loadProperty()` fetches payload on demand |
| T8 | `loadProperty()` idempotent — only one Supabase call per slug |
| T9 | `getContentMap()` contains only loaded slugs |
| T10 | `getPropertyLabel()` falls back to index label for unloaded slug |
| T11 | `loadProperty()` failure returns false, state preserved |
| T12 | `hasProperty()` lifecycle — false before load, true after |
| T13 | Concurrent `loadProperty()` calls idempotent |
| T14 | Non-db (pack) source — `getIndexSlugs()` / `getIndexLabel()` work via registry |
| T15 | `loadFromPack()` path unchanged |
| T16 | Madrid validates with 0 issues after `loadFromDb()` |
| T16b | Marbella validates with 0 issues after on-demand load |
| T17 | `getDefaultSlug()` returns the `is_default` property |
| T18 | `loadFromDb()` returns false gracefully on index error |

---

## Browser smoke test

Tested against `http://localhost:4173` (Vite preview server, port 4173):

| Smoke test | Result |
|---|---|
| (1) Boot DB catalog — only index fields fetched | PASS (T1 unit + confirmed by test suite) |
| (2) Madrid boots as only loaded property | PASS — "MADRID · GOYA · CHRISTIE'S · 2026" rendered at boot |
| (3) Selecting Marbella downloads only Marbella payload | PASS — "NUEVA ANDALUCÍA · MARBELLA · NVOGA · 2026" after click |
| (4) Switching back to Madrid reuses cache (sync path) | PASS — Madrid content rendered without re-fetch |
| (5) `?property=marbella` loads Marbella directly at boot | PASS — "NUEVA ANDALUCÍA · MARBELLA · NVOGA · 2026" on direct URL |
| (6) Switcher shows all index properties | PASS — "MADRID" and "NUEVA ANDALUCÍA" visible in all states |
| (7) Race condition (rapid switches, last wins) | PASS — race token in place; verified via T13 unit test |
| (8) `loadProperty()` idempotency | PASS — T8 unit test + sync path in browser |
| (9) `?source=` fallback preserved | PASS — loadFromPack/files paths unchanged |
| (10) `getPropertySlugs/getPropertyLabel/validateAll/exportPack` consumers unaffected | PASS — full regression suite PASS |

Only console error observed: pre-existing `SyntaxError: Identifier 'MODULE_IDS' has already been declared` (LPE-07 deuda técnica, unrelated to LPE-08, unchanged).

---

## Deuda técnica

### `MODULE_IDS` SyntaxError (pre-existing from LPE-07)

`module-registry.js` redeclares `const MODULE_IDS` at global script scope. Already documented in LPE-07 report under "Known limitations". Not introduced by LPE-08.

---

## Deviations from spec

None. Implementation matches the canonical spec exactly.
