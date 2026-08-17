/* ── Larum — Migration 005 — Experience Revisions ─────────────────────
   Adds immutable experience_revisions table and a publish pointer on
   properties. Builds on migrations 001–004; next migration is 006.

   Design decisions (from spec §1.9, §2.3, §2.4 + discovery D1–D5):

   • Revision rows are append-only. content_snapshot / knowledge_snapshot /
     assets_snapshot never change after INSERT. The status column can change
     (draft → review → approved → published → archived) but the payload is
     frozen at creation time.

   • properties.experience_revision_id is the publish pointer. Exactly one
     revision is "active" for a property at any moment — the one the FK
     points at. Rollback = repoint the FK; old revisions keep their status.

   • RLS (anon): a visitor can read this revision only if there is a
     published property whose experience_revision_id equals this revision's
     id. This prevents reading historical, superseded, or draft revisions
     via the public API key.

   • RLS (authenticated): the admin workspace can read and write all
     revisions for the properties it manages.

   Compatibility:
   • properties.organization_id already exists from migration 001 — no
     duplicate.
   • The experience_revision_id FK is nullable, so existing Madrid and
     Marbella rows require no update; they continue to work as before.
   ─────────────────────────────────────────────────────────────────── */

-- ── experience_revisions ─────────────────────────────────────────── --

CREATE TABLE IF NOT EXISTS experience_revisions (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  revision_number      INT          NOT NULL,
  status               TEXT         NOT NULL DEFAULT 'draft'
                                    CHECK (status IN (
                                      'draft','review','approved','published','archived'
                                    )),
  manifest             JSONB        NOT NULL DEFAULT '{}',
  content_snapshot     JSONB        NOT NULL DEFAULT '{}',
  knowledge_snapshot   JSONB        NOT NULL DEFAULT '{}',
  assets_snapshot      JSONB        NOT NULL DEFAULT '{}',
  created_by           TEXT         NOT NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Optional fields (spec §1.9 extended)
  published_at         TIMESTAMPTZ,
  change_summary       TEXT,
  approval_by          TEXT,
  source_revision_id   UUID         REFERENCES experience_revisions(id),
  validation_report    JSONB,

  UNIQUE (property_id, revision_number)
);

-- ── Publish pointer on properties ───────────────────────────────── --

-- Nullable: existing Madrid and Marbella rows require no update.
-- Becomes non-null after the operator publishes the first revision.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS experience_revision_id UUID
    REFERENCES experience_revisions(id);

-- ── Row-Level Security ────────────────────────────────────────────── --

ALTER TABLE experience_revisions ENABLE ROW LEVEL SECURITY;

-- Anon sees only the one revision the property currently points at,
-- and only when that property itself is published.
-- Using the FK pointer (not revision.status) as the single source of
-- truth: rollback leaves old revisions in place without exposing them.
CREATE POLICY "anon reads current revision"
  ON experience_revisions FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.experience_revision_id = id
        AND p.status = 'published'
    )
  );

-- Authenticated (admin operator) can read and write all revisions.
CREATE POLICY "authenticated all revisions"
  ON experience_revisions FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
