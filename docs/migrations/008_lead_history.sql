/* ── Larum — Migration 008 — lead_history ──────────────────────────────
   M6.5c — Lead Change History.

   NOT YET APPLIED. Prepared for review. Requires manual run via
   Supabase → SQL Editor, same as every other migration in this
   directory — no automated execution channel exists in this
   environment.

   Test first against the ISOLATED project (larum-auth-test,
   tests/lead-history.test.mjs, ISOLATED_SUPABASE_* env vars).
   Do NOT run this against production (mtyemgfovvmjrsxevcgh) until
   that suite passes and Jen/Simon explicitly authorize it.

   Design (M6.5c discovery report, approved as-is):
   - One row per FIELD changed, not per UPDATE statement — a save that
     changes both status and notes produces 2 rows, not 1.
   - Written exclusively by an AFTER UPDATE trigger on `leads`, never
     by application code. admin-core.js's updateLead() (M6.5a) needs
     ZERO changes: the history is a side effect of the same UPDATE
     statement it already runs, inside the same transaction — if the
     M6.5a compare-and-swap rejects the write (0 rows matched, a real
     conflict), this trigger never fires, so a rejected save can never
     produce a false history entry.
   - AFTER, not BEFORE: runs after touch_leads and protect_leads_
     boundary (both BEFORE UPDATE on leads) have already done their
     work, on the final committed NEW values — no shared-ordering
     concern with either of them.
   - IS DISTINCT FROM per field: a save that resends the same status/
     notes text produces zero rows for that field — no-op writes are
     not history.
   - changed_by uuid REFERENCES auth.users(id) — same precedent as
     memberships.user_id, not the older audits.performed_by free-text
     pattern (which predates auth.uid()/real agent identities).
   - Append-only from the outside: no INSERT/UPDATE/DELETE policy is
     granted to `authenticated` or `anon` at all. The trigger function
     is SECURITY DEFINER, same mechanism already proven safe in
     resolve_lead_agent_id() (006_lead_agent_id_resolve.sql) — it
     writes regardless of RLS because it runs as the function owner,
     not because a policy allows it.
   ─────────────────────────────────────────────────────────────────── */


-- ═══ 1. TABLE ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lead_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  field      text NOT NULL CHECK (field IN ('status', 'notes')),
  old_value  text,
  new_value  text
);

CREATE INDEX IF NOT EXISTS idx_lead_history_lead ON public.lead_history(lead_id, changed_at DESC);

ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;


-- ═══ 2. TRIGGER FUNCTION ════════════════════════════════════════════
-- SECURITY DEFINER so it can write to lead_history despite RLS being
-- enabled on it and NO insert policy existing for any role — the
-- function's owner privileges are what make the write possible, not a
-- policy grant. Exactly the same mechanism as resolve_lead_agent_id().
CREATE OR REPLACE FUNCTION public.log_lead_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.lead_history (lead_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status', OLD.status, NEW.status);
  END IF;

  IF OLD.notes IS DISTINCT FROM NEW.notes THEN
    INSERT INTO public.lead_history (lead_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'notes', OLD.notes, NEW.notes);
  END IF;

  RETURN NULL; -- AFTER trigger — return value is ignored either way
END $$;

REVOKE ALL ON FUNCTION public.log_lead_changes() FROM PUBLIC;


-- ═══ 3. ATTACH TO leads (AFTER UPDATE) ═══════════════════════════════
DROP TRIGGER IF EXISTS log_lead_changes ON public.leads;
CREATE TRIGGER log_lead_changes
  AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_changes();


-- ═══ 4. RLS — read-only, mirrors leads' own admin/agent scoping via
--        a join, rather than duplicating organization_id/agent_id
--        onto this table (avoids drift if a lead is reassigned later).
--        No INSERT/UPDATE/DELETE policy for authenticated or anon —
--        that omission IS the append-only guarantee. ══════════════════
CREATE POLICY "lead_history admin reads own org" ON public.lead_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.properties p ON p.id = l.property_id
    WHERE l.id = lead_history.lead_id
      AND public.is_org_admin(p.organization_id)
  ));

CREATE POLICY "lead_history agent reads own leads" ON public.lead_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_history.lead_id
      AND l.agent_id = public.current_agent_id()
  ));


-- ═══ 5. VERIFY ══════════════════════════════════════════════════════
-- Table + RLS enabled.
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'lead_history';

-- Trigger exists, AFTER UPDATE, enabled.
SELECT tgname, tgrelid::regclass, tgenabled, tgtype
FROM pg_trigger
WHERE tgname = 'log_lead_changes';

-- Function exists, SECURITY DEFINER.
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'log_lead_changes';

-- Exactly 2 SELECT policies, zero INSERT/UPDATE/DELETE policies —
-- confirms the append-only surface has no write path other than the
-- trigger.
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'lead_history'
ORDER BY policyname;


-- ═══ 6. ROLLBACK (only if this table/trigger must be removed
--        entirely). Not recommended once any UI code reads from it —
--        none does yet as of M6.5c, so this is safe to run standalone
--        for now. Order: trigger before function (function is its
--        target), table last (policies drop with it automatically). ═
-- DROP TRIGGER IF EXISTS log_lead_changes ON public.leads;
-- DROP FUNCTION IF EXISTS public.log_lead_changes();
-- DROP TABLE IF EXISTS public.lead_history;
