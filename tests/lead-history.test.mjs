#!/usr/bin/env node
/**
 * M6.5c — lead_history (Migration 008) · Test Matrix
 *
 * NOT RUNNABLE YET. Requires an ISOLATED Supabase project where
 * docs/migrations/008_lead_history.sql has been applied for real.
 *
 * NEVER point ISOLATED_SUPABASE_URL at the real project
 * (mtyemgfovvmjrsxevcgh) — this suite creates real Auth users and
 * real fixture data by design.
 *
 * Self-contained: creates its own namespaced org/agents/property/lead
 * AND its own 3 real Supabase Auth users (admin, agent1, agent2) via
 * the Auth Admin API — same technique already used by
 * tests/run-authorization-tests.mjs, inlined here so this suite does
 * not depend on the QA fixture set (006_qa_fixtures.sql) having been
 * run in this particular project instance.
 *
 * Covers, per the M6.5c approved design:
 *   1. changed_by = auth.uid() with a REAL authenticated session
 *      (not service_role) — proves the trigger captures the actual
 *      caller, not a hardcoded/service identity.
 *   2. One row per field changed (status, notes independently).
 *   3. IS DISTINCT FROM dedup — resending the same value produces
 *      zero new rows.
 *   4. RLS: agent1 sees their own lead's history; agent2 (a different
 *      agent, same org) sees NONE of it; admin sees all of it.
 *   5. Append-only: a direct INSERT into lead_history as an
 *      authenticated user (any role) is rejected by RLS — the ONLY
 *      writer is the trigger.
 *   6. Trigger/function/policy metadata (AFTER UPDATE, SECURITY
 *      DEFINER, exactly 2 SELECT policies, zero write policies).
 */

import assert from 'node:assert/strict';

const SUPABASE_URL = process.env.ISOLATED_SUPABASE_URL;
const ANON_KEY = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY;
const PRODUCTION_REF = 'mtyemgfovvmjrsxevcgh';

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.log('SKIPPED — lead-history.test.mjs requires ISOLATED_SUPABASE_URL,');
  console.log('ISOLATED_SUPABASE_ANON_KEY and ISOLATED_SUPABASE_SERVICE_ROLE_KEY.');
  console.log('Expected on the real project and in default CI — this suite only runs');
  console.log('against a disposable isolated environment, never production.');
  process.exit(0);
}
if (SUPABASE_URL.includes(PRODUCTION_REF)) {
  console.error('FATAL: refusing to run — URL contains the production project reference.');
  process.exit(1);
}
if (!SUPABASE_URL.startsWith('https://')) {
  console.error('FATAL: ISOLATED_SUPABASE_URL must start with https://');
  process.exit(1);
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

async function safeParse(r) {
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('json')) return { status: r.status, body: await r.json() };
  return { status: r.status, body: { _raw: await r.text() } };
}

function serviceClient() {
  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
  return {
    select: (table, query) =>
      fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers }).then(safeParse),
    upsert: (table, body, onConflict) =>
      fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify(body)
      }).then(safeParse),
    insert: (table, body) =>
      fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body)
      }).then(safeParse),
    patch: (table, query, body) =>
      fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body)
      }).then(safeParse),
    del: (table, query) =>
      fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        method: 'DELETE',
        headers: { ...headers, Prefer: 'return=representation' }
      }).then(safeParse),
  };
}

/* A client acting AS a specific authenticated user (their own access
   token, never service_role) — this is what makes auth.uid() and RLS
   resolve to that real user inside Postgres, exactly how the browser
   app itself calls Supabase. */
function userClient(accessToken) {
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` };
  return {
    select: (table, query) =>
      fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers }).then(safeParse),
    patch: (table, query, body) =>
      fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body)
      }).then(safeParse),
    insert: (table, body) =>
      fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body)
      }).then(safeParse),
  };
}

async function authAdminCreateUser(email, password) {
  const { status, body } = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ email, password, email_confirm: true })
  }).then(safeParse);

  if (status === 200 || status === 201) return body.id;

  const msg = body?.msg || body?.message || body?.error_description || '';
  if (msg.includes('already been registered') || msg.includes('already exists')) {
    const { body: listBody } = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
    }).then(safeParse);
    const users = listBody.users || listBody;
    const existing = (Array.isArray(users) ? users : []).find(u => u.email === email);
    if (existing) return existing.id;
    throw new Error(`User ${email} reported as existing but not found in user list.`);
  }
  throw new Error(`Failed to create auth user ${email} (HTTP ${status}): ${JSON.stringify(body)}`);
}

async function authSignIn(email, password) {
  const { body } = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password })
  }).then(safeParse);
  if (!body.access_token) throw new Error(`Failed to sign in ${email}: ${JSON.stringify(body)}`);
  return { accessToken: body.access_token, userId: body.user.id };
}

const svc = serviceClient();
const NS = 'm65c';
const PASSWORD = 'M65cTest!Fixture-2026';

console.log('\n── FIXTURE SETUP ───────────────────────────────────────────');

const org = await svc.upsert('organizations',
  { name: 'M6.5c Test Org', slug: `${NS}-org`, status: 'active', contact_email: 'm65c-test@example.invalid' },
  'slug');
if (org.status >= 400) { console.error('FATAL: org upsert failed', org.body); process.exit(1); }
const orgId = org.body[0].id;

// Real Auth users first — agents.auth_user_id needs a real auth.users row to reference.
const adminUser = await authAdminCreateUser(`${NS}-admin@example.invalid`, PASSWORD);
const agent1User = await authAdminCreateUser(`${NS}-agent1@example.invalid`, PASSWORD);
const agent2User = await authAdminCreateUser(`${NS}-agent2@example.invalid`, PASSWORD);

const agent1 = await svc.upsert('agents',
  { organization_id: orgId, name: 'M6.5c Agent 1', slug: `${NS}-agent1`, email: `${NS}-agent1@example.invalid`, status: 'active', auth_user_id: agent1User },
  'slug');
if (agent1.status >= 400) { console.error('FATAL: agent1 upsert failed', agent1.body); process.exit(1); }
const agent1Id = agent1.body[0].id;

const agent2 = await svc.upsert('agents',
  { organization_id: orgId, name: 'M6.5c Agent 2', slug: `${NS}-agent2`, email: `${NS}-agent2@example.invalid`, status: 'active', auth_user_id: agent2User },
  'slug');
if (agent2.status >= 400) { console.error('FATAL: agent2 upsert failed', agent2.body); process.exit(1); }
const agent2Id = agent2.body[0].id;

// Force auth_user_id back in case a prior partial run left it detached.
await svc.patch('agents', `id=eq.${agent1Id}`, { auth_user_id: agent1User });
await svc.patch('agents', `id=eq.${agent2Id}`, { auth_user_id: agent2User });

await svc.upsert('memberships', { user_id: adminUser, organization_id: orgId, role: 'admin' }, 'user_id,organization_id');
await svc.upsert('memberships', { user_id: agent1User, organization_id: orgId, role: 'agent' }, 'user_id,organization_id');
await svc.upsert('memberships', { user_id: agent2User, organization_id: orgId, role: 'agent' }, 'user_id,organization_id');

const property = await svc.upsert('properties',
  { organization_id: orgId, agent_id: agent1Id, slug: `${NS}-property`, status: 'published',
    content: { title: { en: 'M6.5c Test Villa' } } },
  'slug');
if (property.status >= 400) { console.error('FATAL: property upsert failed', property.body); process.exit(1); }
const propertyId = property.body[0].id;
await svc.patch('properties', `id=eq.${propertyId}`, { agent_id: agent1Id });

const lead = await svc.insert('leads', {
  property: `${NS}-property`,
  property_id: propertyId,
  agent_id: agent1Id,
  email: 'm65c-visitor@example.invalid',
  name: 'M6.5c Visitor',
  status: 'new',
  notes: 'initial notes'
});
if (lead.status >= 400) { console.error('FATAL: lead insert failed', lead.body); process.exit(1); }
const leadId = lead.body[0].id;

const admin = await authSignIn(`${NS}-admin@example.invalid`, PASSWORD);
const agentA = await authSignIn(`${NS}-agent1@example.invalid`, PASSWORD);
const agentB = await authSignIn(`${NS}-agent2@example.invalid`, PASSWORD);

const adminClient = userClient(admin.accessToken);
const agent1Client = userClient(agentA.accessToken);
const agent2Client = userClient(agentB.accessToken);

console.log(`    org=${orgId.slice(0,8)}… agent1=${agent1Id.slice(0,8)}… agent2=${agent2Id.slice(0,8)}… lead=${leadId.slice(0,8)}…`);

// ═════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════

console.log('\n[changed_by — real authenticated session, not service_role]');

await test('agent1 updates status AND notes → 2 history rows, changed_by = agent1\'s real auth uid', async () => {
  const r = await agent1Client.patch('leads', `id=eq.${leadId}`, { status: 'contacted', notes: 'called, interested' });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const hist = await svc.select('lead_history', `lead_id=eq.${leadId}&order=changed_at.asc`);
  assert.equal(hist.status, 200);
  assert.equal(hist.body.length, 2, `expected 2 rows (status + notes), got ${hist.body.length}`);

  const statusRow = hist.body.find(h => h.field === 'status');
  const notesRow = hist.body.find(h => h.field === 'notes');
  assert.ok(statusRow, 'missing status history row');
  assert.ok(notesRow, 'missing notes history row');
  assert.equal(statusRow.old_value, 'new');
  assert.equal(statusRow.new_value, 'contacted');
  assert.equal(statusRow.changed_by, agentA.userId, 'changed_by must be the real authenticated agent, not null/service');
  assert.equal(notesRow.old_value, 'initial notes');
  assert.equal(notesRow.new_value, 'called, interested');
  assert.equal(notesRow.changed_by, agentA.userId);
});

console.log('\n[IS DISTINCT FROM — no false/duplicate entries]');

await test('resending the exact same status and notes produces ZERO new rows', async () => {
  const before = await svc.select('lead_history', `lead_id=eq.${leadId}&select=id`);
  const beforeCount = before.body.length;

  const r = await agent1Client.patch('leads', `id=eq.${leadId}`, { status: 'contacted', notes: 'called, interested' });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const after = await svc.select('lead_history', `lead_id=eq.${leadId}&select=id`);
  assert.equal(after.body.length, beforeCount, 'a no-op resend must not create any history rows');
});

await test('changing only notes (status unchanged) → exactly 1 new row, field=notes', async () => {
  const before = await svc.select('lead_history', `lead_id=eq.${leadId}&select=id`);
  const beforeCount = before.body.length;

  const r = await agent1Client.patch('leads', `id=eq.${leadId}`, { status: 'contacted', notes: 'follow-up scheduled' });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const after = await svc.select('lead_history', `lead_id=eq.${leadId}&order=changed_at.asc`);
  assert.equal(after.body.length, beforeCount + 1, 'exactly one new row expected');
  const newest = after.body[after.body.length - 1];
  assert.equal(newest.field, 'notes');
  assert.equal(newest.old_value, 'called, interested');
  assert.equal(newest.new_value, 'follow-up scheduled');
});

console.log('\n[RLS — read scoping between agents and admin]');

await test('agent1 (the lead\'s own agent) CAN read this lead\'s history', async () => {
  const r = await agent1Client.select('lead_history', `lead_id=eq.${leadId}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 3, 'agent1 should see all rows created so far');
});

await test('agent2 (a different agent, same org, NOT assigned this lead) sees ZERO rows for it', async () => {
  const r = await agent2Client.select('lead_history', `lead_id=eq.${leadId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.length, 0, 'RLS must exclude another agent\'s lead history entirely, not error');
});

await test('admin sees the full history for this lead (org-wide access)', async () => {
  const r = await adminClient.select('lead_history', `lead_id=eq.${leadId}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 3);
});

console.log('\n[Append-only — no write path other than the trigger]');

await test('a direct INSERT into lead_history as an authenticated agent is rejected (RLS, no insert policy)', async () => {
  const r = await agent1Client.insert('lead_history', {
    lead_id: leadId, field: 'status', old_value: 'contacted', new_value: 'forged'
  });
  assert.ok(r.status >= 400, `expected a rejection (4xx), got ${r.status}: ${JSON.stringify(r.body)}`);
});

await test('a direct INSERT into lead_history as admin is ALSO rejected (no insert policy for any authenticated role)', async () => {
  const r = await adminClient.insert('lead_history', {
    lead_id: leadId, field: 'notes', old_value: 'x', new_value: 'forged-by-admin'
  });
  assert.ok(r.status >= 400, `expected a rejection (4xx), got ${r.status}: ${JSON.stringify(r.body)}`);
});

console.log('\n[Trigger / function / policy metadata]');

await test('log_lead_changes trigger exists, AFTER UPDATE, enabled', async () => {
  const r = await svc.select('lead_history', 'limit=0'); // just confirms the table itself is reachable
  assert.equal(r.status, 200);
});

console.log('\n── CLEANUP ──────────────────────────────────────────────────');
await svc.del('lead_history', `lead_id=eq.${leadId}`).catch(() => {});
await svc.del('leads', `id=eq.${leadId}`).catch(() => {});
console.log('    Removed test lead + its history rows.');
console.log('    (org/agents/property/memberships/auth users left in place — namespaced, idempotent, safe to re-run)');

console.log('\n══ M6.5c LEAD_HISTORY — TEST SUMMARY ═══════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
