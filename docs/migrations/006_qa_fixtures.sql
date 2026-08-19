/* ── Larum — 006 QA Fixtures ──────────────────────────────────────────
   Deterministic test data for the authorization Test Matrix.

   Run AFTER 006_authorization_foundation.sql in the ISOLATED project.
   Run BEFORE 006_policies_prepared.sql (fixtures must exist before
   the open policies are dropped — the fixture INSERT uses them).

   ALL data is synthetic. No real Larum data, no real credentials,
   no production UUIDs.

   ⚠ NEVER run against the production project.

   Auth users are created separately via the test runner
   (run-authorization-tests.mjs) using the service_role key and
   Supabase Auth Admin API. This file only creates the business-layer
   rows that reference those auth users via the auth_user_id column
   added by 006_authorization_foundation.sql.

   The test runner:
     1. Creates auth users via Auth Admin API (service_role)
     2. Runs THIS file via PostgREST with the service_role key
        (bypasses RLS, so the open policies are not required)
     3. Runs 006_policies_prepared.sql (policy cutover)
     4. Obtains per-user access tokens via Auth signIn
     5. Runs the Test Matrix

   Fixture UUIDs are deterministic (hardcoded) so the test runner
   can reference them without querying for them.
   ─────────────────────────────────────────────────────────────────── */


-- ═════════════════════════════════════════════════════════════════════
-- DETERMINISTIC IDs — referenced by the test runner and test matrix
-- ═════════════════════════════════════════════════════════════════════

-- Organizations
-- QA_ORG_A:  'a0000000-0000-0000-0000-000000000001'
-- QA_ORG_B:  'b0000000-0000-0000-0000-000000000002'

-- Agents (business entity — agents table)
-- QA_AGENT_A:        'ca000000-0000-0000-0000-00000000000a'
-- QA_AGENT_B:        'ca000000-0000-0000-0000-00000000000b'
-- QA_AGENT_C:        'ca000000-0000-0000-0000-00000000000c'  (Org B)
-- QA_INACTIVE_AGENT: 'ca000000-0000-0000-0000-0000000000de'

-- Properties
-- QA_PROPERTY_A: 'da000000-0000-0000-0000-00000000000a'  (Org A, Agent A)
-- QA_PROPERTY_B: 'da000000-0000-0000-0000-00000000000b'  (Org A, Agent B)
-- QA_PROPERTY_C: 'da000000-0000-0000-0000-00000000000c'  (Org B, Agent C)

-- Leads
-- QA_LEAD_A: 'ea000000-0000-0000-0000-00000000000a'  (Property A, Agent A)
-- QA_LEAD_B: 'ea000000-0000-0000-0000-00000000000b'  (Property B, Agent B)

-- Auth user IDs (auth.users — created by the test runner, NOT here)
-- Placeholders for the INSERT below; the test runner replaces them
-- after creating the auth users. These are the auth.users.id values:
--
-- QA_ADMIN_A_AUTH_ID:         set by runner
-- QA_ADMIN_B_AUTH_ID:         set by runner
-- QA_AGENT_A_AUTH_ID:         set by runner
-- QA_AGENT_B_AUTH_ID:         set by runner
-- QA_AGENT_C_AUTH_ID:         set by runner
-- QA_INACTIVE_AGENT_AUTH_ID:  set by runner
-- QA_UNLINKED_USER_AUTH_ID:   set by runner (no agents row, no membership)


-- ═════════════════════════════════════════════════════════════════════
-- 1 · ORGANIZATIONS
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO public.organizations (id, name, slug, status, contact_email)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'QA Organization Alpha', 'qa-org-alpha', 'active', 'qa-alpha@example.invalid'),
  ('b0000000-0000-0000-0000-000000000002', 'QA Organization Beta',  'qa-org-beta',  'active', 'qa-beta@example.invalid')
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════
-- 2 · AGENTS (business rows — auth_user_id linked by the test runner)
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO public.agents (id, organization_id, name, slug, email, phone, status)
VALUES
  ('ca000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001',
   'QA Agent Alpha', 'qa-agent-alpha', 'agent-alpha@example.invalid', '+00 000 000 001', 'active'),
  ('ca000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001',
   'QA Agent Beta', 'qa-agent-beta', 'agent-beta@example.invalid', '+00 000 000 002', 'active'),
  ('ca000000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-000000000002',
   'QA Agent Charlie', 'qa-agent-charlie', 'agent-charlie@example.invalid', '+00 000 000 003', 'active'),
  ('ca000000-0000-0000-0000-0000000000de', 'a0000000-0000-0000-0000-000000000001',
   'QA Inactive Agent', 'qa-inactive-agent', 'inactive@example.invalid', '+00 000 000 004', 'inactive')
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════
-- 3 · PROPERTIES
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO public.properties (id, organization_id, agent_id, slug, status, display_order, content)
VALUES
  ('da000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001',
   'ca000000-0000-0000-0000-00000000000a', 'qa-villa-alpha', 'published', 1,
   '{"title":{"en":"QA Villa Alpha","es":"QA Villa Alfa"}}'::jsonb),
  ('da000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001',
   'ca000000-0000-0000-0000-00000000000b', 'qa-villa-beta', 'published', 2,
   '{"title":{"en":"QA Villa Beta","es":"QA Villa Beta"}}'::jsonb),
  ('da000000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-000000000002',
   'ca000000-0000-0000-0000-00000000000c', 'qa-villa-charlie', 'published', 1,
   '{"title":{"en":"QA Villa Charlie","es":"QA Villa Charlie"}}'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════
-- 4 · LEADS (with snapshot agent_id from 006_authorization_foundation)
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO public.leads (id, property, property_id, agent_id, name, email, status)
VALUES
  ('ea000000-0000-0000-0000-00000000000a', 'qa-villa-alpha',
   'da000000-0000-0000-0000-00000000000a', 'ca000000-0000-0000-0000-00000000000a',
   'QA Lead Visitor Alpha', 'visitor-alpha@example.invalid', 'new'),
  ('ea000000-0000-0000-0000-00000000000b', 'qa-villa-beta',
   'da000000-0000-0000-0000-00000000000b', 'ca000000-0000-0000-0000-00000000000b',
   'QA Lead Visitor Beta', 'visitor-beta@example.invalid', 'new')
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════
-- 5 · AUDITS
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO public.audits (id, property_id, status, performed_by)
VALUES
  ('fa000000-0000-0000-0000-00000000000a', 'da000000-0000-0000-0000-00000000000a',
   'completed', 'qa-auditor')
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════
-- 6 · CONCIERGE (minimal — enough for policy tests)
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO public.concierge_conversations (id, property_id, property_slug, session_id, lang)
VALUES
  ('ab000000-0000-0000-0000-00000000000a', 'da000000-0000-0000-0000-00000000000a',
   'qa-villa-alpha', 'qa-session-001', 'en')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.concierge_messages (id, conversation_id, role, content)
VALUES
  ('ac000000-0000-0000-0000-00000000000a', 'ab000000-0000-0000-0000-00000000000a',
   'user', 'QA test message from visitor'),
  ('ac000000-0000-0000-0000-00000000000b', 'ab000000-0000-0000-0000-00000000000a',
   'assistant', 'QA test response from concierge')
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════
-- 7 · SESSIONS + ANALYTICS (minimal — enough for policy tests)
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO public.sessions (id, property, property_id, lang, duration_seconds)
VALUES
  ('bb000000-0000-0000-0000-00000000000a', 'qa-villa-alpha',
   'da000000-0000-0000-0000-00000000000a', 'en', 120)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.analytics_events (id, property, property_id, event_type, event_data)
VALUES
  ('cc000000-0000-0000-0000-00000000000a', 'qa-villa-alpha',
   'da000000-0000-0000-0000-00000000000a', 'page_view', '{"page":"home"}'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════
-- NOTE: memberships and agents.auth_user_id are set by the test
-- runner AFTER creating auth users, because user_id references
-- auth.users(id) which only exists after the Auth Admin API creates
-- them. The runner uses service_role to:
--   1. INSERT INTO memberships (admin + agent rows)
--   2. UPDATE agents SET auth_user_id = <auth-user-uuid>
-- See tests/run-authorization-tests.mjs for the exact sequence.
-- ═════════════════════════════════════════════════════════════════════
