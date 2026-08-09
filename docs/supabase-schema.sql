-- ═══════════════════════════════════════════════════════════════
-- Larum Property Experience — Supabase Schema
--
-- Reference only: this is the shape of the live tables. The script that
-- must actually be run is docs/supabase-fix-rls.sql — it owns the
-- policies, and the policies at the bottom of this file are the ones
-- that were never applied.
-- ═══════════════════════════════════════════════════════════════

-- Leads table: structured data from enquiry form
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
  session_id TEXT            -- links the lead to its row in sessions
);

-- Analytics events: every tracked interaction
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  property TEXT NOT NULL,
  lang TEXT DEFAULT 'en',
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  session_id TEXT
);

-- Sessions: aggregates per visitor session
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_property ON public.leads(property);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_property ON public.analytics_events(property);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_property ON public.sessions(property);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON public.sessions(created_at DESC);

-- RLS policies: anon can INSERT, only authenticated can read
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Anyone can insert leads (from the form)
CREATE POLICY "Allow anon insert leads" ON public.leads
  FOR INSERT WITH CHECK (true);

-- Anyone can insert events (from the experience)
CREATE POLICY "Allow anon insert events" ON public.analytics_events
  FOR INSERT WITH CHECK (true);

-- Anyone can insert sessions
CREATE POLICY "Allow anon insert sessions" ON public.sessions
  FOR INSERT WITH CHECK (true);

-- Only authenticated users can read (admin panel)
CREATE POLICY "Allow authenticated read leads" ON public.leads
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read events" ON public.analytics_events
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read sessions" ON public.sessions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Authenticated users can update leads (for status, notes, follow-up)
CREATE POLICY "Allow authenticated update leads" ON public.leads
  FOR UPDATE USING (auth.role() = 'authenticated');
