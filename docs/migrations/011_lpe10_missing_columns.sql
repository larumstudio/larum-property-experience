/* ── Larum — Migration 011 — LPE-10 columns missing from production ──
   ADDITIVE: only adds columns, no policy or table changes.

   LPE-10 (docs/LPE_10_REPORT.md, shipped 2026-08-17) made analytics.js
   dual-write four canonical-id fields on every sessions/analytics_events
   row: event_schema, experience_revision_id, module_id, family. The
   report's own "Deuda técnica" section flagged that the migration adding
   these columns to Supabase was never written — property_id already
   existed (migration 001), so it was the one field that worked, masking
   the gap.

   Effect in production: every session/event write from the visitor-facing
   property experience (analytics.js) has been failing outright with
   PostgREST error PGRST204 ("Could not find the 'event_schema' column of
   'sessions' in the schema cache") — not silently ignored, as the report
   assumed. This is not the RLS/upsert bug fixed alongside this migration
   (that one only blocked duration UPDATEs after the first write); this
   one blocks the write from ever reaching the table at all. Confirmed by
   reproducing the exact PGRST204 error live against this project
   (mtyemgfovvmjrsxevcgh) while testing the RLS fix.

   Agent-page analytics (agent-analytics.js, M4) never hit this: it
   deliberately writes a smaller row shape that never included these four
   fields, so it was unaffected either way.

   Column shapes match the report's documented design exactly:
     event_schema           — constant 1, written on every row (Decision A)
     experience_revision_id — UUID, null until a revision is published
     module_id               — TEXT, analytics_events only (sessions never
                                carried it — see report, "buildSessionRow()
                                writes the same minus module_id")
     family                  — TEXT, both tables

   No FK on experience_revision_id: migration 005 (which would create the
   experience_revisions table it might otherwise reference) was never
   applied either — confirmed live (42P01: relation "experience_revisions"
   does not exist). state.revisionId is null in production today regardless
   (LPE_10_REPORT.md, "Canonical IDs are null in production today"), so the
   column only needs to exist and accept a UUID later — no working code
   path depends on the FK constraint itself.
   ─────────────────────────────────────────────────────────────────── */

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS event_schema smallint,
  ADD COLUMN IF NOT EXISTS experience_revision_id uuid,
  ADD COLUMN IF NOT EXISTS family text;

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS event_schema smallint,
  ADD COLUMN IF NOT EXISTS experience_revision_id uuid,
  ADD COLUMN IF NOT EXISTS module_id text,
  ADD COLUMN IF NOT EXISTS family text;

CREATE INDEX IF NOT EXISTS idx_sessions_revision_id
  ON public.sessions(experience_revision_id);
CREATE INDEX IF NOT EXISTS idx_events_revision_id
  ON public.analytics_events(experience_revision_id);

-- ═══ VERIFY ═══════════════════════════════════════════════════════════
-- Expected: 4 rows for sessions (event_schema, experience_revision_id,
-- family, property_id already existed) and 5 rows for analytics_events
-- (adds module_id too).
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('sessions', 'analytics_events')
  AND column_name IN ('event_schema', 'experience_revision_id', 'module_id', 'family', 'property_id')
ORDER BY table_name, column_name;
