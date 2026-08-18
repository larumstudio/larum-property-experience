# Larum — Next Phases

Short companion to `docs/LARUM_PROJECT_HANDOFF.md` (full handoff), `docs/LARUM_ADMIN_HANDOFF_M5.5C.md` (Admin-specific detail, historical — see note there), and the per-phase `docs/LPE_*_CLOSURE.md` / `docs/M5_X_CLOSURE.md` documents (authoritative for each individual phase).

**Last reconciled:** 2026-08-18, against `git log` and the test suite — not against chat history. If this document and `git log --oneline -25` disagree, trust `git log` and re-derive this file.

---

## Current state

- Repo: `larumstudio/larum-property-experience`, branch `master`
- Repo root: `prototype/` (this file's directory, not the parent folder it may be checked out under)
- HEAD: `cd825d0` — `feat(admin-m5x): create property, revisions and status transitions`
- **17 commits ahead of `origin/master`, unpushed.** No pending push has been authorized.
- Working tree: clean (aside from `test-results/`, a pre-existing untracked Playwright artifact — see Technical Debt).
- Two independent tracks both closed as of this commit: **M5** (Admin) and **LPE** (Visitor Experience), plus one unnumbered follow-on: **Admin-M5.X**.

---

## CLOSED

### M5 — Admin (M5.0 → M5.7)

| Phase | Scope | Commit |
|---|---|---|
| M5.0–M5.1 | Foundation, admin shell, property index + lazy loading | `1807968` and earlier |
| M5.2 | Content editor | `918af67` (also `origin/master` HEAD) |
| M5.3 | Workspace Overview enrichment | `1748109` |
| M5.4 | Assets editor (URL-only) | `5687274` |
| M5.5a | Experience preview tab | `d0037f1` |
| M5.5b | Concierge History panel | `eab3a92` |
| M5.5c | Concierge Knowledge editor | `392f016` |
| M5.6 | Audits + Larum Score | `386becd` |
| M5.7 | Property analytics, leads, global analytics | `e4489be` |

All of M5 is closed and committed. Only M5.2 has been deployed to Vercel (2026-08-10); M5.3 through M5.7 exist locally/on `master` but have not been pushed or deployed.

### LPE — Visitor Experience (LPE-01 → LPE-12)

| Phase | Scope | Commit |
|---|---|---|
| LPE-01–06 | Domain schemas, legacy adapters, derived manifests, shell, 6 P0 modules, family recipes, assets | `5746934` (integrated together) |
| LPE-07 | Build Readiness model (headless `readiness()` + admin Readiness tab) | `6c3d3b9` |
| LPE-08 | Lazy loading (`loadIndex()` / `loadProperty()` split) | `49ad05a` |
| LPE-09 | `experience_revisions` table, db-v2 loader, revision lifecycle in the store (no admin UI yet, by design) | `6f07b92` |
| LPE-10 | Canonical analytics IDs, admin null-report surfacing | `8c1d9c8` |
| LPE-11 | Villa vertical slice acceptance suite | `4fcbb78` |
| LPE-12 | Harden QA — Playwright smoke, axe-core, Lighthouse gates | `48ae6b1` |

All of LPE-01 through LPE-12 is closed and committed. See `docs/LPE_12_CLOSURE.md` (as corrected 2026-08-18) for the current, accurate reading of its conditional gates.

### Admin-M5.X — Create Property, Revisions tab, status transitions

Not part of the M5.0–M5.7 or LPE-01–12 numbering — a follow-on Admin phase closed after M5.7 and LPE-12. Commit `cd825d0`. Full detail: `docs/M5_X_CLOSURE.md`.

Delivered: Create Property form, property status lifecycle transitions (draft → in_production → ready → published → archived) with confirmation gates, a Revisions tab in the Workspace (create/publish/rollback), and two resilience/state-sync fixes found during QA (see the closure doc). 43/43 new tests pass; the pre-existing LPE-09 revision-sequence suite (23/23) shows no regression.

---

## TECHNICAL DEBT / OPEN ISSUES

Known, confirmed problems that do **not** by themselves constitute a new phase — they are candidates to fold into whatever phase is defined next, or to fix standalone, at Simon's discretion.

- **`MODULE_IDS` double declaration (SyntaxError).** `schemas/families.js:17` and `schemas/adapters/index.js:3` both declare a top-level `const MODULE_IDS`. If both load as classic `<script>` tags in the same document, the second declaration throws `SyntaxError: Identifier 'MODULE_IDS' has already been declared`. First flagged in LPE-07; still unresolved through LPE-12. Non-fatal in current usage (filtered out of the Playwright console-error checks), but a real, reproducible bug — not a style nit.
- **Lighthouse performance harness only measures the offline fallback route.** `tests/lpe-12-lighthouse.js` runs against `?source=pack`, the eager, no-lazy-load fallback used when Supabase is unreachable. The primary online route (`db-v2` → `db`, both closed in LPE-08/LPE-09) is never measured by this harness, because CI has no live Supabase instance to test against. The 66/62 score is real for the pack route, but it is not evidence about the route real visitors take. See `docs/LPE_12_CLOSURE.md` for the corrected wording.
- **`test-results/` is untracked and not in `.gitignore`.** Playwright output directory; harmless, but should eventually be gitignored.

---

## OPERATIONAL PENDING

- **Migration 005 (`docs/migrations/005_experience_revisions.sql`)** — authored and committed in LPE-09, **not applied to the production Supabase project**. Every consumer (`property-loader.js` db-v2 path, `analytics.js` canonical IDs, `admin/admin-property-store.js`, the Workspace Revisions tab) has a verified fallback for its absence — nothing is broken today. Applying it is additive/idempotent and low-risk, but it is a real production database change and requires Simon's explicit **AUTORIZO** before it is run, exactly like every other Supabase-affecting step in this project's history. Not blocking any current work.
- **Push to `origin/master` / `vercel --prod`** — 17 unpushed commits. Requires Simon's explicit AUTORIZO, as always.

---

## NEXT PHASE

**LPE-13 — NOT YET DEFINED.**

A `PROJECT STATE RECONCILIATION REPORT` (2026-08-18) surveyed the evidence and found several reasonable directions (fixing `MODULE_IDS`, closing the performance-measurement gap, applying migration 005 once authorized, or picking up whatever the external LPE roadmap package defines next) — but did not select one. Scope for LPE-13 is to be decided by Simon before any implementation begins. Standard gate applies: `APPROVE LPE-13` + `implement LPE-13`.

Do not begin LPE-13 work, including the `MODULE_IDS` fix, without that explicit approval — even though the bug is confirmed, fixing it is a scope decision, not a foregone conclusion.

---

## Future projects (out of scope for M5 / LPE)

Unchanged from prior handoffs — still separate, still out of scope:

- **A.** Property Experience visual improvements (visitor-side)
- **B.** Agent Experience / Agent pages (fills the "Agentes" sidebar placeholder)
- **C.** Sales / Prospecting Engine (lives in `larum-content-engine`, separate repo)

Do not begin any of the three without a dedicated approval.
