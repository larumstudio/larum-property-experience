/* ── Larum — M6.0 — Post-apply verification (READ-ONLY) ───────────────
   Run this AFTER applying 006_lead_agent_id_resolve.sql for real.

   Every query below is SELECT-only. Nothing here writes, disables a
   trigger, or changes any row. Safe to run against production at any
   time, repeatedly, with zero side effects.

   Run in Supabase → SQL Editor → new tab → paste → Run all → read each
   result set against its EXPECTED note.
   ─────────────────────────────────────────────────────────────────── */


-- ═══ 1. TRIGGER EXISTS AND IS ENABLED ════════════════════════════════
SELECT
  tgname,
  tgrelid::regclass AS on_table,
  CASE tgenabled
    WHEN 'O' THEN 'enabled'
    WHEN 'D' THEN 'DISABLED'
    WHEN 'R' THEN 'replica-only'
    WHEN 'A' THEN 'always'
    ELSE tgenabled::text
  END AS status
FROM pg_trigger
WHERE tgname = 'resolve_lead_agent_id';

/* EXPECTED: 1 row. on_table = leads. status = enabled.
   If 0 rows → migration was not applied.
   If status = DISABLED → something disabled it after apply; investigate. */


-- ═══ 2. FUNCTION EXISTS, SECURITY DEFINER, search_path PINNED ════════
SELECT
  proname,
  prosecdef AS is_security_definer,
  proconfig AS config  -- should include search_path=public,pg_temp
FROM pg_proc
WHERE proname = 'resolve_lead_agent_id';

/* EXPECTED: 1 row. is_security_definer = true.
   config contains 'search_path=public, pg_temp'. */


-- ═══ 3. TRIGGER FIRES ON INSERT ONLY (never UPDATE) ══════════════════
SELECT
  tgname,
  CASE
    WHEN tgtype & 4 = 4 THEN 'INSERT'
    WHEN tgtype & 16 = 16 THEN 'UPDATE'
    ELSE 'other'
  END AS fires_on
FROM pg_trigger
WHERE tgname = 'resolve_lead_agent_id';

/* EXPECTED: 1 row, fires_on = INSERT. Never UPDATE — see
   006_lead_agent_id_resolve.sql header for why this is deliberate. */


-- ═══ 4. LEADS WITH A VALID PROPERTY STILL MISSING agent_id ═══════════
-- Non-zero here is not automatically a bug — a property with no agent
-- assigned correctly produces agent_id = NULL. This query exists to
-- let a human eyeball WHY each one is still NULL.
SELECT
  l.id,
  l.created_at,
  l.property,
  l.agent_id,
  p.id        AS matched_property_id,
  p.agent_id  AS property_agent_id,
  CASE
    WHEN p.id IS NULL THEN 'no matching property (see query 8)'
    WHEN p.agent_id IS NULL THEN 'property has no agent assigned — correct NULL'
    ELSE 'unexpected — property has an agent but lead does not; investigate'
  END AS reason
FROM public.leads l
LEFT JOIN public.properties p ON p.slug = l.property
WHERE l.agent_id IS NULL AND l.property IS NOT NULL
ORDER BY l.created_at DESC;

/* EXPECTED: every row's `reason` is either "no matching property" or
   "property has no agent assigned — correct NULL". Any row reading
   "unexpected" means a lead's property has an agent but the lead
   itself does not — that would indicate the trigger or backfill missed
   a row and needs investigation. */


-- ═══ 5. LEADS WHOSE agent_id DOES NOT MATCH THEIR PROPERTY'S CURRENT
--        AGENT — expected and healthy, not a bug ═════════════════════
-- leads.agent_id is a point-in-time snapshot (by design, see
-- 006_authorization_foundation.sql §3): if a property's agent is later
-- reassigned, existing leads correctly KEEP their original agent_id.
-- This query surfaces how many leads currently show that drift — purely
-- informational.
SELECT
  count(*) AS leads_with_drifted_agent,
  count(*) FILTER (WHERE p.agent_id IS NULL) AS property_now_unassigned,
  count(*) FILTER (WHERE p.agent_id IS NOT NULL) AS property_now_different_agent
FROM public.leads l
JOIN public.properties p ON p.slug = l.property
WHERE l.agent_id IS NOT NULL
  AND l.agent_id IS DISTINCT FROM p.agent_id;

/* EXPECTED: any number ≥ 0. This is NOT an error count — it is the
   count of leads whose ownership snapshot has legitimately diverged
   from the property's current assignment since the lead was created. */


-- ═══ 6. DISTRIBUTION OF LEADS PER AGENT ══════════════════════════════
SELECT
  a.name  AS agent_name,
  a.status AS agent_status,
  count(l.id) AS lead_count
FROM public.agents a
LEFT JOIN public.leads l ON l.agent_id = a.id
GROUP BY a.id, a.name, a.status
ORDER BY lead_count DESC;

/* EXPECTED: one row per agent, plus agents with 0 leads still listed
   (LEFT JOIN). Sanity-check against what you'd expect from the
   properties each agent is assigned to. */


-- ═══ 7. PROPERTIES WITH AN AGENT ASSIGNED ════════════════════════════
SELECT
  count(*) AS total_properties,
  count(*) FILTER (WHERE agent_id IS NOT NULL) AS with_agent,
  count(*) FILTER (WHERE agent_id IS NULL)     AS without_agent
FROM public.properties;

/* EXPECTED: with_agent + without_agent = total_properties. Cross-check
   this against what admin-properties.js shows before trusting query 6. */


-- ═══ 8. LEADS WITH NO MATCHING PROPERTY AT ALL ═══════════════════════
-- A lead whose `property` slug matches nothing in `properties` — either
-- a typo'd/legacy slug, or a property that has since been renamed
-- (slugs are meant to never be reused, per the schema comment on
-- properties.slug, but this query catches it if it ever happens).
SELECT
  l.id,
  l.created_at,
  l.property,
  l.agent_id
FROM public.leads l
WHERE l.property IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.slug = l.property)
ORDER BY l.created_at DESC;

/* EXPECTED: ideally 0 rows. Any row here is a lead orphaned from its
   property — property_id and agent_id are both correctly NULL for
   these (neither trigger can resolve a slug that doesn't exist), but
   it is worth knowing they exist. */
