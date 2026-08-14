# Larum — Next Phases

Short companion to `docs/LARUM_PROJECT_HANDOFF.md` (full handoff) and `docs/LARUM_ADMIN_HANDOFF_M5.5C.md` (Admin-specific detail).

---

## Current state

- Repo: `larumstudio/larum-property-experience`, branch `master`
- HEAD: `eab3a92` — `M5.5b: concierge history panel`
- 4 commits ahead of `origin/master` (M5.3 · M5.4 · M5.5a · M5.5b), unpushed
- M5.5c fully implemented + real-save validated, **uncommitted**
- Last deployed to Vercel: **M5.4** (2026-08-10). M5.5a / b / c never deployed.
- No pending push, no pending deploy.

---

## What is DONE

Phase-1 (pre-M5): schema, seeds, concierge persistence, RLS.

Admin — Property Workspace:

- ✅ **M5.2** Content editor
- ✅ **M5.3** Overview enrichment
- ✅ **M5.4** Assets editor (URL-only)
- ✅ **M5.5a** Experience preview tab
- ✅ **M5.5b** Concierge → History
- ✅ **M5.5c** Concierge → Knowledge (uncommitted)

---

## What remains in M5

- ⏳ **M5.6** Audits + Larum Score
  - Workspace `Audit` tab (currently empty state)
  - Top-level `Auditorías` sidebar section
  - Consumes the pre-existing `audits` table (migration 001 §4)
- ⏳ **M5.7** Analytics
  - Top-level global `Analytics`
  - Per-property `Analytics` tab
  - Per-property `Leads` tab

---

## Recommended next phase

On the new machine, in this order:

1. Verify state — `git status`, `git log`, `.env.local` present.
2. **Commit M5.5c** (message: `M5.5c: concierge knowledge editor`).
3. Commit the handoff docs as a separate commit.
4. Ask Simon for AUTORIZO before `git push origin master` and before `vercel --prod`.
5. Start **M5.6** — Audits + Larum Score.

M5.6 first because the `audits` table + Auditorías skill already exist; wiring them into the workspace closes the "content → concierge → audit" loop. M5.7 (Analytics) is downstream — it reads what M5.6 produces plus the pre-existing events tables.

Full pre-flight and continuation checklist: `docs/LARUM_PROJECT_HANDOFF.md` §11.

---

## Future projects (out of scope for M5)

Separate projects once M5 closes:

- **A.** Property Experience visual improvements (visitor-side)
- **B.** Agent Experience / Agent pages (fills the "Agentes" sidebar placeholder)
- **C.** Sales / Prospecting Engine (lives in `larum-content-engine`, separate repo)

Do not begin any of the three from within M5.6 or M5.7.
