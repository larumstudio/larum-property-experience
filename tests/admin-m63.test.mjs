/**
 * Admin-M6.3 · Agent Status & Reinvite — edge cases of the access cycle
 *
 * Scope note (read before extending this file): the M6.3 brief asked for
 * 10 minimum test cases. Six of them were already fully covered by the
 * M6.2 suites and are NOT duplicated here:
 *   - resend/reinvite never duplicates the Auth user   → admin-invite-agent.test.mjs [7]
 *   - resend/reinvite never duplicates the membership  → admin-invite-agent.test.mjs [6][7][8]
 *   - partial-failure repair                           → admin-invite-agent.test.mjs [8]
 *   - agent UI has no admin-only controls              → admin-m62.test.mjs [10]
 *   - admin UI keeps every existing control             → admin-m62.test.mjs [11]
 *   - SERVICE_ROLE_KEY never reaches client code        → admin-m62.test.mjs [2]
 * "missing/invalid email → clear error" was a real gap (the endpoint had
 * the check, nothing tested it) — closed in admin-invite-agent.test.mjs
 * directly (same file that already covers that endpoint), not here.
 *
 * What's actually new in this file:
 *   1 — Access card communicates all three real states (no account /
 *       connected / connected-but-inactive) — the third one didn't exist
 *       in the UI before this milestone.
 *   2 — Client-side error messages for every typed code the endpoint can
 *       return — previously the raw code (e.g. "not_org_admin") was
 *       shown verbatim in the toast.
 *   3 — Regression guard: current_agent_id() still fails closed on
 *       status='inactive'. This is the REAL security boundary for
 *       "inactive agent cannot operate" — it already exists (Migration
 *       006) and is exercised functionally by
 *       tests/authorization-foundation.test.mjs's [INACTIVE AGENT] group
 *       against a live isolated Supabase project (skipped here, same as
 *       always, without ISOLATED_SUPABASE_* env). This file only guards
 *       the source text doesn't silently drift.
 *
 * Dependency-free (node:assert, node:fs), source-text assertions —
 * same convention as admin-m62.test.mjs's own header explains: a
 * DOM-less harness can't render admin-agents.js's innerHTML-based
 * output, so structural checks on the exact conditional logic are the
 * house style here, not a downgrade from it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const readFile = f => readFileSync(join(root, f), 'utf8');

const agentsSrc = readFile('admin/admin-agents.js');
const invitEndpointSrc = readFile('api/admin-invite-agent.mjs');
const authFoundationSql = readFile('docs/migrations/006_authorization_foundation.sql');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

/* ═══════════════════════════════════════════════════════════════
   1 — Access card: all three real states
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] Access card communicates no-account / connected / inactive-but-connected');

await test('1a: "No account yet" badge is tied to !a.auth_user_id (agent sin Auth)', async () => {
  const fn = agentsSrc.match(/function renderAccessCard\(a\) \{[\s\S]*?\n\}/);
  assert.ok(fn, 'renderAccessCard not found');
  assert.match(fn[0], /const connected = !!a\.auth_user_id/);
  assert.match(fn[0], /connected\s*\n?\s*\?\s*'<span class="badge badge-green">Connected<\/span>'\s*\n?\s*:\s*'<span class="badge badge-muted">No account yet<\/span>'/);
});

await test('1b: Invite button only offered when the agent has an email (agent sin Auth, con/sin email)', async () => {
  const fn = agentsSrc.match(/function renderAccessCard\(a\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(!a\.email\)/, 'must gate the invite action on a.email presence');
  assert.match(fn, /Add an email address above before inviting this agent/);
  assert.match(fn, /Invite to Larum Admin/);
});

await test('2a: "Connected" state renders the Resend/repair action, not a fresh invite (agent con Auth)', async () => {
  const fn = agentsSrc.match(/function renderAccessCard\(a\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /connected \? 'Resend \/ repair access' : 'Invite to Larum Admin'/);
});

await test('3a: inactive-but-connected agent gets an explicit operational-block message (M6.3 — new)', async () => {
  const fn = agentsSrc.match(/function renderAccessCard\(a\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /const inactive = a\.status === 'inactive'/);
  assert.match(fn, /if \(connected && inactive\)/, 'must require BOTH connected and inactive — this is not the "no account" case');
  assert.match(fn, /agent is inactive/i);
  assert.match(fn, /cannot access/i);
  assert.match(fn, /until reactivated/i);
});

await test('3b: the inactive notice never fires for a disconnected agent (no double-messaging)', async () => {
  const fn = agentsSrc.match(/function renderAccessCard\(a\) \{[\s\S]*?\n\}/)[0];
  // The only inactive-aware branch must be gated on `connected &&` —
  // guards against a future edit accidentally showing it whenever
  // status is inactive regardless of auth_user_id.
  const inactiveBranches = fn.match(/if \([^)]*inactive[^)]*\)/g) || [];
  assert.ok(inactiveBranches.length >= 1);
  inactiveBranches.forEach(cond => assert.match(cond, /connected/, `inactive branch "${cond}" must also check connected`));
});

await test('renderAccessCard is still called from drawDetail (wiring unchanged)', async () => {
  assert.match(agentsSrc, /html \+= renderAccessCard\(a\)/);
});

/* ═══════════════════════════════════════════════════════════════
   2 — Client-side error messages cover every server-typed code
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] Every endpoint error code maps to a clear client message (M6.3 — new)');

await test('INVITE_ERROR_MESSAGES exists and handleInvite() uses it instead of raw e.message', async () => {
  assert.match(agentsSrc, /const INVITE_ERROR_MESSAGES = \{/);
  assert.match(agentsSrc, /toast\(INVITE_ERROR_MESSAGES\[e\.message\] \|\| \('Invite failed: ' \+ e\.message\), 'error'\)/);
});

await test('every res.status(...).json({ error: \'...\' }) code in the endpoint has a client-side message', async () => {
  const codes = [...new Set([...invitEndpointSrc.matchAll(/error:\s*'([a-z_]+)'/g)].map(m => m[1]))];
  assert.ok(codes.length >= 8, 'sanity check — expected at least 8 distinct typed error codes in the endpoint');

  const mapBlock = agentsSrc.match(/const INVITE_ERROR_MESSAGES = \{[\s\S]*?\n\};/)[0];
  // Keys are bare identifiers in the map (e.g. `agent_not_found: '...'`),
  // not quoted strings — every code here is a valid JS identifier, so
  // this is the correct match, not a looser fallback.
  const missing = codes.filter(code => !mapBlock.includes(code + ':'));
  assert.deepEqual(missing, [], 'endpoint error codes with no client-side message: ' + missing.join(', '));
});

await test('the error map never echoes anything about service_role or Auth internals', async () => {
  const mapBlock = agentsSrc.match(/const INVITE_ERROR_MESSAGES = \{[\s\S]*?\n\};/)[0];
  assert.doesNotMatch(mapBlock, /service_role/i);
  assert.doesNotMatch(mapBlock, /SUPABASE_SERVICE_ROLE_KEY/);
});

/* ═══════════════════════════════════════════════════════════════
   3 — Regression guard: inactive agents still fail closed at RLS
   (the actual security boundary — see file header for why this is
   a guard, not the functional proof)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] current_agent_id() still fails closed on status=inactive (RLS regression guard)');

await test('current_agent_id() still filters a.status = \'active\'', async () => {
  const fn = authFoundationSql.match(/CREATE OR REPLACE FUNCTION public\.current_agent_id\(\)[\s\S]*?\$\$;/);
  assert.ok(fn, 'current_agent_id() definition not found in 006_authorization_foundation.sql');
  assert.match(fn[0], /a\.status = 'active'/, 'inactive agents must not resolve to a valid current_agent_id()');
});

await test('current_agent_id() still requires a matching role=agent membership (dangling-link guard, M6.2 finding)', async () => {
  const fn = authFoundationSql.match(/CREATE OR REPLACE FUNCTION public\.current_agent_id\(\)[\s\S]*?\$\$;/)[0];
  assert.match(fn, /m\.role = 'agent'/);
});

/* ═══════════════════════════════════════════════════════════════
   SUMMARY
   ═══════════════════════════════════════════════════════════════ */
console.log('\n══ Admin-M6.3 TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
