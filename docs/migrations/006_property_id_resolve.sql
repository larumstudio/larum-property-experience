/* ── Larum — Migration 006c — Auto-resolve property_id from slug ─────
   APPLIED TO PRODUCTION: 2026-08-19

   Context: Migration 006 policies (006_policies_prepared.sql) resolve
   organization ownership through property_id (UUID FK). The deployed
   code (M5.2, app.js line 708) writes `property` (TEXT slug) only,
   leaving property_id NULL. With NULL property_id, is_org_admin(NULL)
   returns FALSE and leads/sessions/events become invisible to the admin.

   Fix (3 parts):
     1. SECURITY DEFINER trigger that fills property_id from the slug
        on every INSERT/UPDATE where property_id is NULL.
     2. Attach trigger to leads, sessions, analytics_events.
     3. Backfill all existing rows.

   Safe to re-run. No policy changes. No schema changes.
   ─────────────────────────────────────────────────────────────────── */


-- ═══ 1. TRIGGER FUNCTION ═════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_property_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.property_id IS NULL AND NEW.property IS NOT NULL THEN
    SELECT p.id INTO NEW.property_id
    FROM public.properties p
    WHERE p.slug = NEW.property
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.resolve_property_id() FROM PUBLIC;


-- ═══ 2. ATTACH TO TABLES ════════════════════════════════════════════
DROP TRIGGER IF EXISTS resolve_property_id ON public.leads;
CREATE TRIGGER resolve_property_id
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.resolve_property_id();

DROP TRIGGER IF EXISTS resolve_property_id ON public.sessions;
CREATE TRIGGER resolve_property_id
  BEFORE INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.resolve_property_id();

DROP TRIGGER IF EXISTS resolve_property_id ON public.analytics_events;
CREATE TRIGGER resolve_property_id
  BEFORE INSERT OR UPDATE ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.resolve_property_id();


-- ═══ 3. BACKFILL EXISTING ROWS ══════════════════════════════════════
-- NOTE: When running the leads backfill, the protect_leads_boundary
-- trigger blocks property_id changes (because SQL Editor has no auth
-- session, so is_org_admin() returns FALSE). Temporarily disable it:
--
--   ALTER TABLE public.leads DISABLE TRIGGER protect_leads_boundary;
--   <run the UPDATE below>
--   ALTER TABLE public.leads ENABLE TRIGGER protect_leads_boundary;

UPDATE public.leads
SET property_id = (
  SELECT p.id FROM public.properties p WHERE p.slug = leads.property LIMIT 1
)
WHERE property_id IS NULL AND property IS NOT NULL;

UPDATE public.sessions
SET property_id = (
  SELECT p.id FROM public.properties p WHERE p.slug = sessions.property LIMIT 1
)
WHERE property_id IS NULL AND property IS NOT NULL;

UPDATE public.analytics_events
SET property_id = (
  SELECT p.id FROM public.properties p WHERE p.slug = analytics_events.property LIMIT 1
)
WHERE property_id IS NULL AND property IS NOT NULL;


-- ═══ 4. VERIFY ══════════════════════════════════════════════════════
SELECT 'leads' AS table_name, count(*) AS null_property_ids
FROM public.leads WHERE property_id IS NULL AND property IS NOT NULL
UNION ALL
SELECT 'sessions', count(*)
FROM public.sessions WHERE property_id IS NULL AND property IS NOT NULL
UNION ALL
SELECT 'analytics_events', count(*)
FROM public.analytics_events WHERE property_id IS NULL AND property IS NOT NULL;
