/* ── Larum — Migration 010 — Agent Page Analytics Visibility ────
   ADDITIVE: does not modify any existing policy.

   Agent page analytics write sessions/events with
   property = 'agent:{slug}'. Because the slug is not a property
   slug, the resolve_property_id trigger leaves property_id NULL,
   and the existing org-scoped SELECT policies
   (is_org_admin(property_id)) return FALSE for those rows.

   These two new PERMISSIVE SELECT policies let the admin see
   agent-page analytics by resolving the agent slug back to its
   organization. Postgres OR-combines PERMISSIVE policies, so the
   existing org-scoped property policies are unaffected.
   ────────────────────────────────────────────────────────────── */

CREATE POLICY "sessions admin reads agent pages"
  ON public.sessions
  FOR SELECT TO authenticated
  USING (
    property LIKE 'agent:%'
    AND public.is_org_admin((
      SELECT a.organization_id
      FROM public.agents a
      WHERE a.slug = substr(sessions.property, 7)
    ))
  );

CREATE POLICY "events admin reads agent pages"
  ON public.analytics_events
  FOR SELECT TO authenticated
  USING (
    property LIKE 'agent:%'
    AND public.is_org_admin((
      SELECT a.organization_id
      FROM public.agents a
      WHERE a.slug = substr(analytics_events.property, 7)
    ))
  );
