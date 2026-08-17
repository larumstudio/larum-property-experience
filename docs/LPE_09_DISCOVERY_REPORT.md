# LPE-09 Pre-Implementation Discovery Report

**Date:** 2026-08-16  
**Status:** DISCOVERY COMPLETE — no blockers  
**Standard gate:** `APPROVE LPE-09` + `implement LPE-09`

---

## Summary

All five decisions that were BLOCKED in the original sandbox discovery are now fully resolved
against the real repo. No blockers remain. LPE-09 is ready for the implementation gate.

---

## Evidence base — files audited

| File | Relevance |
|---|---|
| `docs/migrations/001_phase1_schema.sql` | Canonical schema + RLS; §7 documents preview mechanism |
| `docs/migrations/002_seed_properties.sql` | Madrid + Marbella seeded, confirmed columns |
| `docs/migrations/003_concierge_conversation_key.sql` | Partial unique index (superseded) |
| `docs/migrations/004_concierge_conversation_unique.sql` | Plain UNIQUE on (session_id, property_slug) |
| `docs/DATABASE.md` | Confirms model, RLS table, migration state |
| `schemas/experience-revision.schema.json` | Exists from LPE-01; identifies missing optional fields |
| `schemas/property.schema.json` | Confirms missing `experienceRevisionId` + `organizationId` |
| `admin/admin-core.js` | Confirms auth mechanism (email, no roles/claims) |
| `admin/admin-property-store.js` | Full admin data API; identifies publish/rollback gap |
| `api/_data.mjs` | Concierge dossier fetch path; identifies revision-awareness gap |
| `property-loader.js` | Current db/files/pack source paths + override mechanic |

---

## D1 — Migration baseline

**Status: RESOLVED**

Real repo contains all four migrations:
- `001` — full schema + RLS (organizations, agents, properties, audits, concierge_conversations, concierge_messages)
- `002` — seeds Madrid (published, is_default, display_order=0) + Marbella (published, display_order=1)
- `003` — partial unique index on `(session_id, property_slug) WHERE both NOT NULL`
- `004` — plain UNIQUE index (replaces 003; required for PostgREST ON CONFLICT)
- `DATABASE.md` — canonical model document present

**Next migration number: 005**

Key fact: `properties` table was created in `001` with `organization_id UUID FK → organizations.id`.
No `experience_revision_id` column exists in any migration. This is the primary column LPE-09 must add.

---

## D2 — Preview token/session mechanism

**Status: RESOLVED**

`001_phase1_schema.sql §7` documents the mechanism explicitly:

> "Note on preview (§28): the admin opens the experience on the same origin, so supabase-js
> finds the operator's session in localStorage and the 'authenticated all properties' policy
> lets a draft render through the real production experience. No preview build, no signed tokens."

`DATABASE.md` repeats this verbatim in Spanish.

`admin/admin-core.js` confirms: `supabaseClient.auth.getSession()` — simple Supabase email auth,
no JWT custom claims, no `app_metadata`, no preview helper RPC.

**Decision: preview = same-origin Supabase session + `authenticated all properties` RLS policy.
No signed tokens. No preview build. No new auth primitives needed.**

---

## D3 — Draft/approval lifecycle

**Status: RESOLVED**

Two distinct lifecycles coexist:

| Scope | Column | Enum | Table |
|---|---|---|---|
| Property lifecycle | `properties.status` | `draft \| in_production \| ready \| published \| archived` | `properties` (001) |
| Revision lifecycle | `experience_revisions.status` | `draft \| review \| approved \| published \| archived` | new in 005 |

Current publish mechanism: Admin performs `UPDATE properties SET status='published'` via
`saveContent/saveAssets/saveKnowledge` helpers — no revision concept today.

LPE-09 adds the revision layer on top. Approval workflow: anyone authenticated (no role gates
in the current system). The two `published` values are independent; see R4 for the RLS constraint.

---

## D4 — Concierge snapshot timing

**Status: RESOLVED**

`api/_data.mjs` — `getDossier(slug)`:
- Fetches `properties` row with `status=eq.published` and `select=content,knowledge` via anon key
- In-memory cache: 60 s TTL per slug
- Falls back to PACK bundle on any failure
- `extractDossier(row)` slims to: `content.{label,brand,title,subtitle,intro,shortRef,facts,sequences,dna,setting}` + `knowledge.{property,surroundings}`

For LPE-09 `?source=db-v2` path: `getDossier` must read from the published revision's
`content_snapshot` + `knowledge_snapshot` instead of `properties.content/knowledge`.
The same `extractDossier` shaping applies; only the row source changes.

The PACK bundle fallback path is unchanged.

---

## D5 — Dual status + missing fields

**Status: RESOLVED (gaps identified)**

### What exists in the real repo

| Field | DB (`properties` table) | `property.schema.json` | `admin-property-store.js` INDEX_COLUMNS |
|---|---|---|---|
| `organization_id` | YES (001) | NO | YES |
| `experience_revision_id` | NO | NO | NO |

| Field | `experience-revision.schema.json` |
|---|---|
| `schemaVersion`, `id`, `propertyId`, `revisionNumber`, `status`, `manifest`, `contentSnapshot`, `knowledgeSnapshot`, `assetsSnapshot`, `createdBy`, `createdAt` | Present (`required`) |
| `publishedAt`, `changeSummary`, `approvalBy`, `sourceRevisionId`, `validationReport` | **MISSING — optional fields to add in LPE-09** |

---

## Exact scope

### 1. Migration 005 (new file)

**`docs/migrations/005_experience_revisions.sql`**

```sql
-- CREATE TABLE experience_revisions
CREATE TABLE IF NOT EXISTS experience_revisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  revision_number   INT  NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('draft','review','approved','published','archived')),
  manifest          JSONB NOT NULL DEFAULT '{}',
  content_snapshot  JSONB NOT NULL DEFAULT '{}',
  knowledge_snapshot JSONB NOT NULL DEFAULT '{}',
  assets_snapshot   JSONB NOT NULL DEFAULT '{}',
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at      TIMESTAMPTZ,
  change_summary    TEXT,
  approval_by       TEXT,
  source_revision_id UUID REFERENCES experience_revisions(id),
  validation_report JSONB,
  UNIQUE (property_id, revision_number)
);

-- Publish pointer on properties
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS experience_revision_id UUID REFERENCES experience_revisions(id);

-- RLS: anon reads published revision where property is also published
ALTER TABLE experience_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon reads published revisions"
  ON experience_revisions FOR SELECT TO anon
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id AND p.status = 'published'
    )
  );

CREATE POLICY "authenticated all revisions"
  ON experience_revisions FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
```

### 2. Schema additions

**`schemas/property.schema.json`** — add optional fields:
```json
"experienceRevisionId": { "type": "string" },
"organizationId":       { "type": "string" }
```

**`schemas/experience-revision.schema.json`** — add optional fields:
```json
"publishedAt":       { "type": "string", "format": "date-time" },
"changeSummary":     { "type": "string" },
"approvalBy":        { "type": "string" },
"sourceRevisionId":  { "type": "string" },
"validationReport":  { "type": "object" }
```

### 3. Loader extension (`property-loader.js`)

Add `?source=db-v2` path that reads from `experience_revisions`:
- New internal `loadFromDbV2(slug)` — queries `experience_revisions` WHERE `status='published'`
  JOINed to the property, returns `content_snapshot`, `knowledge_snapshot`, `assets_snapshot`
- The existing `?source=db` path and `loadFromDb()` are **unchanged**
- The existing `loadFromFiles()` and `loadFromPack()` paths are **unchanged**
- All existing tests (T1–T18) must continue to PASS

The `?source=` override string `'db-v2'` is the gate. No change to `autoLoad()` default sequence.

### 4. Admin additions (`admin-property-store.js`)

Three new async functions:

```js
// INSERT a new draft revision from the property's current content/knowledge/assets
export async function createRevision(slug, { content, knowledge, assets, createdBy })

// Publish: UPDATE revision status → 'published', UPDATE property.experience_revision_id
export async function publishRevision(propertyId, revisionId)

// Rollback: UPDATE property.experience_revision_id → previousRevisionId,
//           UPDATE current revision status → 'archived'
export async function rollback(propertyId, targetRevisionId)
```

Add `experience_revision_id` to `INDEX_COLUMNS` so the workspace knows which revision is active.

No change to existing `saveContent`, `saveAssets`, `saveKnowledge`, or audit functions.

### 5. Concierge dossier (`api/_data.mjs`)

`getDossier(slug)` must become revision-aware for the `db-v2` path. Possible approach:

```js
// Current: reads properties WHERE status='published' → content,knowledge
// New:     if property has experience_revision_id, read experience_revisions
//          WHERE id=experience_revision_id AND status='published' → content_snapshot,knowledge_snapshot
//          Falls back to current path if no revision id
```

This is a **narrow, contained change** inside `getDossier` only.
`persistTurn`, `propertyKnown`, all persistence functions: **untouched**.

> NOTE: `api/_data.mjs` is in the protected API file list. Explicit authorization required
> before this change is implemented. The change is narrow and well-scoped.

### 6. Tests

New file: `tests/lpe-09-revisions.test.js`
New script in `package.json`: `"test:lpe-09": "node tests/lpe-09-revisions.test.js"`

Minimum coverage:
- T1: `createRevision` returns a row with correct status='draft'
- T2: `publishRevision` sets revision status='published' + property.experience_revision_id
- T3: `rollback` restores a previous revision pointer + archives current
- T4: `?source=db-v2` loader returns content_snapshot / knowledge_snapshot
- T5: `?source=db-v2` fallback to pack when no revision exists
- T6: anon cannot read draft revision via RLS
- T7: authenticated can read all revisions
- T8: `property.schema.json` validates with new optional fields
- T9: `experience-revision.schema.json` validates with new optional fields
- Regression: lpe-01 through lpe-08 + lpe-10 all PASS

---

## Risks

### R1 — `api/_data.mjs` is a protected file  
`_data.mjs` is in the protected API no-touch list. LPE-09 requires a narrow change inside
`getDossier` to make the dossier fetch revision-aware. This needs explicit de-protection
for LPE-09 scope. The change is isolated to one function; `persistTurn` and all other
functions are untouched.

### R2 — `?source=db-v2` vs existing `?source=db` path  
The current loader's `?source=` override switches between `db`, `files`, and `pack`. Adding
`db-v2` must not alter the behavior of any existing override value. The new path is additive;
the default `autoLoad()` sequence continues to use `db` first. Regression tests T1–T18 must
all PASS unchanged.

### R3 — No initial revisions for Madrid and Marbella  
Migration 005 adds `experience_revision_id` as nullable. Madrid and Marbella have no revision
rows. The `?source=db-v2` loader returns false for them until an initial revision is created.
The existing fallback chain (files → pack) handles this gracefully, but the operator cannot
use the revision-publish flow until the Admin creates an initial revision.

### R4 — Dual "published" concepts  
`properties.status='published'` controls anon visibility today. `experience_revisions.status='published'`
is new. The RLS policy on `experience_revisions` MUST enforce both: anon reads only where
the property is also published. An archived property must not expose its revisions. The
migration 005 SQL draft above includes the JOIN guard.

### R5 — Largest Admin change to date  
`admin-property-store.js` gains 3 new async functions and a new INDEX_COLUMNS field.
Admin workspace wiring (publish button, rollback button) requires admin-workspace.js changes.
This is the Admin's first interaction with `experience_revisions`.

### R6 — Nullable FK add on populated table  
`properties.experience_revision_id` is nullable (correct). Madrid and Marbella rows exist in
production. PostgreSQL `ADD COLUMN IF NOT EXISTS ... NULL` on a populated table is safe — no
constraint violations, no table rewrite on modern Postgres.

---

## Dependencies confirmed

| Dependency | Status |
|---|---|
| LPE-01 seam: `schemas/experience-revision.schema.json` exists | ✅ Present from LPE-01 |
| LPE-08 seam: `property-loader.js` `loadProperty(slug)` public API stable | ✅ LPE-09 adds db-v2 path only |
| LPE-10 seam: analytics needs `experience_revisions.id` | ✅ LPE-09 provides it; LPE-10 waits |

---

## What LPE-09 must NOT change

- `app.js` — no touch
- `modules/*` — no touch
- `experience-shell.js` — no touch
- `analytics.js` — no touch
- `styles.css` — no touch
- `properties/**/*.json`, `index.json` — no touch
- `api/concierge.mjs` — no touch
- `admin/admin-core.js` — no touch
- `admin-property-store.js` existing functions (`saveContent`, `saveAssets`, `saveKnowledge`, all audit functions) — no change
- `api/_pack.mjs` — build artifact; timestamp-only update via `npm run build` if applicable
- Existing migrations (001–004) — no change, no rewrite
- No push to origin/master, no vercel --prod at any point

---

## Blockers

**None.** All five decisions are resolved.

| Decision | Original status | Real-repo status |
|---|---|---|
| D1 — Migration baseline | BLOCKED | **RESOLVED** — migrations 001–004 + DATABASE.md present; next = 005 |
| D2 — Preview token/session | BLOCKED | **RESOLVED** — same-origin session + RLS; documented in §7 of 001 |
| D3 — Draft lifecycle | BLOCKED | **RESOLVED** — two-tier status enum confirmed; no role gates |
| D4 — Concierge snapshot | BLOCKED | **RESOLVED** — `getDossier` reads from `properties`; revision-aware variant identified |
| D5 — Dual status + schema gaps | BLOCKED | **RESOLVED** — gaps identified and scoped: `experience_revision_id` missing from DB + two schemas |

---

## Implementation readiness checklist

- [ ] `APPROVE LPE-09` from Simon
- [ ] `implement LPE-09` instruction received
- [ ] Decision on R1: explicit authorization to modify `api/_data.mjs` for LPE-09 scope
- [ ] Confirm: no Supabase migration can be applied remotely without explicit authorization

Once authorized: migration 005 SQL → schema additions → loader extension → admin store additions →
admin workspace wiring → concierge dossier revision path → tests → docs → ONE commit.

---

*Discovery performed: 2026-08-16. STOP — no implementation performed.*
