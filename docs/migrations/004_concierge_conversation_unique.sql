-- ═══════════════════════════════════════════════════════════════════════
-- LARUM — PHASE 1 · MILESTONE 4 · fix
-- Replace the partial UNIQUE index with a plain one PostgREST can use.
--
--   Supabase → SQL Editor → New query → paste → Run.
--   Transactional. Idempotent. Aborts loudly if duplicates exist.
--
-- Why this exists
-- ────────────────
-- Migration 003 created uniq_conversation_session_property as a partial
-- index (WHERE session_id IS NOT NULL AND property_slug IS NOT NULL).
-- PostgREST generates INSERT … ON CONFLICT (session_id, property_slug)
-- without that predicate, and Postgres will not infer a partial unique
-- index for an ON CONFLICT target unless the query includes the same
-- predicate. Result: every upsert from the concierge failed with
-- 42P10 ("no unique or exclusion constraint matching"), and persistTurn
-- (which swallows errors) silently wrote nothing.
--
-- The fix is a plain UNIQUE index on the same columns. NULL behavior is
-- preserved: under Postgres' default NULLS-DISTINCT semantics, two rows
-- whose session_id or property_slug is NULL do not conflict, so the
-- intent of the 003 predicate — "the pair is meaningful only when both
-- sides are present" — carries over unchanged.
--
-- Safety
-- ──────
-- Everything runs inside an explicit BEGIN/COMMIT. The duplicate check
-- lives inside a plpgsql DO block that RAISEs on the first offending
-- pair — that aborts the transaction before any DROP touches the
-- current index, so a run against duplicate data leaves the database
-- exactly as it was before the migration started.
--
-- Idempotent: if the plain unique index already exists (indexdef
-- without a WHERE clause), the DO block returns early and neither the
-- DROP nor the CREATE runs. The migration is safe to execute again.
--
-- Scope: touches exactly one index. No tables, columns, constraints,
-- RLS policies, triggers, functions or data are modified.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_duplicates  integer;
  v_current_def text;
BEGIN
  -- ── 1. Blocking duplicate check ─────────────────────────────────────
  -- Any duplicate pair means the plain UNIQUE index cannot be built.
  -- RAISE EXCEPTION aborts the whole transaction, so the DROP below is
  -- never reached and the database keeps whatever unique protection (or
  -- lack thereof) it currently has.
  SELECT count(*) INTO v_duplicates FROM (
    SELECT 1
    FROM public.concierge_conversations
    WHERE session_id IS NOT NULL AND property_slug IS NOT NULL
    GROUP BY session_id, property_slug
    HAVING count(*) > 1
  ) dup;

  IF v_duplicates > 0 THEN
    RAISE EXCEPTION
      'Migration 004 aborted: % duplicate (session_id, property_slug) pair(s) present in concierge_conversations. Resolve them before re-running.',
      v_duplicates;
  END IF;

  -- ── 2. Skip if the correct index already exists ─────────────────────
  -- Postgres formats indexdef in upper case, but upper() future-proofs
  -- the check. The partial index from 003 contains " WHERE "; a plain
  -- UNIQUE index does not. Absence of that token = migration already
  -- applied, exit before touching anything.
  SELECT indexdef INTO v_current_def
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename  = 'concierge_conversations'
    AND indexname  = 'uniq_conversation_session_property';

  IF v_current_def IS NOT NULL
     AND position(' WHERE ' IN upper(v_current_def)) = 0 THEN
    RAISE NOTICE 'Migration 004: correct index already present, nothing to do.';
    RETURN;
  END IF;

  -- ── 3. Replace: drop the (partial) old index, create the plain one ──
  -- DROP IF EXISTS makes step 3 tolerant of the "index missing entirely"
  -- case (e.g. someone ran DROP by hand). CREATE without IF NOT EXISTS
  -- is deliberate: if step 2 did not short-circuit, we KNOW the plain
  -- index is not present, and a silent no-op here would hide a bug.
  DROP INDEX IF EXISTS public.uniq_conversation_session_property;

  CREATE UNIQUE INDEX uniq_conversation_session_property
    ON public.concierge_conversations (session_id, property_slug);
END $$;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────
-- 4 · Verify (informational; runs after the transaction commits).
--
-- Expected: exactly one row. `indexdef` must NOT contain the word
-- "WHERE" — that would mean the old partial definition is still there.
-- ─────────────────────────────────────────────────────────────────────
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'concierge_conversations'
  AND indexname  = 'uniq_conversation_session_property';
