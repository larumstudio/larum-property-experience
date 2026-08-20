/* ── Larum — Migration 006d — Auto-resolve leads.agent_id from slug ───
   M6.0 — Lead Ownership (Larum Admin M6 Master Spec, section J).

   NOT YET APPLIED. Prepared for review. Requires manual run via
   Supabase → SQL Editor, same as every other 006_* file in this
   directory — no automated execution channel exists in this
   environment.

   Context: leads.agent_id (Migration 006, 006_authorization_foundation.sql
   §3) exists so RLS can scope an agent's own leads via
   `agent_id = current_agent_id()`. Nothing has ever written it — the
   column has been NULL for every lead since it was added. Left
   unresolved, the day an agent can log in (M6.2) they open Leads and
   see nothing, even though leads for their own properties exist.

   This migration closes that gap using the EXACT pattern already
   proven safe in production by 006_property_id_resolve.sql
   (006c) — a SECURITY DEFINER trigger that fills the column from the
   `property` slug already present on every insert — with two
   deliberate differences from that file, both explained inline where
   they occur:

     1. BEFORE INSERT only, never UPDATE.
     2. Resolves directly from NEW.property (the slug), never from
        NEW.property_id — independent of trigger firing order.

   Safe to re-run. No policy changes. No schema changes. Does not
   touch app.js or any other browser-facing code — the visitor's
   browser never learns which agent owns a property; the resolution
   happens entirely server-side, in Postgres, after the row lands.
   ─────────────────────────────────────────────────────────────────── */


-- ═══ 1. TRIGGER FUNCTION ═════════════════════════════════════════════
--
-- Fires BEFORE INSERT only — not BEFORE UPDATE, unlike
-- resolve_property_id() in 006c. Two independent reasons, both
-- required, either alone would be enough:
--
--   a) Product intent, already on record: the comment in
--      006_authorization_foundation.sql §3 calls leads.agent_id "a
--      point-in-time fact, not a live derivation". Resolving on
--      UPDATE too would make it a live derivation — exactly what
--      that comment says it must not be.
--
--   b) Trigger collision: protect_leads_boundary (already in
--      production, BEFORE UPDATE ON leads) raises an exception if
--      NEW.agent_id IS DISTINCT FROM OLD.agent_id and the caller is
--      not an org admin. An agent saving a note on their own lead —
--      a normal, allowed action — would trip that exception the
--      moment this trigger tried to backfill agent_id during that
--      same UPDATE. BEFORE INSERT ONLY avoids the collision at the
--      root: this trigger and protect_leads_boundary never fire on
--      the same statement.
--
-- Resolves directly from NEW.property (the slug), not from
-- NEW.property_id. Reason: Postgres fires multiple BEFORE INSERT
-- triggers on the same table in alphabetical order of trigger name.
-- 'resolve_lead_agent_id' sorts before 'resolve_property_id'
-- alphabetically, so if this function read NEW.property_id it could
-- run BEFORE resolve_property_id() has filled it in, and see NULL.
-- Reading NEW.property (the slug both triggers key off) instead means
-- neither trigger depends on the other's execution order — each
-- resolves its own column from the same source field, independently.
CREATE OR REPLACE FUNCTION public.resolve_lead_agent_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.agent_id IS NULL AND NEW.property IS NOT NULL THEN
    SELECT p.agent_id INTO NEW.agent_id
    FROM public.properties p
    WHERE p.slug = NEW.property
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.resolve_lead_agent_id() FROM PUBLIC;


-- ═══ 2. ATTACH TO leads (INSERT only) ════════════════════════════════
DROP TRIGGER IF EXISTS resolve_lead_agent_id ON public.leads;
CREATE TRIGGER resolve_lead_agent_id
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.resolve_lead_agent_id();


-- ═══ 3. BACKFILL EXISTING ROWS ══════════════════════════════════════
-- Same procedure as 006c's leads backfill, same reason: the SQL
-- Editor session has no auth.uid(), so is_org_admin() returns FALSE
-- and protect_leads_boundary would block this UPDATE (it changes
-- agent_id) unless the trigger is disabled for the duration.
--
-- Only fills rows where agent_id IS NULL AND the property is both
-- known and has an agent assigned — a lead for an unassigned property,
-- or a property slug that no longer matches any row, correctly stays
-- NULL rather than being forced to some default.

ALTER TABLE public.leads DISABLE TRIGGER protect_leads_boundary;

UPDATE public.leads
SET agent_id = (
  SELECT p.agent_id FROM public.properties p WHERE p.slug = leads.property LIMIT 1
)
WHERE agent_id IS NULL AND property IS NOT NULL;

ALTER TABLE public.leads ENABLE TRIGGER protect_leads_boundary;


-- ═══ 4. VERIFY ══════════════════════════════════════════════════════
-- Row-by-row detail: which leads still have no agent_id, and why
-- (no property match at all vs. property matched but has no agent
-- assigned — both are legitimate NULL outcomes, not failures).
SELECT
  l.id,
  l.property,
  l.property_id,
  l.agent_id,
  p.id   AS matched_property_id,
  p.agent_id AS property_agent_id,
  CASE
    WHEN p.id IS NULL THEN 'no matching property'
    WHEN p.agent_id IS NULL THEN 'property has no agent assigned'
    ELSE 'unexpected — investigate'
  END AS still_null_reason
FROM public.leads l
LEFT JOIN public.properties p ON p.slug = l.property
WHERE l.agent_id IS NULL AND l.property IS NOT NULL
ORDER BY l.created_at DESC;

-- Trigger + function existence check.
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname = 'resolve_lead_agent_id';

SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'resolve_lead_agent_id';

-- Expected: 1 trigger (BEFORE INSERT, enabled) on leads, 1 SECURITY
-- DEFINER function. Zero rows from the detail query mean every lead
-- with a known property now has agent_id set OR that property
-- genuinely has no agent — both correct, not a failure state.
