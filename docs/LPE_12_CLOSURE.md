# LPE-12 Harden QA — Closure

**Date:** 2026-08-17
**Phase:** LPE-12 CLOSED

---

## Immovable constraints — confirmed respected

- No push to `origin/master`
- No `vercel --prod`
- No DB migrations applied to Supabase
- No new migrations authored
- No RLS changes
- No schema changes
- No touch to: `app.js`, `modules/*` (runtime), `properties/**/*.json`,
  `schemas/*`, `property-loader.js`, `analytics.js` (write path),
  `experience-shell.js`, `consent.js`, `api/*`, `supabase-config.js`,
  `build-pack.js`, `validate-content.js`, `index.html`, `vercel.json`,
  `docs/migrations/*`
- Admin files: read-only (injection gate check only, no writes)
- Migration 005: authored in LPE-09, committed, NOT applied to Supabase
- LPE-01 through LPE-11 files untouched and frozen
- LPE-13 not started

---

## Deliverables

| # | Deliverable | Status |
|---|---|---|
| 1 | `tests/lpe-12-gates.test.js` — 33-assertion gate suite | DONE |
| 2 | `tests/e2e/smoke/smoke.spec.js` — Playwright smoke (9 × 2 = 18 tests) | DONE |
| 3 | `tests/e2e/smoke/a11y.spec.js` — axe gate (3 × 2 = 6 tests) | DONE |
| 4 | `tests/lpe-12-lighthouse.js` — Lighthouse CONDITIONAL gate | DONE |
| 5 | `tests/e2e/static-server.js` — zero-dependency static server | DONE |
| 6 | `playwright.config.js` — desktop + mobile projects | DONE |
| 7 | `package.json` — 5 scripts + 4 devDependencies | DONE |
| 8 | `styles.css` — a11y fix (visibility:hidden on closed overlays) | DONE |
| 9 | Harness dependency change flagged (LPE-00 baseline change) | FLAGGED |
| 10 | `npm run test:lpe-01 … test:lpe-11` — all PASS (unchanged) | PASS |
| 11 | `npm run test:lpe-12:gates` — 33/33 PASS | PASS |
| 12 | Playwright smoke — 18/18 PASS | PASS |
| 13 | axe gate — 6/6 PASS | PASS |
| 14 | Lighthouse — runnable-now PASS, conditional documented | PASS |
| 15 | `npm run check` — 0 issues / 5 warnings (identical baseline) | PASS |
| 16 | Admin injection gate — 20 files, 0 patterns found | PASS |
| 17 | `docs/LPE_12_REPORT.md` | DONE |
| 18 | `docs/LPE_12_CLOSURE.md` | DONE |

---

## Runnable-now gates — all PASS

| Gate | Method | Result |
|---|---|---|
| Functional (smoke) | Playwright desktop + mobile | 18/18 PASS |
| Responsive | Playwright mobile project (390×844) | 9/9 PASS |
| Accessibility | axe-core (0 critical, 0 serious) | 6/6 PASS |
| Schema/Data | npm run check | 0 issues / 5 warnings |
| Asset | Hero image ≤ 500KB | PASS |
| Analytics | LPE-10 frozen, gate test | PASS |
| Concierge fallback | handleFilmTrigger → jumpTo('concierge') tested | PASS |
| Admin injection | 20 files × 6 patterns — 0 hits | PASS |

---

## Conditional gates — documented, NOT blocking

| Gate | Score | Gated on | Phase |
|---|---|---|---|
| Performance | 66 desktop / 62 mobile | Measured on `?source=pack` — see correction below | CONDITIONAL |
| LCP | 3.06s / 5.44s | Measured on `?source=pack` — see correction below | CONDITIONAL |
| SEO | 50 | noindex/nofollow (index.html FORBIDDEN) | CONDITIONAL |
| Security/RLS | Not tested | Migration 005 not applied to Supabase | CONDITIONAL |
| Grounded Concierge | Not tested | ANTHROPIC_API_KEY (operational) | CONDITIONAL |

---

## Correction (2026-08-18, added during Project State Reconciliation)

At the time this closure was written (2026-08-17), LPE-08 (lazy loading) and LPE-09
(db-v2 loader) were already CLOSED — the table above's original wording ("Gated on:
LPE-08") was read by a later session as "LPE-08 is not implemented yet," which is
false and was never the intent.

What is actually true, confirmed by reading `tests/lpe-12-lighthouse.js` and
`property-loader.js`:

- `tests/lpe-12-lighthouse.js` measures `?property=marbella&source=pack` — the
  **offline fallback route** (`property-pack.js`, both properties' full payload
  bundled, used when Supabase is unreachable). This route cannot benefit from lazy
  loading by design: it has no network round trip to defer.
- The **primary online route**, `property-loader.js::autoLoad()`, tries `db-v2`
  (LPE-09, revision-aware, lazy) first, then `db` (LPE-08, lazy), and only falls
  back to `pack` last. Both lazy routes are CLOSED and are what a real visitor with
  connectivity actually gets.
- Lighthouse never measured the `db`/`db-v2` route in this phase, because CI has no
  live Supabase project to test against. The 66/62 score is real for the pack
  route; it is not evidence about the route real visitors take.
- This is a **measurement gap in the LPE-12 harness**, not an unresolved product
  performance problem. It does not block LPE-13 or any later phase. Closing the gap
  (running Lighthouse against `db`/`db-v2` with a real or mocked Supabase backend)
  is a candidate for a future phase, not a reopening of LPE-08/09/12.

`tests/lpe-12-lighthouse.js`'s `THRESHOLDS.performance.conditional` string
("LPE-08 (lazy load not implemented)") is left as-is in the test file itself since
it does not affect the PASS/CONDITIONAL/FAIL logic — this closure document is the
corrected reference for how to interpret that label.

---

## What LPE-12 does NOT do

- Does not apply any migration to Supabase (requires explicit authorization)
- Does not implement LPE-08 (lazy load) or LPE-09 (RLS)
- Does not remove noindex/nofollow (private prototype by design)
- Does not fix the MODULE_IDS SyntaxError (pre-existing LPE-07 deuda)
- Does not modify any runtime code (app.js, modules, analytics write path)
- Does not start LPE-13

---

## Next phase

**LPE-13** or whichever phase is approved next.
Standard gate: `APPROVE LPE-XX` + `implement LPE-XX`.

**STOP.**
