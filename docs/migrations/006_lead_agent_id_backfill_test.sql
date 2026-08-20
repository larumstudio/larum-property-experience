/* ── Larum — M6.0 — Deterministic backfill proof ──────────────────────
   Companion to 006_lead_agent_id_resolve.sql §3 (the backfill UPDATE).

   PURPOSE: prove, with real assertions that RAISE EXCEPTION on failure
   (not a SELECT you have to eyeball), that the backfill:
     1. actually changes a pre-existing NULL agent_id to the correct
        value, and
     2. is idempotent — running it a second time changes nothing further
        and does not corrupt the value it just set.

   SAFE TO RUN ANYWHERE, INCLUDING BY ACCIDENT ON PRODUCTION: the entire
   script runs inside one transaction that ends in ROLLBACK. Nothing it
   creates, disables, or updates survives past the final line — not the
   fixtures, not the trigger disable, nothing. This is deliberate: unlike
   006_lead_agent_id_resolve.sql itself (which the operator must apply
   for real, once, in the SQL Editor), this file exists purely to prove
   the backfill logic works, and proving that must never itself leave a
   mark. Intended for the isolated Supabase project primarily, but the
   ROLLBACK makes it harmless even if pointed at production.

   PRECONDITION: 006_authorization_foundation.sql AND
   006_lead_agent_id_resolve.sql §1–2 (the trigger itself) must already
   be applied in whatever project this runs against — this script tests
   the BACKFILL statement only, reusing the exact statements from
   006_lead_agent_id_resolve.sql §3 verbatim.

   Run in Supabase → SQL Editor → new tab → paste → Run. Read the
   NOTICE lines in the output; if anything is wrong you get a SQL
   EXCEPTION with a clear message instead of the script completing.
   ─────────────────────────────────────────────────────────────────── */

BEGIN;

-- ═══ 0. NAMESPACED FIXTURES (rolled back at the end, never persisted) ═
DO $$
DECLARE
  v_org_id       uuid;
  v_agent_x_id   uuid;
  v_prop_x_id    uuid;
  v_lead_a_id    uuid;
  v_check        uuid;
  v_null_count_1 integer;
  v_null_count_2 integer;
BEGIN
  -- Fixtures: one org, one agent (AGENT_X), one property (X) owned by
  -- AGENT_X, one lead (A) for property X inserted directly (bypassing
  -- the resolve_lead_agent_id trigger on purpose, via an explicit
  -- agent_id override that we immediately null back out) so lead A
  -- starts in the exact "pre-existing NULL" state the backfill exists
  -- to fix — simulating a row that was inserted before this migration
  -- ever ran.

  INSERT INTO public.organizations (name, slug, status)
  VALUES ('M6.0 Backfill Test Org', 'm60-backfill-test-org-' || gen_random_uuid(), 'active')
  RETURNING id INTO v_org_id;

  INSERT INTO public.agents (organization_id, name, slug, email, status)
  VALUES (v_org_id, 'M6.0 Backfill Agent X', 'm60-backfill-agent-x-' || gen_random_uuid(), 'm60-backfill-x@example.invalid', 'active')
  RETURNING id INTO v_agent_x_id;

  INSERT INTO public.properties (organization_id, agent_id, slug, status, content)
  VALUES (v_org_id, v_agent_x_id, 'm60-backfill-prop-x-' || gen_random_uuid(), 'published', '{"title":{"en":"M6.0 Backfill Property X"}}'::jsonb)
  RETURNING id INTO v_prop_x_id;

  -- Insert lead A referencing property X's slug, but force agent_id
  -- back to NULL immediately after — this is what a lead inserted
  -- BEFORE 006_lead_agent_id_resolve.sql existed looks like today.
  INSERT INTO public.leads (property, agent_id, name, email)
  VALUES ((SELECT slug FROM public.properties WHERE id = v_prop_x_id), NULL, 'M6.0 Backfill Lead A', 'm60-backfill-lead-a@example.invalid')
  RETURNING id INTO v_lead_a_id;

  RAISE NOTICE '── FIXTURES CREATED ── org=% agentX=% propX=% leadA=%', v_org_id, v_agent_x_id, v_prop_x_id, v_lead_a_id;

  -- ═══ 1. BEFORE ASSERTION ═══════════════════════════════════════════
  SELECT agent_id INTO v_check FROM public.leads WHERE id = v_lead_a_id;
  IF v_check IS NOT NULL THEN
    RAISE EXCEPTION 'BEFORE check FAILED: lead A agent_id should be NULL, got %', v_check;
  END IF;
  RAISE NOTICE 'BEFORE check PASSED: lead A agent_id = NULL (property X has agent_id = %)', v_agent_x_id;

  -- ═══ 2. RUN THE BACKFILL — statements copied verbatim from
  --        006_lead_agent_id_resolve.sql §3 ══════════════════════════
  ALTER TABLE public.leads DISABLE TRIGGER protect_leads_boundary;

  UPDATE public.leads
  SET agent_id = (
    SELECT p.agent_id FROM public.properties p WHERE p.slug = leads.property LIMIT 1
  )
  WHERE agent_id IS NULL AND property IS NOT NULL;

  ALTER TABLE public.leads ENABLE TRIGGER protect_leads_boundary;

  -- ═══ 3. AFTER ASSERTION — lead A must now equal AGENT_X exactly ════
  SELECT agent_id INTO v_check FROM public.leads WHERE id = v_lead_a_id;
  IF v_check IS DISTINCT FROM v_agent_x_id THEN
    RAISE EXCEPTION 'AFTER check FAILED: expected lead A agent_id = %, got %', v_agent_x_id, v_check;
  END IF;
  RAISE NOTICE 'AFTER check PASSED: lead A agent_id = % (matches property X)', v_check;

  -- Snapshot how many leads still have a resolvable-looking gap
  -- (agent_id NULL but property present) before running backfill again —
  -- used to prove idempotency below.
  SELECT count(*) INTO v_null_count_1
  FROM public.leads WHERE agent_id IS NULL AND property IS NOT NULL;

  -- ═══ 4. RUN THE BACKFILL A SECOND TIME — idempotency proof ═════════
  ALTER TABLE public.leads DISABLE TRIGGER protect_leads_boundary;

  UPDATE public.leads
  SET agent_id = (
    SELECT p.agent_id FROM public.properties p WHERE p.slug = leads.property LIMIT 1
  )
  WHERE agent_id IS NULL AND property IS NOT NULL;

  ALTER TABLE public.leads ENABLE TRIGGER protect_leads_boundary;

  SELECT count(*) INTO v_null_count_2
  FROM public.leads WHERE agent_id IS NULL AND property IS NOT NULL;

  IF v_null_count_2 IS DISTINCT FROM v_null_count_1 THEN
    RAISE EXCEPTION 'IDEMPOTENCY check FAILED: still-NULL count changed on 2nd run (% → %) — backfill is not idempotent', v_null_count_1, v_null_count_2;
  END IF;

  -- Lead A specifically must still be exactly AGENT_X, not touched,
  -- not duplicated, not nulled back out by the second run.
  SELECT agent_id INTO v_check FROM public.leads WHERE id = v_lead_a_id;
  IF v_check IS DISTINCT FROM v_agent_x_id THEN
    RAISE EXCEPTION 'IDEMPOTENCY check FAILED: lead A agent_id changed on 2nd run — expected %, got %', v_agent_x_id, v_check;
  END IF;

  RAISE NOTICE 'IDEMPOTENCY check PASSED: 2nd backfill run changed nothing (still-NULL count % both times, lead A still %)', v_null_count_1, v_check;

  RAISE NOTICE '── ALL BACKFILL ASSERTIONS PASSED ──';
END $$;

-- ═══ 5. ROLLBACK — fixtures, trigger disable/enable, and every write
--        above vanish. This script has zero effect on real data. ═════
ROLLBACK;
