# Larum Admin — Handoff Package (M5.5c)

**Snapshot date:** 2026-08-14
**Author:** Simon (Larum Studio) + Claude Opus 4.7
**Purpose:** transfer this project to another terminal / computer with zero context loss and resume with M5.6 (Audits + Larum Score) or M5.7 (Analytics) cleanly.

This document is the single source of truth for continuation. Read it end-to-end before touching code.

---

## 1 · Exact git state at handoff

| Field | Value |
|---|---|
| Branch | `master` |
| Local HEAD | `eab3a9255f57c4f076deced285912e2444e44e06` — commit `eab3a92` |
| Local HEAD message | `M5.5b: concierge history panel` |
| `origin/master` HEAD | `918af67` (`M5.2: content editor, GitHub preparation`) |
| Local ahead of origin | **4 commits, unpushed** |
| Working tree | **NOT clean** — M5.5c is fully implemented but **uncommitted** by design |

### Unpushed commits (oldest → newest)

```
1748109  M5.3: workspace overview enrichment
5687274  M5.4: assets editor with URL-only media management
d0037f1  M5.5a: experience preview tab
eab3a92  M5.5b: concierge history panel     ← HEAD
```

### Working tree — M5.5c changes (uncommitted)

```
Modified:
  admin.html                                (+62 CSS lines, .ke-*)
  admin/admin-concierge-panel.js            (+47 / -14; Knowledge subtab enabled + dispatch)
  admin/admin-property-store.js             (+14; saveKnowledge write-through)

Untracked:
  admin/admin-knowledge-editor.js           (new, 1123 lines)
```

### Milestone status

| Milestone | Scope | State |
|---|---|---|
| M5.3 | Workspace Overview enrichment | ✅ **DONE** — committed `1748109` |
| M5.4 | Assets editor (URL-only media) | ✅ **DONE** — committed `5687274` |
| M5.5a | Experience preview tab | ✅ **DONE** — committed `d0037f1` |
| M5.5b | Concierge History panel | ✅ **DONE** — committed `eab3a92` |
| M5.5c | Concierge Knowledge editor | ✅ **DONE + VALIDATED** — **uncommitted** (Simon closed the phase after real-save validation without instructing a commit) |
| M5.6 | Audits + Larum Score | ⏳ **PENDING** — not started |
| M5.7 | Analytics | ⏳ **PENDING** — not started |

**First action on the new terminal:** decide whether to commit M5.5c (recommended message: `M5.5c: concierge knowledge editor`) before starting M5.6. See §9 for the pre-commit checklist.

---

## 2 · Larum Admin — architecture as implemented

Sidebar navigation is defined in `admin.html` and routed by `admin/admin-router.js` on hash change.

```
Larum Admin
├─ Dashboard              (admin/admin-dashboard.js — implemented, pre-M5)
├─ Clientes               (admin/admin-clients.js — implemented, pre-M5)
├─ Agentes                (placeholder — future project B, see §8)
├─ Propiedades            (admin/admin-properties.js — implemented)
│   └─ Property Workspace (admin/admin-workspace.js)
│       ├─ Overview       ✅ M5.3
│       ├─ Audit          ⏳ M5.6 placeholder (empty state)
│       ├─ Content        ✅ M5.2  (admin-content-editor.js)
│       ├─ Assets         ✅ M5.4  (admin-assets-editor.js)
│       ├─ Experience     ✅ M5.5a (admin-experience-preview.js)
│       ├─ Concierge      ✅ M5.5b + M5.5c
│       │   ├─ History     ✅ M5.5b (admin-concierge-panel.js)
│       │   └─ Knowledge   ✅ M5.5c (admin-knowledge-editor.js)
│       ├─ Analytics      ⏳ M5.7 placeholder
│       └─ Leads          ⏳ M5.7 placeholder
├─ Auditorías             ⏳ M5.6 placeholder
├─ Leads                  (pre-M5, implemented)
├─ Analytics              ⏳ M5.7 placeholder (global-level; per-property lives inside workspace)
└─ Ajustes                (pre-M5, minimal)
```

### What is DONE vs PENDING at Admin level

**DONE:**
- Property list + workspace shell + Overview
- Content editor (M5.2)
- Assets editor (M5.4)
- Experience preview tab (M5.5a)
- Concierge History panel (M5.5b)
- Concierge Knowledge editor (M5.5c)
- Auth gate, session, property_store cache, router, ui components

**PENDING inside M5:**
- **M5.6** — Audit tab + top-level Auditorías + Larum Score
- **M5.7** — global Analytics + per-property Analytics + per-property Leads

**PENDING outside M5 (future projects, see §8):** Agentes, Property Experience visual work, Sales/Prospecting Engine.

---

## 3 · Property Workspace — tab architecture and module dependencies

### Mount flow

`admin/admin-router.js` → `navigate('workspace', slug)` → `admin-workspace.js render(container, slug)` → `loadProperty(slug)` from `admin-property-store.js` → `draw()` which:
1. Emits page header + tab strip (`TABS` constant in `admin-workspace.js`).
2. Injects `renderTab(activeTab)` return HTML into `#workspaceContent`.
3. Mounts each editor into its `#*Mount` div when its tab is active.

Tab switching is intra-workspace via `__workspaceTab(tabId)`. Cross-page teardown fires only when the router navigates away from `workspace` (calls `workspace.teardown()` which cascades to every editor's `teardown()`).

### Editor module contract (invariant)

Each editor exports:
- `render(container, property)` — idempotent per slug; deep-clones the JSONB column into a local draft.
- `teardown()` — clears module state + removes DOM listeners.

Post-M5.5b + M5.5c editors use **local event delegation** (`data-*-action` attributes, one click listener on `containerRef`). Older editors (Content, Assets, Experience) still use `window.__ce*`, `__ae*`, `__ex*` globals — this is a known inconsistency, not a defect. See §7.

### Module dependency map

```
admin-workspace.js
 ├─ admin-core.js        (esc, session)
 ├─ admin-ui.js          (tabs, badge, emptyState)
 ├─ admin-property-store.js
 │   ├─ loadIndex()
 │   ├─ loadProperty(slug)
 │   ├─ getCached(slug)
 │   ├─ saveContent(slug, content)
 │   ├─ saveAssets(slug, assets)
 │   └─ saveKnowledge(slug, knowledge)     ← NEW M5.5c
 ├─ admin-content-editor.js          (uses saveContent, window.__ce*)
 ├─ admin-assets-editor.js           (uses saveAssets, window.__ae*)
 ├─ admin-experience-preview.js      (read-only iframe, window.__exLang)
 └─ admin-concierge-panel.js         (M5.5b + subtab wiring for M5.5c)
     ├─ subtab History  → internal render
     └─ subtab Knowledge → admin-knowledge-editor.js (M5.5c)
                            └─ uses saveKnowledge
```

### Concierge panel subtab semantics

- `state.activeSubtab: 'history' | 'knowledge'`
- Subtab switch does **NOT** teardown the sub-editor: knowledge draft survives across subtab toggles. The `panel.teardown()` (fired only on workspace-level unmount) cascades to `knowledgeEditor.teardown()`.
- History data loads once per slug and is cached in module state.

---

## 4 · Locked architectural decisions (do not renegotiate)

1. **Additive-only for M5.** Every editor writes to a single JSONB column via UPDATE on `properties`. No new tables, no schema changes, no RLS changes. Confirmed across M5.2, M5.4, M5.5c.
2. **Cache write-through in property_store.** `saveContent / saveAssets / saveKnowledge` UPDATE the row then mutate the cached row with a deep-clone. No re-fetch after save.
3. **Deep-clone draft, unknown-key preservation.** Editors never normalize the JSONB shape. What was loaded round-trips on save (modulo PostgreSQL jsonb key reordering — see §7).
4. **Local event delegation for new editors.** Post-M5.5b editors use `data-*-action` + one `addEventListener('click', …)` on their container. Zero `window.__*` globals. Rationale: prevents teardown of one mount from breaking another (bug demonstrated + fixed in M5.5b).
5. **No visitor / API / migration / RLS changes.** Locked since M5 approval.
6. **Concierge panel is a two-subtab controller.** History and Knowledge share the same subtab strip and mount slot. This is why Knowledge lives inside Concierge, not as a top-level tab.
7. **`property_slug` (text) is the History filter — not `property_id` (uuid).** All 13 conversations in production have `property_id = null` because `api/_data.mjs::upsertConversation` writes only `session_id / property_slug / lang`. See risk R2 in §7.
8. **Facts value types preserved.** `property.facts[key].value` may be string / number / null. Knowledge editor exposes a type selector; save preserves the real JS type.
9. **Spaces cross-ref safety.** `property.spaces[name]` rename requires two confirms + explicit warning of `content.sceneSpaces` refs. Remove is **blocked in UI** for referenced spaces. Editor never mutates `content` — that lives in the Content editor.
10. **Unknown surroundings shapes → read-only JSON.** Only known shapes (`neighborhood`, `distances`, `bilingual`, `status-note`, `dict-bilingual`) get structured editors. Anything else is rendered as `<pre>` with a warning; body has zero editable inputs.

### Protected files (byte-identical across M5.3 → M5.5c)

Do **not** touch these while working in M5.6 or M5.7 unless the scope of that milestone explicitly permits it:

```
api/**                                       (concierge, data, rate, pack)
docs/migrations/**                           (001–004)
property-loader.js                           (visitor loader + validator)
property-pack.js                             (offline pack — generated)
app.js                                       (visitor runtime)
analytics.js                                 (client analytics engine)
build-pack.js                                (pack generator)
validate-content.js                          (CLI validator)
```

And within the admin, the editors from prior milestones:

```
admin/admin-content-editor.js                (M5.2)
admin/admin-assets-editor.js                 (M5.4)
admin/admin-experience-preview.js            (M5.5a)
admin/admin-property-store.js *              (add-only for new save methods; do not modify existing)
admin/admin-workspace.js                     (do not re-order tabs; do not remove existing mounts)
```

`*` = additive extensions to the store (e.g. a hypothetical `saveScore` for M5.6) are the only expected mutations.

---

## 5 · Database / schema assumptions (as of handoff)

Applied migrations (docs/migrations):
- `001_phase1_schema.sql` — canonical entity tree, RLS, concierge tables.
- `002_seed_properties.sql` — seed madrid + marbella from local JSON.
- `003_concierge_conversation_key.sql` — partial unique index on (session_id, property_slug).
- `004_concierge_conversation_unique.sql` — replaces partial with plain unique index so PostgREST ON CONFLICT works.

Tables used by the admin (columns the admin actually reads/writes):

| Table | Read | Write | Column notes |
|---|---|---|---|
| `properties` | admin index, workspace load | `content` (M5.2), `assets` (M5.4), `knowledge` (M5.5c) | Generated cols `name_en, name_es, location, reference, cover_image, property_type, price` derive from `content` and `assets` |
| `concierge_conversations` | M5.5b History (paginated by `property_slug`) | never (admin) | RLS `authenticated reads conversations` (SELECT only) |
| `concierge_messages` | M5.5b expand (by `conversation_id`) | never (admin) | Fact: `usage` is `jsonb`, assistant messages contain `{model, uncachedInput, cacheWritten, cacheRead, output, costUSD}` (camelCase) |
| `leads / sessions / analytics_events` | pre-M5 dashboards | already writing pre-M5 | Have `property_id` FK; historical text `property` column preserved |
| `organizations / agents` | placeholders | not yet | reserved for future project B |
| `audits` | future M5.6 | future M5.6 | table exists (001), status enum `requested/in_progress/completed/cancelled`, `document_url + summary jsonb`; **no admin surface yet** |

### RLS relevant to the admin

- `authenticated all properties` — full read/write for signed-in operator.
- `authenticated reads conversations` / `authenticated reads messages` — SELECT only. Admin cannot INSERT/UPDATE/DELETE concierge_* even by mistake.
- `authenticated all audits` — full read/write; M5.6 will consume this.

### Runtime data facts (verified in M5.5c discovery, 2026-08-14)

- Total rows in `properties`: **2** (madrid, marbella).
- Total `concierge_conversations`: **13** (madrid 10, marbella 3).
- Total `concierge_messages`: **20**.
- Baseline `updated_at` per property (pre-M5.5c saves):
  - madrid: `2026-08-13T01:10:16.078339+00:00`
  - marbella: `2026-08-13T01:10:18.512186+00:00`
- Post-M5.5c-validation `updated_at` for madrid: `2026-08-14T19:03:37.563387+00:00` (two saves ran; DB semantically restored to baseline).
- All rows in `concierge_conversations` have `property_id = NULL` — see risk R2.

---

## 6 · Knowledge editor (M5.5c) — reference notes

### Draft lifecycle
- Deep-clone `property.knowledge` on first mount per slug.
- Persist `draft` at module scope, survives subtab toggle.
- Dirty = `JSON.stringify(draft) !== JSON.stringify(baseline)`.
- `handleSave()`: validates canSave() → `saveKnowledge(slug, deepClone(draft))` → `baseline = deepClone(draft)`.
- `canSave` gates: fallback.{en,es} non-empty, ≥1 facts, ≥5 spaces, ≥6 intents, ≥1 interestSignal, ≥1 qualification, non-empty surroundings.

### Shape detectors (surroundings)

```
key==='neighborhood' + val.name         → neighborhood
key==='distances' + isArray             → distances
key==='lifestyle' + values all bilingual → dict-bilingual
{en?, es?, status?} only                → bilingual
{status?, note?} only                   → status-note
dict-of-bilingual-blocks                 → dict-bilingual
anything else                            → unknown (read-only JSON)
```

### Warnings (non-blocking)
- Interest name not in visitor enum `[privacy, family, architecture, city_life, investment, technology, outdoor_living, entertaining, wellness]` → warn pill.
- Qualification trigger not in `[after_3_questions, interest_detected, high_intent]` → warn pill (analytics.js:456 only dispatches these three).
- Space referenced by `content.sceneSpaces` → `ref` pill on row, warn box in body.

### Blocking rules
- Remove space referenced by content → UI button replaced with disabled version.
- Rename space referenced → two prompts (initial + final confirm) with warning.

---

## 7 · Known risks / technical debt (do NOT fix now)

**R1. Singleton editor state.** Every editor keeps state at module scope (draft, containerRef, openItems). An ad-hoc second mount overwrites the singleton and teardown of it wipes the primary's state. In production only one mount is live at a time; the hazard is only exposed by ad-hoc test mounts. M5.5b fix eliminated the specific `ReferenceError` class of this bug (globals removed); state contention remains as a design property.

**R2. `property_id` is NULL on every existing concierge conversation.** `api/_data.mjs::upsertConversation` does not resolve slug → uuid. History filter uses `property_slug` today. When/if the API is updated to write `property_id`, extend the M5.5b filter with `.or('property_slug.eq.…,property_id.eq.…')` before disabling the slug branch. **Do not modify `api/_data.mjs` in M5.6/M5.7 scope.**

**R3. PostgreSQL jsonb key order.** Dicts (`facts`, `systems`, `spaces`, `interestSignals`, etc.) may come back from the database in a different key order than written. Arrays preserve order. Any comparison of knowledge byte-strings must be semantic (see M5.5c test helper `semEqual`). This is not corruption.

**R4. Global-namespace editors from earlier milestones.** Content, Assets, Experience editors still use `window.__ce*`, `__ae*`, `__ex*`. They work in production single-mount, but share the M5.5b vulnerability class. Not scheduled for refactor; if any of these ever spawn a companion (e.g. Audit editor), migrate them to local delegation first.

**R5. Interest name / qualification trigger schema drift.** Editor allows any strings; visitor consumers gate on hardcoded enums. Warnings surface this at edit time. No enforcement in the DB. A future migration could hoist enums into a config table — not scope of M5.

**R6. Add-block flow creates only `{en, es, status}`.** The Knowledge editor's `+ Add surroundings block` always seeds a bilingual shape. Operators wanting exotic shapes must edit via SQL — acceptable for M5 scope.

**R7. History pagination is snapshot at mount.** Turns arriving mid-view do not appear without re-mount. No realtime subscription. Acceptable for operator hint.

**R8. Editor size.** `admin-knowledge-editor.js` = 1123 lines, ~2× the design-pass estimate. Well-factored but monolithic. Splitting is not required now; if M5.6 introduces a similar editor, consider extracting a shared repeater helper.

**R9. Windows CRLF warnings.** `git` warns about LF→CRLF conversion on the touched files. Cosmetic; no fix needed on the current terminal since the repo has been Windows-native throughout M5.

**R10. Uncommitted M5.5c on handoff.** Working tree is not clean at handoff. First action on the new terminal must be `git status` to observe, then commit M5.5c as a discrete step before starting M5.6.

---

## 8 · Future projects (developed separately, after M5)

These are **out of scope** for M5.6 and M5.7. Do not start them from within the Admin phase.

### A. Property Experience visual improvements
Refinements to the visitor-facing experience (`app.js`, `styles.css`, section layouts, motion, imagery). Owned by design + frontend, not by the admin.

### B. Agent Experience / Agent pages
The "Agentes" sidebar entry is a placeholder today. Full agent CRUD + Agent Presence pages (per `docs/PHASE_1_SPEC.md` §Agent) constitute a separate project once M5 closes.

### C. Sales / Prospecting Engine
Larum Studio's outbound engine (WhatsApp / email skills, lead scoring, prospecting workflows). Lives in a different repo per user memory; the admin integrates with it later.

---

## 9 · Continuation checklist (for the new terminal)

Before touching anything:

```bash
git rev-parse HEAD        # must be eab3a92
git status                # must show the 3 modified + 1 untracked (M5.5c)
git log --oneline origin/master..HEAD    # 4 unpushed commits
```

### Recommended first commit (M5.5c)

Once verified nothing else has drifted:

```bash
git add admin.html admin/admin-concierge-panel.js \
        admin/admin-property-store.js admin/admin-knowledge-editor.js

git commit -m "M5.5c: concierge knowledge editor

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

Match the existing subject-only convention (`M5.5b: concierge history panel`, `M5.5a: experience preview tab`, etc.).

### Then start M5.6 (Audits + Larum Score)

Read before implementing:
- `docs/PHASE_1_SPEC.md` §Audit
- `docs/migrations/001_phase1_schema.sql` §4 (audits table)
- `docs/AI_CONCIERGE_SPEC.md` (concierge-anchored scoring hints)
- The Property Workspace Audit tab is currently `emptyState('Audit & Readiness', 'Coming in M5.6.')` — that's the mount point.

Read before implementing M5.7 (Analytics):
- `admin/admin-core.js` — existing analytics_events queries.
- `analytics.js` — visitor-side event schema.
- `admin/admin-ui.js` — existing chart primitives (barChart, donutChart, interestBars) available for reuse.

Do not push to `origin/master` until Simon explicitly authorizes.

---

## 10 · Reference commit hashes

```
eab3a92  M5.5b  (HEAD, current)
d0037f1  M5.5a
5687274  M5.4
1748109  M5.3
918af67  M5.2   (origin/master)
```

M5.5c is at HEAD + working tree; not yet committed.

---

*End of handoff. Companion: `docs/NEXT_PHASES.md`.*
