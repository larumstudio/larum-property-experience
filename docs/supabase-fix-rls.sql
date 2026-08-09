-- ─────────────────────────────────────────────────────────────────────
-- Larum Property Experience — the one script to run in Supabase
--
--   Supabase → SQL Editor → New query → paste → Run.
--
-- Re-running it is safe: it drops and recreates the policies every time.
--
-- Why it is needed. Probed live against the anon key on 9 Aug 2026 —
-- after the run this script was supposed to have had:
--
--   INSERT public.leads             → 42501 row-level security
--   INSERT public.sessions          → 42501 row-level security
--   INSERT public.analytics_events  → 42501 row-level security
--
-- So the script had never actually been applied to this project. Nothing
-- is being written: every enquiry falls back to mailto and every visit is
-- lost when the tab closes. The columns themselves are fine — they match
-- docs/supabase-schema.sql, which is why the error is a policy error and
-- not a column error.
--
-- Verify afterwards with the block at the bottom of this file.
-- ─────────────────────────────────────────────────────────────────────

-- 1 · Columns the app now expects. No-ops if they are already there.

-- Links a lead to the session that produced it, so the admin panel can show
-- what the visitor did before they filled the form.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS session_id text;

CREATE INDEX IF NOT EXISTS idx_leads_session    ON public.leads (session_id);
CREATE INDEX IF NOT EXISTS idx_events_session   ON public.analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON public.sessions (created_at DESC);

-- 2 · RLS on for every table.
ALTER TABLE public.leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- 3 · Clear whatever is there now, so this script is the single source of truth.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('leads', 'sessions', 'analytics_events')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- 4 · Visitors may write, and only write.
--     The anon key ships in the page source by design, so anything it can
--     read is public. It reads nothing.
CREATE POLICY "anon inserts leads"    ON public.leads            FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon inserts sessions" ON public.sessions         FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon inserts events"   ON public.analytics_events FOR INSERT TO anon WITH CHECK (true);

-- The session row is upserted as the visit progresses — duration, chapters,
-- questions, qualification — so anon needs UPDATE on sessions as well.
-- The row id is a client-generated UUID that is never shown anywhere, so in
-- practice a visitor can only rewrite their own row.
CREATE POLICY "anon updates sessions" ON public.sessions FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 5 · Only a signed-in admin may read. This is what admin.html uses.
CREATE POLICY "authenticated reads leads"    ON public.leads            FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated reads sessions" ON public.sessions         FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated reads events"   ON public.analytics_events FOR SELECT TO authenticated USING (true);

-- Marking a lead as contacted, from the admin panel.
CREATE POLICY "authenticated updates leads"  ON public.leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────
-- 6 · The admin account
--
-- The panel signs in with Supabase Auth (email + password). Create the
-- account by hand — the panel has no sign-up, on purpose:
--
--   Authentication → Users → Add user → Create new user
--     Email: contactolarum@gmail.com
--     Auto Confirm User: ON
--
-- And close the door behind it:
--   Authentication → Providers → Email → Allow new users to sign up: OFF
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- 7 · Check it worked.
--
-- Expected: anon has INSERT on all three plus UPDATE on sessions;
-- authenticated has SELECT on all three plus UPDATE on leads.
-- ─────────────────────────────────────────────────────────────────────
SELECT tablename, cmd, roles, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('leads', 'sessions', 'analytics_events')
ORDER BY tablename, cmd;

-- Then, from the browser: open the experience, accept the consent banner,
-- explore for a minute and close the tab. Back here:
--
--   SELECT created_at, property, duration_seconds, concierge_questions,
--          scenes_explored, qualified
--   FROM public.sessions ORDER BY created_at DESC LIMIT 10;
--
--   SELECT created_at, event_type, event_data
--   FROM public.analytics_events ORDER BY created_at DESC LIMIT 20;
