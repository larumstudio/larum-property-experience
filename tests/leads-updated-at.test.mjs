#!/usr/bin/env node
/**
 * M6.5a — leads.updated_at (Migration 007) · Test Matrix
 *
 * NOT RUNNABLE YET. Requires an ISOLATED Supabase project where
 * docs/migrations/007_leads_updated_at.sql has been applied for real.
 *
 * NEVER point ISOLATED_SUPABASE_URL at the real project
 * (mtyemgfovvmjrsxevcgh) — this suite creates, updates and reads test
 * data by design.
 *
 * Same harness shape as tests/lead-agent-resolve.test.mjs: raw fetch
 * against PostgREST (anon for the visitor-shaped insert path, service_role
 * for admin-shaped patches), idempotent fixtures, best-effort cleanup.
 *
 * Covers, per the M6.5a design (admin-property-store.js's
 * updateWithConcurrencyCheck / admin-core.js's updateLead()):
 *   1. Column exists, NOT NULL, DEFAULT now() on insert.
 *   2. touch_leads trigger bumps updated_at on any UPDATE.
 *   3. The exact compare-and-swap query shape the app uses:
 *      .eq('id', X).eq('updated_at', stale) → 0 rows (conflict).
 *      .eq('id', X).eq('updated_at', current) → 1 row (success),
 *      returned updated_at is strictly newer than before.
 */

import assert from 'node:assert/strict';

const SUPABASE_URL = process.env.ISOLATED_SUPABASE_URL;
const ANON_KEY = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY;
const PRODUCTION_REF = 'mtyemgfovvmjrsxevcgh';

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.log('SKIPPED — leads-updated-at.test.mjs requires ISOLATED_SUPABASE_URL,');
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

const svc = serviceClient();
const NS = 'm65a';
let insertedIds = [];

console.log('\n── FIXTURE SETUP ───────────────────────────────────────────');

const seed = await svc.insert('leads', {
  property: `${NS}-fixture-property`,
  email: 'm65a-fixture@example.invalid',
  name: 'M6.5a Fixture Lead',
  status: 'new',
  notes: 'initial'
});
if (seed.status >= 400) { console.error('FATAL: lead insert failed', seed.body); process.exit(1); }
const leadId = seed.body[0].id;
insertedIds.push(leadId);
console.log(`    lead=${leadId.slice(0, 8)}…`);

// ═════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════

console.log('\n[column + default]');

await test('leads.updated_at exists, NOT NULL, populated on insert without the app sending it', async () => {
  assert.ok(seed.body[0].updated_at, 'insert response should include updated_at');
  const r = await svc.select('leads', `id=eq.${leadId}&select=updated_at`);
  assert.equal(r.status, 200);
  assert.ok(r.body[0].updated_at, 'updated_at must not be NULL');
});

console.log('\n[touch_leads trigger]');

let firstUpdatedAt;
await test('a plain UPDATE bumps updated_at to a strictly newer value', async () => {
  const before = await svc.select('leads', `id=eq.${leadId}&select=updated_at`);
  firstUpdatedAt = before.body[0].updated_at;

  await new Promise(r => setTimeout(r, 1100)); // clear the second so the compare is unambiguous

  const upd = await svc.patch('leads', `id=eq.${leadId}`, { notes: 'touched' });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.ok(new Date(upd.body[0].updated_at) > new Date(firstUpdatedAt),
    'updated_at must strictly increase after any UPDATE');
});

console.log('\n[optimistic concurrency — exact query shape used by updateLead()]');

await test('UPDATE with a stale updated_at in the filter matches 0 rows (conflict)', async () => {
  const current = await svc.select('leads', `id=eq.${leadId}&select=updated_at,notes`);
  const currentUpdatedAt = current.body[0].updated_at;

  // firstUpdatedAt is now stale — the touch above already moved it forward.
  const r = await svc.patch('leads',
    `id=eq.${leadId}&updated_at=eq.${encodeURIComponent(firstUpdatedAt)}`,
    { notes: 'should not apply' });

  assert.equal(r.status, 200, JSON.stringify(r.body)); // PostgREST: 0-row match is NOT an error
  assert.equal(r.body.length, 0, 'a stale updated_at filter must match zero rows');

  // Confirm the write genuinely did not happen.
  const after = await svc.select('leads', `id=eq.${leadId}&select=updated_at,notes`);
  assert.equal(after.body[0].notes, current.body[0].notes, 'a 0-row-match UPDATE must not have changed the row');
  assert.equal(after.body[0].updated_at, currentUpdatedAt, 'updated_at must not move on a conflicting UPDATE');
});

await test('UPDATE with the current updated_at in the filter matches exactly 1 row and returns a newer updated_at', async () => {
  const current = await svc.select('leads', `id=eq.${leadId}&select=updated_at`);
  const currentUpdatedAt = current.body[0].updated_at;

  await new Promise(r => setTimeout(r, 1100));

  const r = await svc.patch('leads',
    `id=eq.${leadId}&updated_at=eq.${encodeURIComponent(currentUpdatedAt)}`,
    { notes: 'applied correctly' });

  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.length, 1, 'a correct updated_at filter must match exactly 1 row');
  assert.equal(r.body[0].notes, 'applied correctly');
  assert.ok(new Date(r.body[0].updated_at) > new Date(currentUpdatedAt),
    'the returned updated_at must be strictly newer than the one used in the filter');
});

// ═════════════════════════════════════════════════════════════════════
// CLEANUP — best-effort, does not affect pass/fail
// ═════════════════════════════════════════════════════════════════════

console.log('\n── CLEANUP ──────────────────────────────────────────────────');
if (insertedIds.length) {
  const idList = insertedIds.map(id => `"${id}"`).join(',');
  await svc.del('leads', `id=in.(${idList})`).catch(() => {});
  console.log(`    Removed ${insertedIds.length} test lead(s).`);
}

console.log('\n══ M6.5a LEADS.UPDATED_AT — TEST SUMMARY ═══════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
