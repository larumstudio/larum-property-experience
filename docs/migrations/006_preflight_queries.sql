/* ── Larum — Migration 006 — Pre-Flight Verification Queries ──────────
   READ-ONLY. These queries inspect production state without modifying
   anything. Run each one in Supabase → SQL Editor and compare the
   output against the EXPECTED values documented inline.

   Purpose: confirm that the production schema matches the assumptions
   006_authorization_foundation.sql and 006_policies_prepared.sql were
   built and tested against, BEFORE running either of them.

   ⚠ DO NOT RUN any other 006_*.sql file until every query below
   returns the expected result. Any deviation must be investigated
   and resolved first.
   ─────────────────────────────────────────────────────────────────── */


-- ═════════════════════════════════════════════════════════════════════
-- Q1 · POLICY SNAPSHOT — the single most critical pre-flight check
--
-- This is the authoritative list of every RLS policy active in
-- production right now. 006_policies_prepared.sql drops 10 of these
-- by exact name — if ANY name does not match, the DROP is a silent
-- no-op and the old permissive policy survives alongside the new
-- restrictive one (Postgres ORs them), nullifying the restriction.
-- This is the exact bug found and fixed for concierge_messages
-- during isolated testing.
--
-- EXPECTED: 18 policies total (8 anon + 10 authenticated).
-- ═════════════════════════════════════════════════════════════════════
SELECT tablename, policyname, permissive, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

/* EXPECTED OUTPUT (18 rows):
   ┌──────────────────────────────┬──────────────────────────────────────────┬────────────┬────────┬───────────────────┐
   │ tablename                    │ policyname                               │ permissive │ cmd    │ roles             │
   ├──────────────────────────────┼──────────────────────────────────────────┼────────────┼────────┼───────────────────┤
   │ agents                       │ authenticated all agents                 │ PERMISSIVE │ ALL    │ {authenticated}   │
   │ analytics_events             │ anon inserts events                      │ PERMISSIVE │ INSERT │ {anon}            │
   │ analytics_events             │ authenticated reads events               │ PERMISSIVE │ SELECT │ {authenticated}   │
   │ audits                       │ authenticated all audits                 │ PERMISSIVE │ ALL    │ {authenticated}   │
   │ concierge_conversations      │ anon inserts conversations               │ PERMISSIVE │ INSERT │ {anon}            │
   │ concierge_conversations      │ anon updates conversations               │ PERMISSIVE │ UPDATE │ {anon}            │
   │ concierge_conversations      │ authenticated reads conversations        │ PERMISSIVE │ SELECT │ {authenticated}   │
   │ concierge_messages           │ anon inserts messages                    │ PERMISSIVE │ INSERT │ {anon}            │
   │ concierge_messages           │ authenticated reads messages             │ PERMISSIVE │ SELECT │ {authenticated}   │
   │ leads                        │ anon inserts leads                       │ PERMISSIVE │ INSERT │ {anon}            │
   │ leads                        │ authenticated reads leads                │ PERMISSIVE │ SELECT │ {authenticated}   │
   │ leads                        │ authenticated updates leads              │ PERMISSIVE │ UPDATE │ {authenticated}   │
   │ organizations                │ authenticated all organizations          │ PERMISSIVE │ ALL    │ {authenticated}   │
   │ properties                   │ anon reads published properties          │ PERMISSIVE │ SELECT │ {anon}            │
   │ properties                   │ authenticated all properties             │ PERMISSIVE │ ALL    │ {authenticated}   │
   │ sessions                     │ anon inserts sessions                    │ PERMISSIVE │ INSERT │ {anon}            │
   │ sessions                     │ anon updates sessions                    │ PERMISSIVE │ UPDATE │ {anon}            │
   │ sessions                     │ authenticated reads sessions             │ PERMISSIVE │ SELECT │ {authenticated}   │
   └──────────────────────────────┴──────────────────────────────────────────┴────────────┴────────┴───────────────────┘

   ⚠ WATCH FOR:
   - Any policy NOT in this list → manually added, must be investigated
   - Any policy with a DIFFERENT name → 006_policies_prepared.sql will
     not drop it, causing the OR-combination bug
   - "authenticated all revisions" on experience_revisions → migration
     005 was applied (affects cutover — see Q3)
   - Extra rows with roles = {public} or no TO clause → original
     supabase-schema.sql policies may still be active instead of
     supabase-fix-rls.sql replacements — investigate before cutover
*/


-- ═════════════════════════════════════════════════════════════════════
-- Q2 · TABLE EXISTENCE AND COLUMN COUNTS
--
-- Confirms all 9 expected tables exist and have the expected number
-- of columns. memberships should NOT exist yet (006 creates it).
-- experience_revisions presence indicates migration 005 was applied.
-- ═════════════════════════════════════════════════════════════════════
SELECT table_name, count(*) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('organizations','agents','properties','audits',
                     'concierge_conversations','concierge_messages',
                     'leads','sessions','analytics_events',
                     'memberships','experience_revisions')
GROUP BY table_name ORDER BY table_name;

/* EXPECTED (9 rows — NO memberships, NO experience_revisions):
   agents                    13
   analytics_events           8   (7 base + property_id from 001)
   audits                     9
   concierge_conversations    9
   concierge_messages         9
   leads                     23   (22 base + property_id from 001)
   organizations              8
   properties                21   (13 base + 7 generated + currency)
   sessions                  17   (16 base + property_id from 001)

   ⚠ If agents shows 14 → auth_user_id already exists (006 partially applied)
   ⚠ If leads shows 24 → agent_id already exists (006 partially applied)
   ⚠ If memberships appears → 006 already partially applied
   ⚠ If experience_revisions appears → 005 was applied (see Q3)
*/


-- ═════════════════════════════════════════════════════════════════════
-- Q3 · MIGRATION 005 STATUS
--
-- Determines whether experience_revisions table exists. If it does,
-- the commented-out policies in 006_policies_prepared.sql for that
-- table must be reviewed and potentially uncommented.
-- ═════════════════════════════════════════════════════════════════════
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'experience_revisions'
) AS migration_005_applied;

/* EXPECTED: false
   Standing constraint: "NO aplicar migration 005"
   If true → the experience_revisions policies in 006_policies_prepared.sql
   must be uncommented before cutover, AND the old "authenticated all revisions"
   policy must be dropped.
*/


-- ═════════════════════════════════════════════════════════════════════
-- Q4 · CHECK FOR PARTIAL 006 APPLICATION
--
-- If anyone ran 006_authorization_foundation.sql already (or part of
-- it), these objects would exist. All are safe to re-run (idempotent),
-- but knowing the state avoids surprises.
-- ═════════════════════════════════════════════════════════════════════
SELECT 'column' AS type, table_name || '.' || column_name AS name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'agents' AND column_name = 'auth_user_id')
    OR (table_name = 'leads'  AND column_name = 'agent_id'))
UNION ALL
SELECT 'table', 'memberships'
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'memberships'
UNION ALL
SELECT 'function', proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('is_org_admin', 'current_agent_id',
                   'current_agent_organization_id', 'current_membership',
                   'protect_agents_boundary', 'protect_leads_boundary')
UNION ALL
SELECT 'trigger', tgname
FROM pg_trigger
WHERE tgname IN ('protect_agents_boundary', 'protect_leads_boundary');

/* EXPECTED: 0 rows (nothing from 006 exists yet).
   If rows appear, 006 was partially applied — safe to continue
   (all statements are idempotent), but note it in the cutover log.
*/


-- ═════════════════════════════════════════════════════════════════════
-- Q5 · ORGANIZATION VERIFICATION
--
-- Confirms the Larum Studio organization row exists with the expected
-- UUID. This is the organization_id used in the admin membership.
-- ═════════════════════════════════════════════════════════════════════
SELECT id, name, slug, status FROM public.organizations;

/* EXPECTED: 1 row
   id:     8517e500-1a5d-4616-a8ff-869a99685335
   name:   Larum Studio (or current name)
   slug:   larum-studio (or current slug)
   status: active
*/


-- ═════════════════════════════════════════════════════════════════════
-- Q6 · DATA VOLUME — for backup time estimation
-- ═════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM public.leads) AS leads,
  (SELECT count(*) FROM public.sessions) AS sessions,
  (SELECT count(*) FROM public.analytics_events) AS events,
  (SELECT count(*) FROM public.properties) AS properties,
  (SELECT count(*) FROM public.agents) AS agents,
  (SELECT count(*) FROM public.organizations) AS organizations,
  (SELECT count(*) FROM public.audits) AS audits,
  (SELECT count(*) FROM public.concierge_conversations) AS conversations,
  (SELECT count(*) FROM public.concierge_messages) AS messages;


-- ═════════════════════════════════════════════════════════════════════
-- Q7 · RLS ENABLED STATUS — confirms RLS is ON for all tables
-- ═════════════════════════════════════════════════════════════════════
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('organizations','agents','properties','audits',
                  'concierge_conversations','concierge_messages',
                  'leads','sessions','analytics_events')
ORDER BY relname;

/* EXPECTED: all 9 rows show relrowsecurity = true */


-- ═════════════════════════════════════════════════════════════════════
-- Q8 · EXISTING FUNCTIONS — baseline before 006 adds new ones
-- ═════════════════════════════════════════════════════════════════════
SELECT proname, prokind, prosecdef
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
ORDER BY proname;

/* EXPECTED: touch_updated_at (and possibly others from application code).
   None of the 006 functions should appear yet.
*/


-- ═════════════════════════════════════════════════════════════════════
-- Q9 · AUTH USER ID — MANUAL LOOKUP REQUIRED
--
-- This query CANNOT be run from SQL Editor (auth.users is not
-- directly queryable via PostgREST/SQL Editor in all Supabase plans).
-- Instead: Dashboard → Authentication → Users → find
-- contactolarum@gmail.com → copy the UUID shown in the user row.
--
-- If SQL access to auth schema IS available:
-- ═════════════════════════════════════════════════════════════════════
SELECT id, email, created_at
FROM auth.users
WHERE email = 'contactolarum@gmail.com';

/* Record the UUID — it replaces ADMIN_AUTH_USER_ID in the cutover. */


-- ═════════════════════════════════════════════════════════════════════
-- Q10 · CONCIERGE UNIQUE INDEX (migrations 003 + 004)
--
-- 006 does not depend on this index, but its absence would indicate
-- the migration chain was not fully applied — investigate before
-- proceeding.
-- ═════════════════════════════════════════════════════════════════════
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'concierge_conversations'
  AND indexname = 'uniq_conversation_session_property';

/* EXPECTED: 1 row. indexdef must NOT contain "WHERE" (migration 004
   replaced the partial index from 003 with a plain UNIQUE index).
   If 0 rows → migrations 003/004 were never applied.
   If indexdef contains "WHERE" → only 003 was applied, not 004.
*/


-- ═════════════════════════════════════════════════════════════════════
-- Q11 · TRIGGERS — baseline before 006 adds boundary triggers
-- ═════════════════════════════════════════════════════════════════════
SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid::regclass::text IN (
    'organizations','agents','properties','audits',
    'concierge_conversations','leads','sessions','analytics_events'
  )
ORDER BY tgrelid::regclass, tgname;

/* EXPECTED: touch_* triggers on organizations, agents, properties,
   audits, concierge_conversations. NO protect_agents_boundary or
   protect_leads_boundary (those come from 006).
*/
