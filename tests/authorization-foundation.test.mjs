/**
 * Authorization Foundation · Test Matrix (Pre-AE III)
 *
 * NOT RUNNABLE YET. Requires an ISOLATED Supabase project/branch where
 * docs/migrations/006_authorization_foundation.sql AND
 * docs/migrations/006_policies_prepared.sql have both been applied for
 * real (old "FOR ALL USING(true)" policies actually dropped there —
 * PostgreSQL ORs permissive policies together, so restriction cannot be
 * observed while both old and new policies coexist on the same table).
 *
 * NEVER point ISOLATED_SUPABASE_URL at the real project
 * (mtyemgfovvmjrsxevcgh) — this suite creates and reads cross-org test
 * data by design and asserts on denial, which is only meaningful, and
 * only safe, against a disposable database.
 *
 * Fixture setup is handled by tests/run-authorization-tests.mjs, which
 * creates auth users, links agents, creates memberships, and passes
 * the complete ISOLATED_FIXTURES_JSON with all IDs and access tokens.
 *
 * Dependency-free (node:assert, fetch). No mocking — every assertion is
 * a real HTTP call to PostgREST, exercising the actual RLS policies.
 */

import assert from 'node:assert/strict';

const SUPABASE_URL = process.env.ISOLATED_SUPABASE_URL;
const FIXTURES = process.env.ISOLATED_FIXTURES_JSON
  ? JSON.parse(process.env.ISOLATED_FIXTURES_JSON)
  : null;

if (!SUPABASE_URL || !FIXTURES) {
  console.log('SKIPPED — authorization-foundation.test.mjs requires ISOLATED_SUPABASE_URL and');
  console.log('ISOLATED_FIXTURES_JSON (session access_token + row ids per the fixture list in');
  console.log('this file\'s header). This is expected on the real project and in CI today —');
  console.log('this suite only runs against a disposable isolated environment, never production.');
  process.exit(0);
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

function client(accessToken) {
  const headers = accessToken
    ? { apikey: FIXTURES.anonKey, Authorization: `Bearer ${accessToken}` }
    : { apikey: FIXTURES.anonKey, Authorization: `Bearer ${FIXTURES.anonKey}` };

  async function safeParse(r) {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) return { status: r.status, body: await r.json() };
    return { status: r.status, body: { _raw: await r.text() } };
  }

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
    del: (table, query) =>
      fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
        method: 'DELETE',
        headers: { ...headers, Prefer: 'return=representation' },
      }).then(safeParse),
  };
}

const admin   = client(FIXTURES.adminAToken);
const adminB  = client(FIXTURES.adminBToken);
const agentA  = client(FIXTURES.agentAToken);
const agentB  = client(FIXTURES.agentBToken);
const agentC  = client(FIXTURES.agentCToken);
const inactive = client(FIXTURES.inactiveAgentToken);
const unlinked = client(FIXTURES.unlinkedUserToken);
const anon    = client(null);

const denied = (res) =>
  res.status === 403 ||
  res.status === 404 ||
  (res.status === 200 && Array.isArray(res.body) && res.body.length === 0);

const allowed = (res, minLen = 1) =>
  res.status === 200 && Array.isArray(res.body) && res.body.length >= minLen;


// ═══════════════════════════════════════════════════════════════════
// ADMIN A — Org Alpha
// ═══════════════════════════════════════════════════════════════════

console.log('\n[ADMIN A — Org Alpha]');
await test('reads own organization', async () => {
  const r = await admin.select('organizations', `id=eq.${FIXTURES.orgA}&select=id`);
  assert.ok(allowed(r));
});
await test('updates own organization', async () => {
  const r = await admin.patch('organizations', `id=eq.${FIXTURES.orgA}`, { name: 'QA Org Alpha (touched)' });
  assert.equal(r.status, 200);
  await admin.patch('organizations', `id=eq.${FIXTURES.orgA}`, { name: 'QA Organization Alpha' });
});
await test('reads agents in own org', async () => {
  const r = await admin.select('agents', `organization_id=eq.${FIXTURES.orgA}&select=id`);
  assert.ok(allowed(r, 2));
});
await test('reads all properties in own org', async () => {
  const r = await admin.select('properties', `organization_id=eq.${FIXTURES.orgA}&select=id`);
  assert.ok(allowed(r, 2));
});
await test('reassigns property.agent_id (admin-only operation)', async () => {
  const r = await admin.patch('properties', `id=eq.${FIXTURES.propertyA}`, { agent_id: FIXTURES.agentB });
  assert.equal(r.status, 200);
  await admin.patch('properties', `id=eq.${FIXTURES.propertyA}`, { agent_id: FIXTURES.agentA });
});
await test('CANNOT assign property to agent from different org', async () => {
  const r = await admin.patch('properties', `id=eq.${FIXTURES.propertyA}`, { agent_id: FIXTURES.agentC });
  assert.ok(denied(r));
  const check = await admin.select('properties', `id=eq.${FIXTURES.propertyA}&select=agent_id`);
  assert.equal(check.body[0].agent_id, FIXTURES.agentA);
});
await test('reads all leads in own org', async () => {
  const r = await admin.select('leads', `select=id`);
  assert.ok(allowed(r, 2));
});
await test('reads audits in own org', async () => {
  const r = await admin.select('audits', `property_id=eq.${FIXTURES.propertyA}&select=id`);
  assert.ok(r.status === 200);
});
await test('reads concierge conversations in own org', async () => {
  const r = await admin.select('concierge_conversations', `select=id`);
  assert.ok(r.status === 200);
});
await test('reads concierge messages in own org', async () => {
  const r = await admin.select('concierge_messages', `select=id`);
  assert.ok(r.status === 200);
});
await test('reads sessions in own org', async () => {
  const r = await admin.select('sessions', `select=id`);
  assert.ok(r.status === 200);
});
await test('reads analytics events in own org', async () => {
  const r = await admin.select('analytics_events', `select=id`);
  assert.ok(r.status === 200);
});
await test('CANNOT read Org B', async () => {
  const r = await admin.select('organizations', `id=eq.${FIXTURES.orgB}&select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read Org B properties', async () => {
  const r = await admin.select('properties', `id=eq.${FIXTURES.propertyC}&select=id`);
  assert.ok(denied(r));
});
await test('CANNOT update Org B', async () => {
  const r = await admin.patch('organizations', `id=eq.${FIXTURES.orgB}`, { name: 'Hijacked' });
  assert.ok(denied(r));
});


// ═══════════════════════════════════════════════════════════════════
// ADMIN B — Org Beta (cross-org admin isolation)
// ═══════════════════════════════════════════════════════════════════

console.log('\n[ADMIN B — Org Beta]');
await test('reads own organization (Org B)', async () => {
  const r = await adminB.select('organizations', `id=eq.${FIXTURES.orgB}&select=id`);
  assert.ok(allowed(r));
});
await test('reads Property C (Org B)', async () => {
  const r = await adminB.select('properties', `id=eq.${FIXTURES.propertyC}&select=id`);
  assert.ok(allowed(r));
});
await test('reads Agent C (Org B)', async () => {
  const r = await adminB.select('agents', `id=eq.${FIXTURES.agentC}&select=id`);
  assert.ok(allowed(r));
});
await test('CANNOT read Org A', async () => {
  const r = await adminB.select('organizations', `id=eq.${FIXTURES.orgA}&select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read Org A properties', async () => {
  const r = await adminB.select('properties', `id=eq.${FIXTURES.propertyA}&select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read Org A agents', async () => {
  const r = await adminB.select('agents', `id=eq.${FIXTURES.agentA}&select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read Org A leads', async () => {
  const r = await adminB.select('leads', `id=eq.${FIXTURES.leadA}&select=id`);
  assert.ok(denied(r));
});


// ═══════════════════════════════════════════════════════════════════
// AGENT A — Org Alpha, ownership isolation
// ═══════════════════════════════════════════════════════════════════

console.log('\n[AGENT A]');
await test('reads own profile', async () => {
  const r = await agentA.select('agents', `id=eq.${FIXTURES.agentA}&select=id`);
  assert.ok(allowed(r));
});
await test('CANNOT read Agent B profile', async () => {
  const r = await agentA.select('agents', `id=eq.${FIXTURES.agentB}&select=id`);
  assert.ok(denied(r));
});
await test('reads Property A (own)', async () => {
  const r = await agentA.select('properties', `id=eq.${FIXTURES.propertyA}&select=id`);
  assert.ok(allowed(r));
});
await test('CANNOT read Property B (Agent B\'s)', async () => {
  const r = await agentA.select('properties', `id=eq.${FIXTURES.propertyB}&select=id`);
  assert.ok(denied(r));
});
await test('updates Property A content', async () => {
  const r = await agentA.patch('properties', `id=eq.${FIXTURES.propertyA}`, { display_order: 1 });
  assert.equal(r.status, 200);
});
await test('CANNOT reassign Property A agent_id', async () => {
  const r = await agentA.patch('properties', `id=eq.${FIXTURES.propertyA}`, { agent_id: FIXTURES.agentB });
  assert.ok(r.status === 403 || r.status === 200 && (!r.body || r.body.length === 0));
});
await test('CANNOT INSERT a new property', async () => {
  const r = await agentA.insert('properties', { slug: 'agent-a-attempt', organization_id: FIXTURES.orgA, agent_id: FIXTURES.agentA });
  assert.ok(r.status === 403 || r.status === 401);
});
await test('CANNOT DELETE a property', async () => {
  const r = await agentA.del('properties', `id=eq.${FIXTURES.propertyA}`);
  assert.ok(r.status === 403 || r.status === 200 && (!r.body || r.body.length === 0));
  const check = await agentA.select('properties', `id=eq.${FIXTURES.propertyA}&select=id`);
  assert.ok(allowed(check));
});
await test('CANNOT change Property A organization_id (org boundary)', async () => {
  const r = await agentA.patch('properties', `id=eq.${FIXTURES.propertyA}`, { organization_id: FIXTURES.orgB });
  assert.ok(r.status === 403 || r.status === 200 && (!r.body || r.body.length === 0));
  const check = await agentA.select('properties', `id=eq.${FIXTURES.propertyA}&select=organization_id`);
  assert.ok(allowed(check));
  assert.equal(check.body[0].organization_id, FIXTURES.orgA);
});
await test('CANNOT change own auth_user_id', async () => {
  const r = await agentA.patch('agents', `id=eq.${FIXTURES.agentA}`, { auth_user_id: FIXTURES.agentBAuthUserId });
  assert.ok(r.status === 403 || r.status === 200 && (!r.body || r.body.length === 0));
});
await test('CANNOT change own organization_id (trigger)', async () => {
  const r = await agentA.patch('agents', `id=eq.${FIXTURES.agentA}`, { organization_id: FIXTURES.orgB });
  assert.ok(r.status >= 400);
});
await test('CANNOT DELETE own agent row', async () => {
  const r = await agentA.del('agents', `id=eq.${FIXTURES.agentA}`);
  assert.ok(r.status === 403 || r.status === 200 && (!r.body || r.body.length === 0));
  const check = await agentA.select('agents', `id=eq.${FIXTURES.agentA}&select=id`);
  assert.ok(allowed(check));
});
await test('CAN update own bio/phone (legitimate self-edit)', async () => {
  const r = await agentA.patch('agents', `id=eq.${FIXTURES.agentA}`, { phone: '+00 600 000 000' });
  assert.equal(r.status, 200);
});
await test('CANNOT change own membership role to admin', async () => {
  const r = await agentA.patch('memberships', `user_id=eq.${FIXTURES.agentAAuthUserId}&organization_id=eq.${FIXTURES.orgA}`, { role: 'admin' });
  assert.ok(r.status === 403 || r.status === 200 && (!r.body || r.body.length === 0));
});
await test('CANNOT change own membership organization_id', async () => {
  const r = await agentA.patch('memberships', `user_id=eq.${FIXTURES.agentAAuthUserId}&organization_id=eq.${FIXTURES.orgA}`, { organization_id: FIXTURES.orgB });
  assert.ok(r.status === 403 || r.status === 200 && (!r.body || r.body.length === 0));
});
await test('CANNOT INSERT a membership row', async () => {
  const r = await agentA.insert('memberships', { user_id: FIXTURES.agentAAuthUserId, organization_id: FIXTURES.orgB, role: 'agent' });
  assert.ok(r.status === 403 || r.status === 401);
});
await test('CANNOT read another user\'s membership row', async () => {
  const r = await agentA.select('memberships', `user_id=eq.${FIXTURES.agentBAuthUserId}&select=id`);
  assert.ok(denied(r));
});
await test('CAN read own membership row', async () => {
  const r = await agentA.select('memberships', `user_id=eq.${FIXTURES.agentAAuthUserId}&select=role`);
  assert.ok(allowed(r));
  assert.equal(r.body[0].role, 'agent');
});
await test('CANNOT reassign Lead A to a different property (trigger)', async () => {
  const r = await agentA.patch('leads', `id=eq.${FIXTURES.leadA}`, { property_id: FIXTURES.propertyB });
  assert.ok(r.status >= 400);
});
await test('reads Lead A (own, via snapshot agent_id)', async () => {
  const r = await agentA.select('leads', `id=eq.${FIXTURES.leadA}&select=id`);
  assert.ok(allowed(r));
});
await test('CANNOT read Lead B', async () => {
  const r = await agentA.select('leads', `id=eq.${FIXTURES.leadB}&select=id`);
  assert.ok(denied(r));
});
await test('CANNOT reassign Lead A agent_id (trigger)', async () => {
  const r = await agentA.patch('leads', `id=eq.${FIXTURES.leadA}`, { agent_id: FIXTURES.agentB });
  assert.ok(r.status >= 400 || (r.status === 200 && (!r.body || r.body.length === 0)));
});
await test('CANNOT INSERT a lead (as authenticated)', async () => {
  const r = await agentA.insert('leads', { property: 'qa-villa-alpha', email: 'agent-insert-attempt@example.invalid' });
  assert.ok(r.status === 403 || r.status === 401);
});
await test('CANNOT read Property C (Org B)', async () => {
  const r = await agentA.select('properties', `id=eq.${FIXTURES.propertyC}&select=id`);
  assert.ok(denied(r));
});

// Agent deferred access = NONE (concierge, sessions, analytics)
await test('CANNOT read concierge conversations', async () => {
  const r = await agentA.select('concierge_conversations', `select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read concierge messages', async () => {
  const r = await agentA.select('concierge_messages', `select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read sessions', async () => {
  const r = await agentA.select('sessions', `select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read analytics events', async () => {
  const r = await agentA.select('analytics_events', `select=id`);
  assert.ok(denied(r));
});

// Audit access
await test('reads audits for own property', async () => {
  const r = await agentA.select('audits', `property_id=eq.${FIXTURES.propertyA}&select=id`);
  assert.ok(r.status === 200);
});


// ═══════════════════════════════════════════════════════════════════
// AGENT B — symmetric isolation (same org as Agent A)
// ═══════════════════════════════════════════════════════════════════

console.log('\n[AGENT B — symmetric]');
await test('reads own profile, not Agent A\'s', async () => {
  const own = await agentB.select('agents', `id=eq.${FIXTURES.agentB}&select=id`);
  const other = await agentB.select('agents', `id=eq.${FIXTURES.agentA}&select=id`);
  assert.ok(allowed(own));
  assert.ok(denied(other));
});
await test('reads Property B, not Property A', async () => {
  const own = await agentB.select('properties', `id=eq.${FIXTURES.propertyB}&select=id`);
  const other = await agentB.select('properties', `id=eq.${FIXTURES.propertyA}&select=id`);
  assert.ok(allowed(own));
  assert.ok(denied(other));
});
await test('reads Lead B, not Lead A', async () => {
  const own = await agentB.select('leads', `id=eq.${FIXTURES.leadB}&select=id`);
  const other = await agentB.select('leads', `id=eq.${FIXTURES.leadA}&select=id`);
  assert.ok(allowed(own));
  assert.ok(denied(other));
});


// ═══════════════════════════════════════════════════════════════════
// AGENT C — Org Beta (cross-org agent isolation)
// ═══════════════════════════════════════════════════════════════════

console.log('\n[AGENT C — Org Beta]');
await test('reads own profile', async () => {
  const r = await agentC.select('agents', `id=eq.${FIXTURES.agentC}&select=id`);
  assert.ok(allowed(r));
});
await test('reads Property C (own, Org B)', async () => {
  const r = await agentC.select('properties', `id=eq.${FIXTURES.propertyC}&select=id`);
  assert.ok(allowed(r));
});
await test('CANNOT read Org A agents', async () => {
  const r = await agentC.select('agents', `id=eq.${FIXTURES.agentA}&select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read Org A properties', async () => {
  const r = await agentC.select('properties', `id=eq.${FIXTURES.propertyA}&select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read Org A leads', async () => {
  const r = await agentC.select('leads', `id=eq.${FIXTURES.leadA}&select=id`);
  assert.ok(denied(r));
});
await test('reads own organization (Org B)', async () => {
  const r = await agentC.select('organizations', `id=eq.${FIXTURES.orgB}&select=id`);
  assert.ok(allowed(r));
});
await test('CANNOT read Org A', async () => {
  const r = await agentC.select('organizations', `id=eq.${FIXTURES.orgA}&select=id`);
  assert.ok(denied(r));
});


// ═══════════════════════════════════════════════════════════════════
// INACTIVE AGENT
// ═══════════════════════════════════════════════════════════════════

console.log('\n[INACTIVE AGENT]');
await test('can still read own profile', async () => {
  const r = await inactive.select('agents', `auth_user_id=eq.${FIXTURES.inactiveAgentAuthUserId}&select=id`);
  assert.ok(allowed(r));
});
await test('CANNOT read properties via ownership', async () => {
  const r = await inactive.select('properties', `select=id`);
  assert.ok(denied(r) || (r.status === 200 && r.body.length === 0));
});
await test('CANNOT read leads via ownership', async () => {
  const r = await inactive.select('leads', `select=id`);
  assert.ok(denied(r) || (r.status === 200 && r.body.length === 0));
});
await test('CAN read own membership', async () => {
  const r = await inactive.select('memberships', `user_id=eq.${FIXTURES.inactiveAgentAuthUserId}&select=role`);
  assert.ok(allowed(r));
});


// ═══════════════════════════════════════════════════════════════════
// UNLINKED USER (auth account, no agents row, no membership)
// ═══════════════════════════════════════════════════════════════════

console.log('\n[UNLINKED USER]');
await test('authenticates but has zero organizational access', async () => {
  const org = await unlinked.select('organizations', `select=id`);
  const ag  = await unlinked.select('agents', `select=id`);
  const pr  = await unlinked.select('properties', `select=id`);
  const ld  = await unlinked.select('leads', `select=id`);
  const mb  = await unlinked.select('memberships', `select=id`);
  for (const r of [org, ag, pr, ld, mb]) assert.ok(r.status === 200 && r.body.length === 0);
});
await test('CANNOT read concierge/sessions/analytics', async () => {
  const cv = await unlinked.select('concierge_conversations', `select=id`);
  const mg = await unlinked.select('concierge_messages', `select=id`);
  const ss = await unlinked.select('sessions', `select=id`);
  const ev = await unlinked.select('analytics_events', `select=id`);
  for (const r of [cv, mg, ss, ev]) assert.ok(r.status === 200 && r.body.length === 0);
});


// ═══════════════════════════════════════════════════════════════════
// ANON — regression checks (must be unchanged from pre-cutover)
// ═══════════════════════════════════════════════════════════════════

console.log('\n[ANON — regression]');
await test('reads only published properties', async () => {
  const r = await anon.select('properties', `select=slug,status`);
  assert.ok(r.status === 200 && Array.isArray(r.body));
  assert.ok(r.body.every(p => p.status === 'published'));
});
await test('CANNOT read draft properties', async () => {
  const r = await anon.select('properties', `status=eq.draft&select=id`);
  assert.ok(r.status === 200 && r.body.length === 0);
});
await test('INSERT lead still works', async () => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
    method: 'POST',
    headers: { apikey: FIXTURES.anonKey, Authorization: `Bearer ${FIXTURES.anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ property: 'qa-villa-alpha', email: 'anon-regression@example.invalid' })
  });
  assert.ok(r.status === 201 || r.status === 204);
});
await test('CANNOT read leads', async () => {
  const r = await anon.select('leads', `select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read agents', async () => {
  const r = await anon.select('agents', `select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read organizations', async () => {
  const r = await anon.select('organizations', `select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read audits', async () => {
  const r = await anon.select('audits', `select=id`);
  assert.ok(denied(r));
});
await test('CANNOT read memberships', async () => {
  const r = await anon.select('memberships', `select=id`);
  assert.ok(denied(r));
});
await test('INSERT session still works', async () => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
    method: 'POST',
    headers: { apikey: FIXTURES.anonKey, Authorization: `Bearer ${FIXTURES.anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ property: 'qa-villa-alpha', lang: 'en' })
  });
  assert.ok(r.status === 201 || r.status === 204);
});
await test('INSERT analytics event still works', async () => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
    method: 'POST',
    headers: { apikey: FIXTURES.anonKey, Authorization: `Bearer ${FIXTURES.anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ property: 'qa-villa-alpha', event_type: 'qa_test', event_data: '{}' })
  });
  assert.ok(r.status === 201 || r.status === 204);
});


// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════

console.log(`\n══ AUTHORIZATION FOUNDATION TEST SUMMARY ═══════════════`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
