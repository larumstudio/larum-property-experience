/* ── Larum — Migration 006 — Rollback ──────────────────────────────────
   Two independent rollback paths. Run only the one that matches what
   was actually applied — do not run schema rollback reflexively if
   only the policy cutover needs reverting.

   NOT APPLIED — nothing to roll back yet. Kept ready per the migration
   strategy's requirement that rollback SQL exist and be rehearsed
   BEFORE cutover, not written under pressure after.
   ─────────────────────────────────────────────────────────────────── */


-- ═════════════════════════════════════════════════════════════════════
-- A · POLICY ROLLBACK (priority 1 — cheap, reversible in seconds)
--
--   Restores the exact policies from migration 001 and
--   docs/supabase-fix-rls.sql, verbatim. Run this if 006_policies_
--   prepared.sql was applied and something needs to revert immediately.
-- ═════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "org admin reads own organization"   ON public.organizations;
DROP POLICY IF EXISTS "org admin updates own organization" ON public.organizations;
DROP POLICY IF EXISTS "org agent reads own organization"    ON public.organizations;
CREATE POLICY "authenticated all organizations" ON public.organizations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "membership admin manages own org" ON public.memberships;
DROP POLICY IF EXISTS "membership self read"              ON public.memberships;
-- No original policy existed for memberships (new table) — rollback
-- here means "no policies", i.e. deny-all to authenticated/anon, which
-- is safe and does not affect any pre-existing flow.

DROP POLICY IF EXISTS "agents admin manages own org" ON public.agents;
DROP POLICY IF EXISTS "agents self read"              ON public.agents;
DROP POLICY IF EXISTS "agents self update"            ON public.agents;
CREATE POLICY "authenticated all agents" ON public.agents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "properties admin manages own org" ON public.properties;
DROP POLICY IF EXISTS "properties agent reads own"        ON public.properties;
DROP POLICY IF EXISTS "properties agent updates own"      ON public.properties;
CREATE POLICY "authenticated all properties" ON public.properties
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "leads admin manages own org" ON public.leads;
DROP POLICY IF EXISTS "leads agent reads own"        ON public.leads;
DROP POLICY IF EXISTS "leads agent updates own"      ON public.leads;
CREATE POLICY "authenticated reads leads"   ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated updates leads" ON public.leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "audits admin manages own org"       ON public.audits;
DROP POLICY IF EXISTS "audits agent reads own properties"  ON public.audits;
CREATE POLICY "authenticated all audits" ON public.audits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "conversations admin reads own org" ON public.concierge_conversations;
CREATE POLICY "authenticated reads conversations" ON public.concierge_conversations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "messages admin reads own org" ON public.concierge_messages;
CREATE POLICY "authenticated reads messages" ON public.concierge_messages
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sessions admin reads own org" ON public.sessions;
CREATE POLICY "authenticated reads sessions" ON public.sessions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "events admin reads own org" ON public.analytics_events;
CREATE POLICY "authenticated reads events" ON public.analytics_events
  FOR SELECT TO authenticated USING (true);

-- Verify: effective access for the admin account should be identical
-- to pre-cutover behaviour immediately after running this block.


-- ═════════════════════════════════════════════════════════════════════
-- B · SCHEMA ROLLBACK (LAST RESORT — only if columns/table must be
--     removed entirely, e.g. abandoning this approach). NOT recommended
--     to run reflexively alongside a policy rollback (A, above):
--     dropping these destroys any real onboarding progress (linked
--     auth_user_id values, membership rows, lead snapshots) that may
--     already exist. Confirm no real data depends on them before
--     running. Ordered to respect dependencies — triggers before their
--     functions, functions before the columns/table they reference,
--     leads before agents before memberships (leads.agent_id
--     references agents; nothing references memberships from the other
--     new objects, so it drops last).
-- ═════════════════════════════════════════════════════════════════════

-- 1 · Triggers first — they reference the functions below and must be
--     gone before the functions can be dropped.
-- DROP TRIGGER IF EXISTS protect_leads_boundary  ON public.leads;
-- DROP TRIGGER IF EXISTS protect_agents_boundary ON public.agents;

-- 2 · Trigger functions.
-- DROP FUNCTION IF EXISTS public.protect_leads_boundary();
-- DROP FUNCTION IF EXISTS public.protect_agents_boundary();

-- 3 · Helper functions — current_agent_organization_id() calls
--     current_agent_id(), so it must drop first if dropping both.
-- DROP FUNCTION IF EXISTS public.current_agent_organization_id();
-- DROP FUNCTION IF EXISTS public.current_agent_id();
-- DROP FUNCTION IF EXISTS public.current_membership(uuid);
-- DROP FUNCTION IF EXISTS public.is_org_admin(uuid);

-- 4 · Columns — leads.agent_id references agents(id), no ordering
--     constraint against agents itself, but drop before considering
--     agents.auth_user_id purely for symmetry with the dependency
--     direction above.
-- ALTER TABLE public.leads  DROP COLUMN IF EXISTS agent_id;
-- ALTER TABLE public.agents DROP COLUMN IF EXISTS auth_user_id;

-- 5 · memberships last — nothing else created by 006_authorization_
--     foundation.sql depends on it at the schema level (the helper
--     functions reference it by name inside function bodies, not via a
--     FK, so function-before-table ordering above is about avoiding
--     "function body refers to a dropped column/table" errors, not a
--     hard FK constraint).
-- DROP TABLE IF EXISTS public.memberships;
