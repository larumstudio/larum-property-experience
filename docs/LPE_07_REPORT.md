# LPE-07 Build Readiness — Implementation Report

**Date:** 2026-08-16  
**Status:** COMPLETE — all tests PASS

---

## What was built

A headless, read-only **build readiness model** for the Larum property experience.

### New files
| File | Purpose |
|---|---|
| `schemas/readiness.js` | Core readiness model — pure function, ~370 lines |
| `tests/lpe-07-readiness.test.js` | 16-fixture test suite + Madrid/Marbella regression |
| `admin/admin-readiness-panel.js` | Admin Workspace "Readiness" tab — read-only |

### Modified files
| File | Change |
|---|---|
| `package.json` | Added `test:lpe-07` script |
| `admin/admin-workspace.js` | Added Readiness tab import, TABS entry, renderTab case, draw block, teardown call |
| `admin.html` | Added 5 global script tags for readiness dependencies |

---

## Architecture

### Readiness model (`schemas/readiness.js`)

**Entry point:** `LarumReadiness.readiness(slug, parts) → report`

- `parts = { content, knowledge, assets }` — read-only
- **Auto-loader:** if slug not in LarumLoader, calls `loadFromPack()` automatically
- **Consumers 4 existing validators:** loader.validate, adapters.validateNormalized, adapters.deriveManifest + validateManifest, resolver.resolve
- **Never re-implements validator rules**

**READY = no blockers.** Does not mean zero warnings or final production quality.

### 14-module axis
9 MODULE_IDS in registry order + 5 frames (`hero`, `identity`, `image-band`, `explore`, `calculator`).

### Severity model
| Severity | Sources |
|---|---|
| BLOCKER | loader.issues + normalizedResult.issues + manifestResult.issues + resolver.requiredMissing |
| WARNING | loader.warnings + normalizedResult.warnings + resolver.flagged |
| INFO | empty non-required slots (resolver status = 'missing') |

### Attribution (§3.3)
Each issue is attributed to a moduleId via deterministic pattern matching on the origin string. Unmatched → `unclassified: true`. The attribution table covers all known validator output patterns; the test suite verifies `unclassified.length === 0` for the standard good-parts fixture.

### Report shape
```
{
  slug, family,
  modules: [{ id, blockers, warnings, infos, status }] × 14,
  slots:   [{ slotId, moduleId, required, state, rights, fallbackUsed, blockers, warnings, infos }],
  blockers: item[], warnings: item[], infos: item[], unclassified: item[]
}
```

---

## Test results

```
npm run test:lpe-07    → PASS (16 fixtures + Madrid/Marbella regression)
npm run check          → 0 issues / 5 warnings (pre-existing; no regression)
LPE-01 … LPE-06       → all PASS (no regression)
```

### Madrid: READY (0 blockers, 3 loader warnings, 2 resolver warnings, 1 info)
- loader: stand-in photography, no property film, 5 facts not confirmed
- resolver: property-film no-poster (adapter limitation — always warns when film present)

### Marbella: READY (0 blockers, 2 loader warnings, 2 resolver warnings, 1 info)
- loader: stand-in photography, 3 facts not confirmed
- resolver: same film/poster note

---

## Known limitations

### property-film + 0 warnings impossible
`adaptAssets` always creates the property-film asset record without a poster field. `validateNormalized` always warns "has no poster or fallback" for any film present. Therefore a property with a film will always have at least 2 warnings (resolver). This is an adapter-layer limitation, not a readiness model bug.

### deriveManifest always valid
`adaptExperience` ignores `parts.experience`; manifest validation issues can never be triggered via `readiness()`. validateManifest blockers are structurally unreachable through the current API.

### Admin load order — module-registry.js excluded
`module-registry.js` redeclares `const MODULE_IDS` (already declared by `adapters/index.js`) at the global script scope level. Loading both as non-module `<script>` tags causes a `SyntaxError`. Since `property-loader.js` guards all its registry calls with `typeof LarumModuleRegistry !== 'undefined'` checks and degrades safely, `module-registry.js` is intentionally omitted from `admin.html`. The `deriveManifest` function uses the adapters' own `MODULE_IDS` constant directly, so manifest derivation is unaffected.

---

## Browser smoke test

`window.LarumReadiness.readiness('smoke-test', parts)` executed in-browser:
- Returns correct report shape: 14 modules, 8 slots, typed item arrays
- All 4 globals available: `LarumDomainAdapters`, `LarumAssetContracts`, `LarumAssetResolver`, `LarumLoader`, `LarumReadiness`
- `admin-readiness-panel.js` loads as ES module (HTTP 200, no parse errors)
