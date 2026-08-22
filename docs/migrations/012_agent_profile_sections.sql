/* ── Larum — Migration 012 — Agent profile sections ──────────────────
   ADDITIVE: only adds columns to the existing `agents` table.

   Adds the data behind three new public agent-page sections
   (Testimonials, Track record / stats, Credentials) plus a way for an
   agent on the personal-page-only tier to list properties that live
   outside Larum — e.g. a portal listing (Idealista) — alongside any
   Larum-elaborated property experiences they may also have.

   No RLS changes needed: "anon reads active agents" (migration 009)
   already grants anon SELECT on every column of an active agent's row,
   and the admin's existing "agents admin manages own org" / self-update
   policies already cover UPDATE on any column. These are just new jsonb
   columns on a table those policies already govern.

   Shapes (all default to an empty array — consume-when-present, same
   pattern as bio's {en, es} default):

     testimonials      — [{ quote: {en, es}, author, context }]
                          context = free text, e.g. "Buyer, Marbella"
     credentials       — [{ label: {en, es} }]
                          licenses, awards, memberships, languages spoken
     stats             — [{ value, label: {en, es} }]
                          value is free text ("15+", "€120M", "200+") so
                          it fits any metric without a fixed schema
     external_listings — [{ title: {en, es}, url, image_url, location,
                             price_label }]
                          price_label is free text (not price+currency)
                          since it's copied from an external portal, not
                          computed by Larum
   ─────────────────────────────────────────────────────────────────── */

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS testimonials jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS credentials jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS stats jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS external_listings jsonb NOT NULL DEFAULT '[]';

-- ═══ VERIFY ═══════════════════════════════════════════════════════════
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agents'
  AND column_name IN ('testimonials', 'credentials', 'stats', 'external_listings')
ORDER BY column_name;
