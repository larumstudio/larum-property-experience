-- ═══════════════════════════════════════════════════════════════════════
-- LARUM — MIGRATION 009
-- Agent page configurations + public read policy for agents.
--
-- Supports the Agent Experience public page: each agent can have a page
-- configuration (preset + module list) that controls the layout and
-- variant selection of their public profile page.
--
-- Also adds a read-only policy so the public page (loaded with the anon
-- key) can read active agents by slug.
--
--   Supabase → SQL Editor → New query → paste → Run.
--   Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 1 · AGENT PAGE CONFIGURATIONS
--
-- One row per agent. Stores the editorial preset and the ordered module
-- list that the public page's resolveModules() consumes. When no row
-- exists the page defaults to preset 'essential' with no configured
-- modules (all required modules render with their default variants).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_page_configurations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  agent_id   uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  preset     text NOT NULL DEFAULT 'essential',
  modules    jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT agent_page_config_agent_unique UNIQUE (agent_id),
  CONSTRAINT agent_page_config_preset_valid CHECK (
    preset IN ('signature', 'essential')
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_page_config_agent
  ON public.agent_page_configurations(agent_id);

DROP TRIGGER IF EXISTS touch_agent_page_configurations ON public.agent_page_configurations;
CREATE TRIGGER touch_agent_page_configurations
  BEFORE UPDATE ON public.agent_page_configurations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ─────────────────────────────────────────────────────────────────────
-- 2 · RLS — agent_page_configurations
--
-- Anon can read (public page loads configuration).
-- Authenticated can do everything (admin creates/updates configs).
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.agent_page_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon reads agent page configs"
  ON public.agent_page_configurations
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated manages agent page configs"
  ON public.agent_page_configurations
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────
-- 3 · RLS — public read for active agents
--
-- The agent public page needs to read the agent by slug using the anon
-- key. Only active agents are exposed. This does NOT touch any existing
-- authenticated policies (006_policies_prepared.sql owns those).
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agents'
      AND policyname = 'anon reads active agents'
  ) THEN
    CREATE POLICY "anon reads active agents"
      ON public.agents
      FOR SELECT TO anon
      USING (status = 'active');
  END IF;
END $$;
