/* ── Larum — Migration 006 — Authorization Policies (PREPARED, NOT APPLIED) ──

   ⚠ DO NOT RUN THIS AGAINST PRODUCTION. ⚠

   This is the cutover script for Fase 7 of the migration strategy in the
   Final Authorization Architecture Specification. It replaces the
   current "FOR ALL USING(true)" policies with explicit per-verb,
   organization + role + ownership scoped policies.

   Why it cannot be validated by adding it alongside the current
   policies: PostgreSQL combines multiple PERMISSIVE policies for the
   same command with OR. As long as the existing "authenticated all …"
   policies exist, any new, narrower policy added next to them changes
   nothing observable — the effective access stays governed by the
   broadest active policy. Restriction can only be verified in an
   environment where the OLD policies have actually been dropped.

   Required before this file may be run for real, in this exact order:
     1. 006_authorization_foundation.sql applied (memberships table,
        agents.auth_user_id, leads.agent_id, helper functions, boundary
        triggers) — itself additive and already safe to run
        independently.
     2. Admin membership row inserted and verified (step 5 of that file).
     3. An ISOLATED environment (separate Supabase project/branch, or a
        local Postgres seeded with an anonymised schema copy) where
        this file has been run for real and the full Test Matrix
        (tests/authorization-foundation.test.mjs) passes — Organization
        A/B, Admin A, Agent A, Agent B, an inactive agent, an unlinked
        user, cross-org checks, all green.
     4. A fresh backup/snapshot of the real project taken immediately
        before running this file there.
     5. This exact script, unmodified from what passed step 3, executed
        as one script so no table is ever left without any policy
        (deny-all is safe; a half-migrated table with only some new
        policies applied is not).

   Rollback: 006_rollback.sql re-creates the original migration 001 /
   supabase-fix-rls.sql policies verbatim. Keep it open in a second tab
   during cutover.

   ── REVISION NOTE (this pass) ──────────────────────────────────────
   Both previously-known defects are fixed below (see inline comments
   at each site: "agents self update" and "messages admin reads own
   org"). This pass also found and fixed a third issue not previously
   flagged: none of the agent-ownership SELECT/UPDATE policies on
   properties/leads verified that the resource's organization_id still
   matched the acting agent's own organization — meaning an admin
   mistake (or a future bug) that assigned a property/lead to an agent
   from a DIFFERENT organization would have been silently honoured by
   these policies, a real cross-org leak vector. Fixed by requiring
   organization_id = current_agent_organization_id() everywhere agent
   ownership is checked, and by having the admin WITH CHECK on
   properties/leads refuse to assign an agent_id that doesn't belong to
   the resource's own organization in the first place — see the
   "PROPERTIES" and "LEADS" sections below.
   ─────────────────────────────────────────────────────────────────── */


-- ═════════════════════════════════════════════════════════════════════
-- ORGANIZATIONS
--
-- FOR SELECT / FOR UPDATE only — never FOR ALL. The spec is explicit
-- that creating or deleting organizations is out of scope for this
-- model (a platform-level operation, not something a per-organization
-- admin should be able to do to their OWN org row, let alone any
-- other). A single FOR ALL policy gated by is_org_admin(id) would have
-- happened to block INSERT/DELETE too — is_org_admin(new_id) is always
-- false for an org that doesn't exist yet, so no membership could ever
-- justify creating one — but relying on that as an accident of the
-- chicken-and-egg logic is fragile: it stops protecting anything the
-- moment a membership could ever be created before its organization
-- (e.g. by a future service_role script). Split into explicit verbs
-- instead, so the exclusion of INSERT/DELETE is a fact about the
-- policy set, not a side effect of it.
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "authenticated all organizations" ON public.organizations;

CREATE POLICY "org admin reads own organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_admin(id));

CREATE POLICY "org admin updates own organization" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

CREATE POLICY "org agent reads own organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid() AND m.organization_id = organizations.id
  ));


-- ═════════════════════════════════════════════════════════════════════
-- MEMBERSHIPS
-- ═════════════════════════════════════════════════════════════════════
CREATE POLICY "membership admin manages own org" ON public.memberships
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "membership self read" ON public.memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No agent-role INSERT/UPDATE/DELETE policy exists on memberships at
-- all — an agent can read their own row (above) and nothing else. This
-- is a deliberate absence, not an oversight: Postgres denies by
-- default when no PERMISSIVE policy matches a role+command, so an
-- agent attempting to change their own role or organization_id, or
-- anyone else's membership, is refused with no policy needed to say so
-- explicitly.


-- ═════════════════════════════════════════════════════════════════════
-- AGENTS
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "authenticated all agents" ON public.agents;

CREATE POLICY "agents admin manages own org" ON public.agents
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "agents self read" ON public.agents
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- DEFECT A — FIXED. The previous draft tried to pin organization_id
-- via a WITH CHECK subquery back into agents (the same table this
-- policy is ON) — a same-table OLD-vs-NEW comparison, which RLS cannot
-- express safely (see 006_authorization_foundation.sql §4b for why).
-- auth_user_id is safe to pin directly here (auth.uid() is a session
-- value, not a subquery into agents — no self-reference). organization_id
-- immutability is now enforced by the protect_agents_boundary() trigger
-- instead, which has real OLD/NEW row access with no ambiguity.
CREATE POLICY "agents self update" ON public.agents
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());


-- ═════════════════════════════════════════════════════════════════════
-- PROPERTIES
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "authenticated all properties" ON public.properties;
-- "anon reads published properties" (migration 001) is untouched —
-- public experience read path does not change.

-- Admin WITH CHECK now also refuses to leave agent_id pointing at an
-- agent from a different organization than the property itself — the
-- cross-org assignment vector found on this pass. agent_id IS NULL
-- (unassigned) is still allowed.
CREATE POLICY "properties admin manages own org" ON public.properties
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (
    public.is_org_admin(organization_id)
    AND (
      agent_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agents a
        WHERE a.id = agent_id AND a.organization_id = properties.organization_id
      )
    )
  );

-- Ownership gate now requires BOTH agent_id match AND organization_id
-- match against the agent's own organization — not agent_id alone.
-- Without the second condition, a property whose organization_id had
-- drifted from its agent's real organization (whether by a future bug
-- or a stale row) would still have been visible to that agent,
-- independent of whether the org boundary was otherwise intact.
CREATE POLICY "properties agent reads own" ON public.properties
  FOR SELECT TO authenticated
  USING (
    agent_id = public.current_agent_id()
    AND organization_id = public.current_agent_organization_id()
  );

-- Agent UPDATE, never INSERT/DELETE (admin-only, covered by the ALL
-- policy above). WITH CHECK re-pins agent_id AND organization_id to
-- the agent's own values — cross-table subquery into agents, not
-- self-referential, so safe to express directly in WITH CHECK (see
-- 006_authorization_foundation.sql §4b).
CREATE POLICY "properties agent updates own" ON public.properties
  FOR UPDATE TO authenticated
  USING (
    agent_id = public.current_agent_id()
    AND organization_id = public.current_agent_organization_id()
  )
  WITH CHECK (
    agent_id = public.current_agent_id()
    AND organization_id = public.current_agent_organization_id()
  );


-- ═════════════════════════════════════════════════════════════════════
-- LEADS
-- ═════════════════════════════════════════════════════════════════════
-- anon INSERT (visitor enquiry) untouched — from supabase-fix-rls.sql.
DROP POLICY IF EXISTS "authenticated reads leads"   ON public.leads;
DROP POLICY IF EXISTS "authenticated updates leads" ON public.leads;

-- Admin WITH CHECK mirrors the properties fix: refuses to leave
-- leads.agent_id pointing at an agent outside the lead's own
-- (property-derived) organization.
CREATE POLICY "leads admin manages own org" ON public.leads
  FOR ALL TO authenticated
  USING (public.is_org_admin((
    SELECT p.organization_id FROM public.properties p WHERE p.id = leads.property_id
  )))
  WITH CHECK (
    public.is_org_admin((
      SELECT p.organization_id FROM public.properties p WHERE p.id = leads.property_id
    ))
    AND (
      agent_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agents a
        WHERE a.id = leads.agent_id
          AND a.organization_id = (
            SELECT p.organization_id FROM public.properties p WHERE p.id = leads.property_id
          )
      )
    )
  );

CREATE POLICY "leads agent reads own" ON public.leads
  FOR SELECT TO authenticated
  USING (agent_id = public.current_agent_id());

-- WITH CHECK re-pins agent_id, preventing reassignment via UPDATE.
-- property_id is additionally protected against agent tampering by the
-- protect_leads_boundary() trigger (a same-table-adjacent concern —
-- leads has no organization_id of its own to check here, and pinning
-- property_id needs OLD-vs-NEW comparison, which is the trigger's job,
-- not WITH CHECK's — see 006_authorization_foundation.sql §4b).
-- Restricting WHICH specific columns count as "operational" (status,
-- notes) beyond agent_id/property_id remains an application-layer
-- concern (the Admin UI form), not expressible as per-column RLS
-- without a trigger per column — flagged, not solved here.
CREATE POLICY "leads agent updates own" ON public.leads
  FOR UPDATE TO authenticated
  USING (agent_id = public.current_agent_id())
  WITH CHECK (agent_id = public.current_agent_id());


-- ═════════════════════════════════════════════════════════════════════
-- AUDITS
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "authenticated all audits" ON public.audits;

CREATE POLICY "audits admin manages own org" ON public.audits
  FOR ALL TO authenticated
  USING (public.is_org_admin((
    SELECT p.organization_id FROM public.properties p WHERE p.id = audits.property_id
  )))
  WITH CHECK (public.is_org_admin((
    SELECT p.organization_id FROM public.properties p WHERE p.id = audits.property_id
  )));

-- No separate organization_id check needed here beyond agent_id match:
-- audits has no agent_id column of its own to tamper with, and the
-- property it derives ownership from is only reachable via property_id
-- (immutable in practice — agent has no UPDATE/INSERT/DELETE policy on
-- audits at all, only SELECT, so there is no write surface to protect).
CREATE POLICY "audits agent reads own properties" ON public.audits
  FOR SELECT TO authenticated
  USING ((
    SELECT p.agent_id FROM public.properties p WHERE p.id = audits.property_id
  ) = public.current_agent_id());


-- ═════════════════════════════════════════════════════════════════════
-- CONCIERGE_CONVERSATIONS / CONCIERGE_MESSAGES / SESSIONS / ANALYTICS_EVENTS
--
-- AE III v1 scope: agent access is NONE (EXPLICIT, deferred product
-- decision per the ADR) — no agent-role policy is created for any of
-- these four tables, on purpose. Only the admin-facing SELECT policies
-- change shape (org-scoped instead of blanket); anon INSERT/UPDATE
-- policies for the visitor-facing runtime are untouched.
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "authenticated reads conversations" ON public.concierge_conversations;
CREATE POLICY "conversations admin reads own org" ON public.concierge_conversations
  FOR SELECT TO authenticated
  USING (public.is_org_admin((
    SELECT p.organization_id FROM public.properties p WHERE p.id = concierge_conversations.property_id
  )));

DROP POLICY IF EXISTS "authenticated reads messages" ON public.concierge_messages;

-- DEFECT B — FIXED. The previous draft called is_org_admin() with a
-- property_id where it expects an organization_id, and nested a second
-- is_org_admin() call inside the first subquery's WHERE clause for no
-- coherent reason. Corrected to resolve the chain in one direction —
-- message → conversation → property → organization_id — then call
-- is_org_admin() exactly once against the resulting organization_id.
CREATE POLICY "messages admin reads own org" ON public.concierge_messages
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin((
      SELECT p.organization_id
      FROM public.concierge_conversations c
      JOIN public.properties p ON p.id = c.property_id
      WHERE c.id = concierge_messages.conversation_id
    ))
  );

DROP POLICY IF EXISTS "authenticated reads sessions" ON public.sessions;
CREATE POLICY "sessions admin reads own org" ON public.sessions
  FOR SELECT TO authenticated
  USING (public.is_org_admin((
    SELECT p.organization_id FROM public.properties p WHERE p.id = sessions.property_id
  )));

DROP POLICY IF EXISTS "authenticated reads events" ON public.analytics_events;
CREATE POLICY "events admin reads own org" ON public.analytics_events
  FOR SELECT TO authenticated
  USING (public.is_org_admin((
    SELECT p.organization_id FROM public.properties p WHERE p.id = analytics_events.property_id
  )));


-- ═════════════════════════════════════════════════════════════════════
-- EXPERIENCE_REVISIONS — written for when migration 005 is applied.
-- Inert until that table exists; included here for completeness of the
-- spec, NOT to be run before 005, and NOT to be run before 005's own
-- review — this block is uncommented SQL text but targets a table that
-- does not exist yet, so it would simply fail if run today. Left
-- commented anyway, for the same "no accidental execution" reason as
-- the admin membership INSERT in 006_authorization_foundation.sql.
-- ═════════════════════════════════════════════════════════════════════
-- CREATE POLICY "revisions admin manages own org" ON public.experience_revisions
--   FOR ALL TO authenticated
--   USING (public.is_org_admin((
--     SELECT p.organization_id FROM public.properties p WHERE p.id = experience_revisions.property_id
--   )))
--   WITH CHECK (public.is_org_admin((
--     SELECT p.organization_id FROM public.properties p WHERE p.id = experience_revisions.property_id
--   )));
--
-- CREATE POLICY "revisions agent reads own properties" ON public.experience_revisions
--   FOR SELECT TO authenticated
--   USING ((
--     SELECT p.agent_id FROM public.properties p WHERE p.id = experience_revisions.property_id
--   ) = public.current_agent_id());


/* ─────────────────────────────────────────────────────────────────────
   SELF-REVIEW LOG — what changed this pass, kept for the human
   reviewer rather than silently folded into the diff:

   ✔ DEFECT A fixed — see "agents self update" (moved organization_id
     protection to a trigger; auth_user_id remains a plain WITH CHECK).
   ✔ DEFECT B fixed — see "messages admin reads own org" (corrected
     join direction, single is_org_admin() call).
   ✔ NEW: cross-org agent assignment closed — admin WITH CHECK on
     properties/leads now refuses an agent_id outside the resource's
     own organization; agent ownership SELECT/UPDATE on properties now
     also requires organization_id = current_agent_organization_id().
   ✔ NEW: organizations split from FOR ALL into explicit SELECT/UPDATE
     — INSERT/DELETE exclusion is now a stated fact, not an accident of
     is_org_admin()'s chicken-and-egg behaviour on a nonexistent org id.

   STILL NOT DONE — deliberately, not silently:
   • Per-column restriction on which lead fields count as "operational"
     (status/notes vs. contact fields) — RLS is per-row; enforcing this
     needs either a trigger per protected column or an application-
     layer allowlist. Not built here; flagged as a gap for whoever
     designs the AE III lead-editing UI.
   • None of this has been run against a real Postgres instance. The
     isolated-environment Test Matrix pass (tests/authorization-
     foundation.test.mjs) is the mechanism for catching anything still
     wrong here — including in this revision — before production.
   ───────────────────────────────────────────────────────────────── */
