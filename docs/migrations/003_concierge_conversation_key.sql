-- ═══════════════════════════════════════════════════════════════════════
-- LARUM — PHASE 1 · MILESTONE 4
-- Natural key for concierge conversations.
--
--   Supabase → SQL Editor → New query → paste → Run.
--   Idempotent.
--
-- A concierge conversation belongs to one visitor session on one property,
-- always. Adding a unique constraint on that pair lets the server upsert
-- the conversation row without first querying for its id — one fewer
-- roundtrip on every question. It also makes double-insertion under a
-- burst impossible at the database level.
-- ═══════════════════════════════════════════════════════════════════════

-- The pair is meaningful only when both sides are present. A conversation
-- opened before session tracking (no session_id) or against a deleted
-- property (no slug) is legal but does not participate in the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_conversation_session_property
  ON public.concierge_conversations (session_id, property_slug)
  WHERE session_id IS NOT NULL AND property_slug IS NOT NULL;

-- Verify: one row.
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'concierge_conversations'
  AND indexname = 'uniq_conversation_session_property';
