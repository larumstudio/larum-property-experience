/* ── Larum — Migration 013 — Process, FAQ, Service areas ──────────────
   ADDITIVE: only adds columns to the existing `agents` table.

   Three more public agent-page sections, same pattern as migration 012
   (testimonials/credentials/stats/external_listings): consume-when-
   present jsonb arrays, no RLS changes needed (already covered by
   "anon reads active agents" + the admin's own-org policies).

   Shapes:
     process_steps — [{ title: {en, es}, description: {en, es} }]
                      the agent's own methodology, e.g.
                      Diagnóstico → Producción → Difusión → Negociación
     faq            — [{ question: {en, es}, answer: {en, es} }]
     service_areas  — [{ name: {en, es}, description: {en, es} }]
                       neighbourhoods/regions the agent operates in
   ─────────────────────────────────────────────────────────────────── */

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS process_steps jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS faq jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS service_areas jsonb NOT NULL DEFAULT '[]';

-- ═══ VERIFY ═══════════════════════════════════════════════════════════
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agents'
  AND column_name IN ('process_steps', 'faq', 'service_areas')
ORDER BY column_name;
