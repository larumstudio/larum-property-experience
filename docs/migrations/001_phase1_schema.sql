-- ═══════════════════════════════════════════════════════════════════════
-- LARUM — PHASE 1 · MILESTONE 2
-- Canonical property entity, ownership chain, concierge persistence.
--
--   Supabase → SQL Editor → New query → paste → Run.
--   Idempotent: safe to run more than once.
--
-- This is a MIGRATION, not a replacement. leads, sessions and
-- analytics_events keep every row and keep their text `property` column;
-- they gain a `property_id` foreign key, backfilled from the slug.
-- Nothing is dropped by this script.
--
-- Run 002_seed_properties.sql immediately after this one.
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 1 · updated_at, kept honest by a trigger rather than by the caller
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- 2 · ORGANIZATION → AGENT
--
-- Larum itself is the first organization. The chain exists now so that
-- Agent Presence (phase 2) is a view over data that already exists,
-- rather than a migration of everything that came before it.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'active',      -- active | archived
  contact_email text,
  notes         text
);

CREATE TABLE IF NOT EXISTS public.agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  slug            text UNIQUE,                       -- reserved: Agent Presence URL
  email           text,
  phone           text,
  agency          text,                              -- Christie's, NVOGA…
  role            text,
  photo_url       text,
  bio             jsonb NOT NULL DEFAULT '{}'::jsonb,-- {es, en} — phase 2
  status          text NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_agents_org ON public.agents(organization_id);


-- ─────────────────────────────────────────────────────────────────────
-- 3 · PROPERTY — the central entity
--
-- The split is deliberate:
--
--   relational  → what the admin filters, sorts and owns (slug, status,
--                 ownership, lifecycle). None of this exists in the JSON
--                 contract today; it is new operational data.
--   jsonb       → content / knowledge / assets, byte-identical to
--                 properties/{slug}/*.json. Normalising that contract
--                 would take a dozen tables and would invalidate the
--                 286-line validator in property-loader.js, which is the
--                 asset Phase 1 is explicitly told to preserve.
--   generated   → list columns derived FROM the jsonb, so a title shown
--                 in the admin can never drift from the title the
--                 experience renders. They are read-only by design.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.properties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,

  organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
  agent_id        uuid REFERENCES public.agents(id)        ON DELETE SET NULL,

  -- URL identity. Never reuse a slug: shared links outlive properties.
  slug            text NOT NULL UNIQUE,

  -- draft → in_production → ready → published → archived
  status          text NOT NULL DEFAULT 'draft',

  -- The editorial contract, unchanged.
  content         jsonb NOT NULL DEFAULT '{}'::jsonb,
  knowledge       jsonb NOT NULL DEFAULT '{}'::jsonb,
  assets          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Registry duties that properties/index.json used to carry.
  display_order   integer NOT NULL DEFAULT 0,
  is_default      boolean NOT NULL DEFAULT false,

  CONSTRAINT properties_status_valid CHECK (
    status IN ('draft','in_production','ready','published','archived')
  ),
  CONSTRAINT properties_slug_shape CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Derived list columns. `coalesce(x->>'en', x #>> '{}')` accepts both the
-- legacy plain string and the bilingual {es,en} object, which is what lets
-- the two contracts coexist while the properties are translated.
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
  -- Guarded cast: a half-filled draft from the wizard must not fail to save.
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

-- Exactly one default property, enforced by the database rather than by
-- whoever remembers to untick the previous one.
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


-- ─────────────────────────────────────────────────────────────────────
-- 4 · AUDIT
--
-- The audit engine is a Claude skill that produces a document. Per §23 of
-- the Phase 1 spec this migration establishes the relationship and the
-- integration point, and does not attempt to model the document itself.
-- A property may have none, one, or a history of them.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  property_id  uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'requested',  -- requested | in_progress | completed | cancelled
  document_url text,
  summary      jsonb NOT NULL DEFAULT '{}'::jsonb, -- {es, en}
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


-- ─────────────────────────────────────────────────────────────────────
-- 5 · CONCIERGE PERSISTENCE
--
-- Today a conversation exists only in the visitor's tab: eight turns in
-- memory, gone on reload. Only the visitor's questions survive, inside
-- analytics_events. What the concierge ANSWERED about a €4M residence is
-- currently unrecoverable — no audit trail, no way to improve the prompt,
-- no defence if a buyer quotes it back.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.concierge_conversations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  property_id    uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  property_slug  text,                        -- survives a deleted property
  session_id     text,                        -- ties to sessions.id
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
  confidence      text,                        -- confirmed | requires-advisor | unknown
  interests       text[] NOT NULL DEFAULT '{}',
  source          text,                        -- llm | keyword
  usage           jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT concierge_messages_role_valid CHECK (role IN ('user','assistant'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.concierge_messages(conversation_id, created_at);

DROP TRIGGER IF EXISTS touch_conversations ON public.concierge_conversations;
CREATE TRIGGER touch_conversations BEFORE UPDATE ON public.concierge_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ─────────────────────────────────────────────────────────────────────
-- 6 · WIRE THE EXISTING TABLES TO THE NEW ENTITY
--
-- Additive only. The text `property` column stays exactly where it is and
-- keeps being written, so nothing that reads it today breaks. It is
-- deprecated only once property_id has been verified in production.
--
-- ON DELETE SET NULL, never CASCADE: deleting a property must never take
-- a lead with it. A lead is a person who asked to be contacted.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.leads            ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;
ALTER TABLE public.sessions         ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_property_id    ON public.leads(property_id);
CREATE INDEX IF NOT EXISTS idx_sessions_property_id ON public.sessions(property_id);
CREATE INDEX IF NOT EXISTS idx_events_property_id   ON public.analytics_events(property_id);

-- Agent and organization are reachable from a lead through property_id in
-- one join. They are deliberately NOT copied onto leads: a denormalised
-- owner is a field that silently goes stale the first time a property
-- changes hands.


-- ─────────────────────────────────────────────────────────────────────
-- 7 · ROW LEVEL SECURITY
--
-- The public experience must read published properties with the anon key.
-- This is narrower than today, not wider: property-pack.js currently
-- serves the full content AND knowledge of EVERY property — published or
-- not — to anyone who opens the page source.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.organizations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audits                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concierge_messages       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('organizations','agents','properties','audits',
                        'concierge_conversations','concierge_messages')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- Visitors: published properties, read only. Nothing else in this block.
CREATE POLICY "anon reads published properties" ON public.properties
  FOR SELECT TO anon USING (status = 'published');

-- Visitors: the concierge writes the conversation from the browser's
-- session, the same trust model analytics already uses.
CREATE POLICY "anon inserts conversations" ON public.concierge_conversations
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon updates conversations" ON public.concierge_conversations
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon inserts messages" ON public.concierge_messages
  FOR INSERT TO anon WITH CHECK (true);

-- The signed-in operator. Broad internal access on purpose (§33): roles
-- arrive when there is a second client to separate.
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

-- Note on preview (§28): the admin opens the experience on the same
-- origin, so supabase-js finds the operator's session in localStorage and
-- the "authenticated all properties" policy lets a draft render through
-- the real production experience. No preview build, no signed tokens.


-- ─────────────────────────────────────────────────────────────────────
-- 8 · Verify
-- ─────────────────────────────────────────────────────────────────────
SELECT table_name, count(*) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('organizations','agents','properties','audits',
                     'concierge_conversations','concierge_messages',
                     'leads','sessions','analytics_events')
GROUP BY table_name ORDER BY table_name;

-- Expected after this script: 9 rows, and properties has 22 columns.
-- Next: run 002_seed_properties.sql.
