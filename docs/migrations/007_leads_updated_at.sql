/* ── Larum — Migration 007 — leads.updated_at ──────────────────────────
   M6.5a — Optimistic Concurrency (leads, Option B).

   NOT YET APPLIED. Prepared for review. Requires manual run via
   Supabase → SQL Editor, same as every 006_* file in this directory —
   no automated execution channel exists in this environment.

   Test first against an ISOLATED Supabase project
   (tests/leads-updated-at.test.mjs, ISOLATED_SUPABASE_* env vars).
   Do NOT run this against production (mtyemgfovvmjrsxevcgh) until
   that suite passes and Jen/Simon explicitly authorize it.

   Context: `leads` is the only one of the 6 M6.5a write points that
   never had `updated_at` — verified against docs/supabase-schema.sql
   and every 001–006 migration touching `leads` (property_id, agent_id
   only). admin-core.js's updateLead() needs the same compare-and-swap
   mechanism admin-property-store.js's 5 functions use against
   `properties.updated_at` (already present since migration 001), so
   this migration gives `leads` the identical column + the exact same
   generic trigger function migration 001 already defined
   (public.touch_updated_at()) — no new function, no new logic, just
   attaching the existing one to one more table.

   Deliberately NOT part of this migration: the fuller M6.5c lead
   change history (who/when/field/old/new). That is a separate table
   and a separate migration — this one exists only so `updateLead()`
   is not left with a value-based (fragile, provisional) concurrency
   check that M6.5c would then have to replace.

   Safe to re-run (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP
   TRIGGER IF EXISTS). Does not touch RLS, does not touch any other
   table, does not touch app.js or any visitor-facing code — leads is
   never read by the public site, only inserted into (anon) and
   updated from Admin (authenticated).
   ─────────────────────────────────────────────────────────────────── */


-- ═══ 1. COLUMN ══════════════════════════════════════════════════════
-- DEFAULT now() means every existing row gets a real timestamp at the
-- moment this runs, not NULL — required for the NOT NULL constraint,
-- and correct semantically: "last known modification time" for a row
-- that predates this column is "whenever this migration ran", which is
-- the most truthful value available (we don't know its real prior
-- history, and DEFAULT now() avoids inventing one).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();


-- ═══ 2. TRIGGER — reuses public.touch_updated_at() from migration 001,
--        unchanged. Same pattern as touch_properties / touch_agents /
--        touch_organizations / touch_audits / touch_conversations. ═══
DROP TRIGGER IF EXISTS touch_leads ON public.leads;
CREATE TRIGGER touch_leads BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ═══ 3. VERIFY ══════════════════════════════════════════════════════
-- Column exists, is NOT NULL, has the expected default.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'updated_at';

-- Trigger exists, attached, enabled, BEFORE UPDATE (never INSERT — no
-- reason to touch it on insert, DEFAULT now() already covers that row).
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname = 'touch_leads';

-- Functional check: updating any one existing lead's `notes` should
-- bump `updated_at` to a value strictly greater than what it was.
-- Run manually against a real (or disposable) row, e.g.:
--   SELECT id, updated_at FROM public.leads LIMIT 1;
--   UPDATE public.leads SET notes = notes WHERE id = '<that id>';
--   SELECT id, updated_at FROM public.leads WHERE id = '<that id>';
-- Expected: updated_at strictly increased.


-- ═══ 4. ROLLBACK (only if this column/trigger must be removed
--        entirely — e.g. abandoning this approach before M6.5c ships).
--        Not recommended once any UI code depends on it (M6.5a's
--        updateLead() will, once deployed) — dropping the column out
--        from under deployed code breaks every lead save until the
--        code is rolled back too. Coordinate both together. ═══════════
-- DROP TRIGGER IF EXISTS touch_leads ON public.leads;
-- ALTER TABLE public.leads DROP COLUMN IF EXISTS updated_at;
