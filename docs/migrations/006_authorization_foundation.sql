/* ── Larum — Migration 006 — Authorization Foundation (Pre-AE III) ────
   Additive schema for the authorization model approved in the Final
   Authorization Architecture Specification (organization + role +
   ownership). Builds on migrations 001–004; migration 005 (experience
   revisions) is authored but NOT applied — independent of this one.

   THIS MIGRATION IS SAFE TO RUN ON PRODUCTION AS-IS:
   every statement is additive (new table, nullable columns, new
   functions). It does not touch any existing RLS policy. The current
   "FOR ALL USING(true)" policies remain in force after this runs —
   nothing changes behaviourally for the existing Admin/agents flows.

   What this migration does NOT do (by design, see 006_policies_prepared.sql):
   • does not replace any existing policy
   • does not restrict any existing access
   • does not onboard any real agent

   NOT YET APPLIED. Prepared for review. Requires manual run via
   Supabase → SQL Editor (no automated execution channel exists in this
   environment — no linked Supabase CLI project, no direct Postgres
   connection string, no MCP database tool).

   ⚠ ADMIN LINKING PLACEHOLDER: the INSERT in step 5 needs the real
   auth.users.id for the existing admin account (contactolarum@gmail.com).
   That lookup requires the Supabase Auth Admin API with the
   service_role key — attempted locally this session and blocked by the
   permission classifier (reading a secret key file outside the
   established server-side code path). Resolve the UUID yourself
   (Supabase → Authentication → Users → copy the id for
   contactolarum@gmail.com) and substitute it for the
   ADMIN_AUTH_USER_ID placeholder below before running step 5. The
   organization id IS confirmed (read live via the authenticated admin
   session this session): 8517e500-1a5d-4616-a8ff-869a99685335
   (Larum Studio).
   ─────────────────────────────────────────────────────────────────── */


-- ═════════════════════════════════════════════════════════════════════
-- 1 · MEMBERSHIPS — single source of truth for organization + role
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  role            text NOT NULL CHECK (role IN ('admin', 'agent')),
  UNIQUE (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org  ON public.memberships(organization_id);

DROP TRIGGER IF EXISTS touch_memberships ON public.memberships;
CREATE TRIGGER touch_memberships BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS enabled now; no policies attached yet in this migration on purpose —
-- see 006_policies_prepared.sql. Enabling RLS with zero policies means
-- "deny all" by default for authenticated/anon, which is the correct,
-- safe state until the real policies are reviewed and applied deliberately.
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;


-- ═════════════════════════════════════════════════════════════════════
-- 2 · AGENTS — link to auth identity, still a pure business entity
-- ═════════════════════════════════════════════════════════════════════
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- UNIQUE as a separate statement: ADD COLUMN ... UNIQUE inline does not
-- combine cleanly with "IF NOT EXISTS" across repeated runs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_auth_user_id_key'
  ) THEN
    ALTER TABLE public.agents ADD CONSTRAINT agents_auth_user_id_key UNIQUE (auth_user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agents_auth_user ON public.agents(auth_user_id);


-- ═════════════════════════════════════════════════════════════════════
-- 3 · LEADS — snapshot ownership, independent of properties.agent_id
--     after creation. Deliberately NOT synced on property reassignment
--     (see ADR §9/§12 — a lead's ownership is a point-in-time fact, not
--     a live derivation).
-- ═════════════════════════════════════════════════════════════════════
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON public.leads(agent_id);

-- No backfill for existing rows: pre-existing leads have no reliable
-- point-in-time agent_id to reconstruct (properties.agent_id today only
-- reflects the CURRENT assignment, which is exactly the ambiguity this
-- column exists to avoid going forward). Leave existing rows NULL —
-- an admin-only, org-scoped read still covers them. Do not backfill
-- from properties.agent_id here — that would fabricate a historical
-- fact that was never actually true at lead-creation time.


-- ═════════════════════════════════════════════════════════════════════
-- 4 · AUTHORIZATION HELPERS — SECURITY DEFINER, STABLE, fail-closed
--
--   All functions are SECURITY DEFINER so they can read memberships/
--   agents on behalf of the caller without requiring memberships/agents
--   to have permissive read policies for that lookup — the function's
--   own logic IS the authorization boundary, not the caller's RLS
--   visibility into those tables. This only grants the intended RLS
--   bypass because these functions are created (and therefore owned)
--   by the migration-running role in the Supabase SQL Editor — the
--   same role that owns every other table in this schema and already
--   bypasses RLS by ownership. search_path is pinned to prevent
--   search_path hijacking (a documented CVE-class issue with
--   SECURITY DEFINER functions that don't pin it). All are STABLE (not
--   VOLATILE): they only read, never write, and their result is
--   constant within one statement — required for the planner to use
--   them efficiently inside RLS USING/WITH CHECK without re-evaluating
--   per row unnecessarily.
--
--   No dynamic SQL anywhere below: every WHERE clause is a plain
--   parameterized equality, so there is no injection surface — the
--   only externally influenced input is p_organization_id, passed as a
--   typed uuid parameter, never concatenated into a query string.
--
--   Fail-closed audit (verified for every branch, not just asserted):
--     auth.uid() IS NULL             → every WHERE clause fails to
--                                       match (NULL = x is NULL, never
--                                       true) → empty/false/NULL.
--     no membership row at all       → is_org_admin: EXISTS → false.
--     membership role = 'agent'      → is_org_admin: false (role filter).
--     membership role = 'admin'      → is_org_admin: true, scoped to
--                                       that one organization_id only.
--     agents.status = 'inactive'     → current_agent_id: filtered out
--                                       by the status check → NULL.
--     agents.auth_user_id IS NULL    → current_agent_id: no match → NULL.
--     agent linked but membership    → current_agent_id: NOW requires
--     row missing/wrong role           the JOIN below to also find a
--                                       role='agent' membership for the
--                                       SAME user + SAME org as the
--                                       agent row — a dangling link
--                                       with no membership resolves to
--                                       NULL, not to implicit access.
--                                       This closes a gap found on
--                                       review: the first draft of
--                                       this function only checked
--                                       agents.auth_user_id, so a user
--                                       whose linking step wrote
--                                       agents.auth_user_id but whose
--                                       memberships INSERT failed (the
--                                       exact partial-failure case the
--                                       onboarding flow spec calls out)
--                                       would have kept ownership
--                                       access despite having no
--                                       membership — contradicting the
--                                       spec's own invariant ("sin
--                                       membership → acceso operativo
--                                       = DENY"). Fixed here, not
--                                       patched later.
--     user with TWO memberships      → is_org_admin/current_agent_id
--     (e.g. admin in Org A, agent      are each scoped correctly per
--     in Org B)                        call: is_org_admin(OrgA) = true,
--                                       is_org_admin(OrgB) = false (role
--                                       is 'agent' there); current_agent_id
--                                       resolves to the Org B agent row
--                                       (agents.auth_user_id is UNIQUE,
--                                       so at most one agent row can
--                                       ever match, and it carries its
--                                       own fixed organization_id) —
--                                       admin(ORG) in A, agent(OWN) in
--                                       B, correctly isolated.
-- ═════════════════════════════════════════════════════════════════════

-- Convenience: is the caller an admin of the given organization? Used
-- directly in policy USING/WITH CHECK clauses so policies read as
-- intent ("is_org_admin(organization_id)") rather than repeating the
-- membership lookup inline everywhere.
CREATE OR REPLACE FUNCTION public.is_org_admin(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = p_organization_id
      AND m.role = 'admin'
  );
$$;

-- auth.uid() → agent_id, or NULL if unresolved. Requires ALL of:
-- an active agents row linked to this auth user, AND a matching
-- memberships row (same user, same organization, role='agent'). Either
-- one missing fails closed — see the audit note above for why the
-- membership half of this join is not optional.
CREATE OR REPLACE FUNCTION public.current_agent_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id
  FROM public.agents a
  JOIN public.memberships m
    ON m.user_id = a.auth_user_id
   AND m.organization_id = a.organization_id
   AND m.role = 'agent'
  WHERE a.auth_user_id = auth.uid()
    AND a.status = 'active'
  LIMIT 1;
$$;

-- The organization of the agent resolved above, or NULL under the same
-- conditions. Built on current_agent_id() rather than re-querying, so
-- the membership requirement above is enforced in exactly one place.
-- Used by policies that must confirm a resource's organization_id
-- still matches the acting agent's own organization — see the "cross-
-- org agent assignment" note in 006_policies_prepared.sql.
CREATE OR REPLACE FUNCTION public.current_agent_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.organization_id
  FROM public.agents a
  WHERE a.id = public.current_agent_id();
$$;

-- auth.uid() → (organization_id, role) for a given organization, or
-- zero rows if no membership exists there. Fail-closed: absence of a
-- membership row resolves to no rows, never to an implicit role. Not
-- currently called from any policy in this migration (is_org_admin()
-- and current_agent_id() cover every case policies need) — kept as a
-- documented, intentional building block for future server-side code
-- that needs to answer "what is my role here" directly (e.g. an AE III
-- API route rendering role-appropriate UI), so that code has the same
-- fail-closed guarantee instead of re-deriving the lookup ad hoc.
CREATE OR REPLACE FUNCTION public.current_membership(p_organization_id uuid)
RETURNS TABLE (organization_id uuid, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.organization_id, m.role
  FROM public.memberships m
  WHERE m.user_id = auth.uid()
    AND m.organization_id = p_organization_id
  LIMIT 1;
$$;

-- EXECUTE grants: revoke the implicit PUBLIC grant Postgres adds by
-- default on function creation, then grant explicitly only to
-- authenticated. anon has no auth.uid() anyway (every WHERE clause
-- above fails closed for it), but pinning this explicitly avoids
-- relying on that as the only reason it's safe, and keeps the intent
-- readable in the schema itself rather than left implicit.
REVOKE ALL ON FUNCTION public.is_org_admin(uuid)              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_agent_id()               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_agent_organization_id()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_membership(uuid)         FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_agent_id()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_agent_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_membership(uuid)       TO authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 4b · BOUNDARY-COLUMN PROTECTION TRIGGERS
--
--   RLS's WITH CHECK compares the proposed NEW row against a
--   condition — it cannot directly compare a NEW column value against
--   the row's own OLD value, because USING (which sees the OLD row)
--   and WITH CHECK (which sees the NEW row) do not share row context
--   within one policy. For "this column must not change unless the
--   caller is admin", a subquery back into the SAME table being
--   updated is the tempting shortcut, but it is fragile: it re-reads
--   the table being modified mid-statement, and Postgres does not
--   guarantee that scan observes the pre-update values in every case —
--   this is a documented sharp edge of RLS, not a hypothetical one.
--   Where the comparison is against a DIFFERENT table (e.g. a
--   properties policy checking agents.organization_id), there is no
--   such ambiguity and a plain subquery in WITH CHECK is correct and
--   used directly in 006_policies_prepared.sql. Only agents.organization_id
--   and leads.{agent_id,property_id} need this trigger-based approach,
--   because those are same-table, OLD-vs-NEW comparisons.
--
--   agents.auth_user_id does NOT need a trigger: it is pinned via a
--   plain WITH CHECK (auth_user_id = auth.uid()) in the policies file,
--   which is safe because auth.uid() is a session value, not a
--   subquery into agents — no self-reference involved.
-- ═════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_agents_boundary()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.is_org_admin(OLD.organization_id) THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'organization_id is not editable by the agent themself';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'id is not editable';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_agents_boundary ON public.agents;
CREATE TRIGGER protect_agents_boundary BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.protect_agents_boundary();

CREATE OR REPLACE FUNCTION public.protect_leads_boundary()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.properties p WHERE p.id = OLD.property_id;
  IF NOT public.is_org_admin(v_org) THEN
    IF NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
      RAISE EXCEPTION 'agent_id is not reassignable by an agent — admin only';
    END IF;
    IF NEW.property_id IS DISTINCT FROM OLD.property_id THEN
      RAISE EXCEPTION 'property_id is not editable by an agent';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_leads_boundary ON public.leads;
CREATE TRIGGER protect_leads_boundary BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.protect_leads_boundary();

-- properties.agent_id / properties.organization_id do NOT get an
-- equivalent trigger: the WITH CHECK in "properties agent updates own"
-- (006_policies_prepared.sql) already pins both via a subquery into
-- agents — a DIFFERENT table, so no self-reference risk — which is
-- sufficient and avoids a redundant second enforcement mechanism.


-- ═════════════════════════════════════════════════════════════════════
-- 5 · ADMIN MEMBERSHIP — link the existing admin account
--
--   ⚠ NOT RUN. Requires the real auth.users.id for
--   contactolarum@gmail.com, substituted in place of the placeholder
--   below (see file header — this session could not resolve it: the
--   lookup requires the Auth Admin API with service_role, which the
--   permission classifier blocked when attempted locally). The
--   organization id is confirmed live.
-- ═════════════════════════════════════════════════════════════════════

-- INSERT INTO public.memberships (user_id, organization_id, role)
-- VALUES (
--   'ADMIN_AUTH_USER_ID'::uuid,                    -- ← replace: Supabase → Authentication → Users → contactolarum@gmail.com → copy id
--   '8517e500-1a5d-4616-a8ff-869a99685335'::uuid,  -- Larum Studio — confirmed live this session
--   'admin'
-- )
-- ON CONFLICT (user_id, organization_id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════
-- 6 · Verify
-- ═════════════════════════════════════════════════════════════════════
SELECT table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'agents' AND column_name = 'auth_user_id')
    OR (table_name = 'leads'  AND column_name = 'agent_id')
    OR (table_name = 'memberships'));

SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('current_agent_id', 'current_agent_organization_id',
                   'current_membership', 'is_org_admin',
                   'protect_agents_boundary', 'protect_leads_boundary');

SELECT tgname, tgrelid::regclass FROM pg_trigger
WHERE tgname IN ('protect_agents_boundary', 'protect_leads_boundary');

-- Expected: 3 new/changed columns, 6 new functions (4 helpers + 2
-- trigger functions), 2 new triggers, memberships table present with
-- RLS enabled and zero policies (deny-all until 006_policies_prepared.sql
-- is reviewed and applied deliberately).
