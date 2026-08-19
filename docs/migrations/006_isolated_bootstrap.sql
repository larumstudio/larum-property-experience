/* ── Larum — 006 Isolated Test Bootstrap ──────────────────────────────
   Creates the MINIMUM schema required by 006_authorization_foundation.sql
   and 006_policies_prepared.sql in a CLEAN isolated Supabase project.

   THIS FILE EXISTS SOLELY FOR THE ISOLATED TEST ENVIRONMENT.
   It reproduces the subset of the production schema that migrations
   001–004 + supabase-fix-rls.sql established, WITHOUT any production
   data, credentials, or real user accounts.

   Run order (all in the isolated project's SQL Editor):
     1. THIS FILE  (bootstrap)
     2. 006_authorization_foundation.sql
     3. 006_qa_fixtures.sql  (test data + memberships)
     4. 006_policies_prepared.sql  (cutover — replaces open policies)

   After step 4 the Test Matrix can run:
     ISOLATED_SUPABASE_URL=https://<project>.supabase.co \
     ISOLATED_SUPABASE_ANON_KEY=<anon-key> \
     ISOLATED_SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
     node tests/run-authorization-tests.mjs

   ⚠ NEVER run this against the production project
   (mtyemgfovvmjrsxevcgh). It drops and recreates policies and
   is only safe in a disposable environment.
   ─────────────────────────────────────────────────────────────────── */


-- ═════════════════════════════════════════════════════════════════════
-- 0 · touch_updated_at — required by migration 001 and 006
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- 1 · PRE-EXISTING TABLES (leads, sessions, analytics_events)
--     These exist in production BEFORE any numbered migration.
--     Reproduced here from docs/supabase-schema.sql.
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  property TEXT NOT NULL,
  lang TEXT DEFAULT 'en',
  name TEXT,
  email TEXT,
  interest TEXT,
  message TEXT,
  entry_path TEXT,
  scenes_explored TEXT[] DEFAULT '{}',
  spaces_explored TEXT[] DEFAULT '{}',
  detected_interests JSONB DEFAULT '{}',
  qualified BOOLEAN DEFAULT false,
  calculator_used BOOLEAN DEFAULT false,
  film_watched BOOLEAN DEFAULT false,
  duration_minutes INTEGER DEFAULT 0,
  concierge_questions TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'new',
  score INTEGER DEFAULT 0,
  follow_up_date DATE,
  notes TEXT,
  session_id TEXT
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  property TEXT NOT NULL,
  lang TEXT DEFAULT 'en',
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  session_id TEXT
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  property TEXT NOT NULL,
  lang TEXT DEFAULT 'en',
  entry_path TEXT,
  duration_seconds INTEGER DEFAULT 0,
  chapters_visited TEXT[] DEFAULT '{}',
  scenes_explored TEXT[] DEFAULT '{}',
  spaces_explored TEXT[] DEFAULT '{}',
  concierge_questions INTEGER DEFAULT 0,
  interests JSONB DEFAULT '{}',
  calculator_used BOOLEAN DEFAULT false,
  film_watched BOOLEAN DEFAULT false,
  enquiry_sent BOOLEAN DEFAULT false,
  qualified BOOLEAN DEFAULT false,
  consent_given BOOLEAN DEFAULT false
);


-- ═════════════════════════════════════════════════════════════════════
-- 2 · MIGRATION 001 — organizations, agents, properties, audits,
--     concierge, wire existing tables, RLS + open policies
-- ═════════════════════════════════════════════════════════════════════

-- 2a · Organizations + Agents
CREATE TABLE IF NOT EXISTS public.organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'active',
  contact_email text,
  notes         text
);

CREATE TABLE IF NOT EXISTS public.agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  slug            text UNIQUE,
  email           text,
  phone           text,
  agency          text,
  role            text,
  photo_url       text,
  bio             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_agents_org ON public.agents(organization_id);

-- 2b · Properties
CREATE TABLE IF NOT EXISTS public.properties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
  agent_id        uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  slug            text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'draft',
  content         jsonb NOT NULL DEFAULT '{}'::jsonb,
  knowledge       jsonb NOT NULL DEFAULT '{}'::jsonb,
  assets          jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order   integer NOT NULL DEFAULT 0,
  is_default      boolean NOT NULL DEFAULT false,
  CONSTRAINT properties_status_valid CHECK (
    status IN ('draft','in_production','ready','published','archived')
  ),
  CONSTRAINT properties_slug_shape CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS name_en text
    GENERATED ALWAYS AS (coalesce(content->'title'->>'en', content->>'title')) STORED,
  ADD COLUMN IF NOT EXISTS name_es text
    GENERATED ALWAYS AS (coalesce(content->'title'->>'es', content->>'title')) STORED,
  ADD COLUMN IF NOT EXISTS location text
    GENERATED ALWAYS AS (coalesce(content->'label'->>'es', content->>'label')) STORED,
  ADD COLUMN IF NOT EXISTS reference text
    GENERATED ALWAYS AS (assets->>'propertyId') STORED,
  ADD COLUMN IF NOT EXISTS cover_image text
    GENERATED ALWAYS AS (coalesce(assets->'hero'->>'fallbackImage', content->>'image')) STORED,
  ADD COLUMN IF NOT EXISTS property_type text
    GENERATED ALWAYS AS (content->>'defaultPropertyType') STORED,
  ADD COLUMN IF NOT EXISTS price numeric
    GENERATED ALWAYS AS (
      CASE WHEN content->>'referencePrice' ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (content->>'referencePrice')::numeric END
    ) STORED,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';

CREATE INDEX IF NOT EXISTS idx_properties_status ON public.properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_org    ON public.properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_agent  ON public.properties(agent_id);
CREATE INDEX IF NOT EXISTS idx_properties_order  ON public.properties(display_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_single_default
  ON public.properties((is_default)) WHERE is_default;

DROP TRIGGER IF EXISTS touch_properties ON public.properties;
CREATE TRIGGER touch_properties BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_organizations ON public.organizations;
CREATE TRIGGER touch_organizations BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_agents ON public.agents;
CREATE TRIGGER touch_agents BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2c · Audits
CREATE TABLE IF NOT EXISTS public.audits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  property_id  uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'requested',
  document_url text,
  summary      jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by text,
  completed_at timestamptz,
  CONSTRAINT audits_status_valid CHECK (
    status IN ('requested','in_progress','completed','cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_audits_property ON public.audits(property_id, created_at DESC);

DROP TRIGGER IF EXISTS touch_audits ON public.audits;
CREATE TRIGGER touch_audits BEFORE UPDATE ON public.audits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2d · Concierge
CREATE TABLE IF NOT EXISTS public.concierge_conversations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  property_id    uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  property_slug  text,
  session_id     text,
  lang           text NOT NULL DEFAULT 'en',
  message_count  integer NOT NULL DEFAULT 0,
  total_cost_usd numeric(10,5) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_conversations_property ON public.concierge_conversations(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_session  ON public.concierge_conversations(session_id);

CREATE TABLE IF NOT EXISTS public.concierge_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  conversation_id uuid NOT NULL REFERENCES public.concierge_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL,
  content         text NOT NULL,
  confidence      text,
  interests       text[] NOT NULL DEFAULT '{}',
  source          text,
  usage           jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT concierge_messages_role_valid CHECK (role IN ('user','assistant'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.concierge_messages(conversation_id, created_at);

DROP TRIGGER IF EXISTS touch_conversations ON public.concierge_conversations;
CREATE TRIGGER touch_conversations BEFORE UPDATE ON public.concierge_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2e · Wire existing tables (from migration 001 §6)
ALTER TABLE public.leads            ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;
ALTER TABLE public.sessions         ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_property_id    ON public.leads(property_id);
CREATE INDEX IF NOT EXISTS idx_sessions_property_id ON public.sessions(property_id);
CREATE INDEX IF NOT EXISTS idx_events_property_id   ON public.analytics_events(property_id);

-- 2f · RLS + open policies (migration 001 §7)
ALTER TABLE public.organizations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_messages       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon reads published properties" ON public.properties
  FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "anon inserts conversations" ON public.concierge_conversations
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon updates conversations" ON public.concierge_conversations
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon inserts messages" ON public.concierge_messages
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "authenticated all organizations" ON public.organizations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated all agents" ON public.agents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated all properties" ON public.properties
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated all audits" ON public.audits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated reads conversations" ON public.concierge_conversations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated reads messages" ON public.concierge_messages
  FOR SELECT TO authenticated USING (true);


-- ═════════════════════════════════════════════════════════════════════
-- 3 · SUPABASE-FIX-RLS — leads, sessions, analytics_events policies
-- ═════════════════════════════════════════════════════════════════════
ALTER TABLE public.leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon inserts leads"    ON public.leads            FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon inserts sessions" ON public.sessions         FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon inserts events"   ON public.analytics_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon updates sessions" ON public.sessions FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "authenticated reads leads"    ON public.leads            FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated reads sessions" ON public.sessions         FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated reads events"   ON public.analytics_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated updates leads"  ON public.leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- ═════════════════════════════════════════════════════════════════════
-- 4 · MIGRATION 003 + 004 — concierge conversation unique index
-- ═════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS uniq_conversation_session_property
  ON public.concierge_conversations (session_id, property_slug);


-- ═════════════════════════════════════════════════════════════════════
-- 5 · Verify bootstrap
-- ═════════════════════════════════════════════════════════════════════
SELECT table_name, count(*) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('organizations','agents','properties','audits',
                     'concierge_conversations','concierge_messages',
                     'leads','sessions','analytics_events')
GROUP BY table_name ORDER BY table_name;
