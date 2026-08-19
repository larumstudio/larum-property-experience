#!/usr/bin/env node

/* ── Larum — Authorization Test Runner ───────────────────────────────
   Orchestrates the full authorization test pipeline against an
   ISOLATED Supabase project. Handles auth user creation, fixture
   linking, and test execution in the correct dependency order.

   NEVER runs against production. Requires explicit opt-in via
   ISOLATED_SUPABASE=true environment variable AND rejects the
   production project reference in the URL.

   Required environment variables:
     ISOLATED_SUPABASE=true                    — explicit safety gate
     ISOLATED_SUPABASE_URL=https://<ref>.supabase.co
     ISOLATED_SUPABASE_ANON_KEY=<anon-key>
     ISOLATED_SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

   Optional:
     POLICIES_APPLIED=true — skip the manual pause at step 4
                             (use when policies are already applied)

   Usage:
     ISOLATED_SUPABASE=true \
     ISOLATED_SUPABASE_URL=https://xxx.supabase.co \
     ISOLATED_SUPABASE_ANON_KEY=eyJ... \
     ISOLATED_SUPABASE_SERVICE_ROLE_KEY=eyJ... \
     node tests/run-authorization-tests.mjs

   Expected state BEFORE running:
     1. Isolated Supabase project exists (free tier is fine)
     2. 006_isolated_bootstrap.sql has been run in its SQL Editor
     3. 006_authorization_foundation.sql has been run in its SQL Editor
     4. 006_qa_fixtures.sql has been run in its SQL Editor
     5. 006_policies_prepared.sql has NOT been run yet (runner pauses
        for you to apply it mid-run, after auth users exist)

   Steps this runner executes:
     1 — FOUNDATION: verify tables + helper functions exist
     2 — AUTHENTICATION: create 7 auth users via Auth Admin API
     3 — FIXTURES: link auth_user_id on agents, create memberships,
         acquire access tokens, verify linkage
     4 — POLICIES: pause for manual 006_policies_prepared.sql, then
         verify new policies are active
     5 — TEST MATRIX: run authorization-foundation.test.mjs
   ─────────────────────────────────────────────────────────────────── */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═════════════════════════════════════════════════════════════════════
// SAFETY GATES
// ═════════════════════════════════════════════════════════════════════

const PRODUCTION_REF = 'mtyemgfovvmjrsxevcgh';

const SUPABASE_URL = process.env.ISOLATED_SUPABASE_URL;
const ANON_KEY = process.env.ISOLATED_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY;
const ISOLATED_FLAG = process.env.ISOLATED_SUPABASE;

function fatal(msg) {
  console.error(`\n  FATAL: ${msg}\n`);
  process.exit(1);
}

if (ISOLATED_FLAG !== 'true') {
  fatal(
    'ISOLATED_SUPABASE=true is required.\n' +
    '         This safety gate prevents accidental execution against production.\n' +
    '         Set ISOLATED_SUPABASE=true to confirm you are targeting a disposable environment.'
  );
}

if (!SUPABASE_URL) fatal('ISOLATED_SUPABASE_URL is not set.');
if (!ANON_KEY) fatal('ISOLATED_SUPABASE_ANON_KEY is not set.');
if (!SERVICE_ROLE_KEY) fatal('ISOLATED_SUPABASE_SERVICE_ROLE_KEY is not set.');

if (SUPABASE_URL.includes(PRODUCTION_REF)) {
  fatal(
    `URL contains the production project reference (${PRODUCTION_REF}).\n` +
    '         This runner REFUSES to execute against production.\n' +
    '         Create a separate Supabase project for isolated testing.'
  );
}

const urlMatch = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\./);
if (urlMatch && urlMatch[1] === PRODUCTION_REF) {
  fatal('Production project reference detected in URL. Aborting.');
}

if (!SUPABASE_URL.startsWith('https://')) {
  fatal('ISOLATED_SUPABASE_URL must start with https://');
}

console.log('══════════════════════════════════════════════════════════════');
console.log('  LARUM — AUTHORIZATION TEST RUNNER (ISOLATED ENVIRONMENT)');
console.log('══════════════════════════════════════════════════════════════');
console.log(`  Target:     ${SUPABASE_URL}`);
console.log(`  Safety:     ISOLATED_SUPABASE=true ✓`);
console.log(`  Prod block: ${PRODUCTION_REF} ✓`);
console.log('');

// ═════════════════════════════════════════════════════════════════════
// DETERMINISTIC QA IDS — shared with 006_qa_fixtures.sql
// ═════════════════════════════════════════════════════════════════════

const QA_IDS = {
  orgA:          'a0000000-0000-0000-0000-000000000001',
  orgB:          'b0000000-0000-0000-0000-000000000002',
  agentA:        'ca000000-0000-0000-0000-00000000000a',
  agentB:        'ca000000-0000-0000-0000-00000000000b',
  agentC:        'ca000000-0000-0000-0000-00000000000c',
  inactiveAgent: 'ca000000-0000-0000-0000-0000000000de',
  propertyA:     'da000000-0000-0000-0000-00000000000a',
  propertyB:     'da000000-0000-0000-0000-00000000000b',
  propertyC:     'da000000-0000-0000-0000-00000000000c',
  leadA:         'ea000000-0000-0000-0000-00000000000a',
  leadB:         'ea000000-0000-0000-0000-00000000000b',
  auditA:        'fa000000-0000-0000-0000-00000000000a',
  conversationA: 'ab000000-0000-0000-0000-00000000000a',
  sessionA:      'bb000000-0000-0000-0000-00000000000a',
};

const QA_USERS = [
  { key: 'adminA',        email: 'qa-admin-alpha@example.invalid',    password: 'QaTest!Admin-Alpha-2026' },
  { key: 'adminB',        email: 'qa-admin-beta@example.invalid',     password: 'QaTest!Admin-Beta-2026' },
  { key: 'agentA',        email: 'qa-agent-alpha@example.invalid',    password: 'QaTest!Agent-Alpha-2026' },
  { key: 'agentB',        email: 'qa-agent-beta@example.invalid',     password: 'QaTest!Agent-Beta-2026' },
  { key: 'agentC',        email: 'qa-agent-charlie@example.invalid',  password: 'QaTest!Agent-Charlie-2026' },
  { key: 'inactiveAgent', email: 'qa-inactive@example.invalid',       password: 'QaTest!Inactive-2026' },
  { key: 'unlinkedUser',  email: 'qa-unlinked@example.invalid',       password: 'QaTest!Unlinked-2026' },
];

// ═════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════

async function safeFetch(url, opts) {
  const res = await fetch(url, opts);
  let body;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) {
    body = await res.json();
  } else {
    const text = await res.text();
    body = { _raw: text };
  }
  return { status: res.status, body };
}

async function authAdminCreateUser(email, password) {
  const { status, body } = await safeFetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (status === 200 || status === 201) return body.id;

  const msg = body?.msg || body?.message || body?.error_description || '';
  if (msg.includes('already been registered') || msg.includes('already exists')) {
    const { body: listBody } = await safeFetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const users = listBody.users || listBody;
    const existing = (Array.isArray(users) ? users : []).find(u => u.email === email);
    if (existing) return existing.id;
    fatal(`User ${email} reported as existing but not found in user list.`);
  }
  fatal(`Failed to create auth user ${email} (HTTP ${status}): ${JSON.stringify(body)}`);
}

async function authSignIn(email, password) {
  const { status, body } = await safeFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!body.access_token) {
    fatal(`Failed to sign in ${email} (HTTP ${status}): ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function serviceRoleQuery(table, method, query, payload) {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    Prefer: 'return=representation',
  };
  if (payload) headers['Content-Type'] = 'application/json';

  return safeFetch(`${SUPABASE_URL}/rest/v1/${table}?${query || ''}`, {
    method: method || 'GET',
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

async function rpcCall(fnName, args) {
  return safeFetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
}

function phase(name, status) {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '…';
  console.log(`  [${icon}] ${name.padEnd(20)} ${status}`);
}

// ═════════════════════════════════════════════════════════════════════
// STEP 1 — FOUNDATION: verify schema
// ═════════════════════════════════════════════════════════════════════

console.log('\n── STEP 1: FOUNDATION ──────────────────────────────────────');

async function verifyFoundation() {
  const tables = ['organizations', 'agents', 'properties', 'leads',
                  'audits', 'concierge_conversations', 'concierge_messages',
                  'sessions', 'analytics_events', 'memberships'];

  for (const table of tables) {
    const { status } = await safeFetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=count&limit=0`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    if (status >= 400) {
      fatal(`Table "${table}" not accessible (HTTP ${status}). Run bootstrap + foundation first.`);
    }
  }

  const fns = ['is_org_admin', 'current_agent_id', 'current_agent_organization_id', 'current_membership'];
  for (const fn of fns) {
    const args = fn === 'is_org_admin' || fn === 'current_membership'
      ? { p_organization_id: '00000000-0000-0000-0000-000000000000' }
      : {};
    const { status } = await rpcCall(fn, args);
    if (status >= 500) {
      fatal(`Helper function ${fn}() not found (HTTP ${status}). Run 006_authorization_foundation.sql first.`);
    }
  }

  // Verify agents.auth_user_id column exists
  const { status: agentStatus, body: agentBody } = await serviceRoleQuery(
    'agents', 'GET', `id=eq.${QA_IDS.agentA}&select=id,auth_user_id`
  );
  if (agentStatus >= 400) {
    fatal(`agents.auth_user_id column missing (HTTP ${agentStatus}). Run 006_authorization_foundation.sql first.`);
  }

  // Verify leads.agent_id column exists
  const { status: leadStatus } = await serviceRoleQuery(
    'leads', 'GET', `id=eq.${QA_IDS.leadA}&select=id,agent_id`
  );
  if (leadStatus >= 400) {
    fatal(`leads.agent_id column missing (HTTP ${leadStatus}). Run 006_authorization_foundation.sql first.`);
  }
}

try {
  await verifyFoundation();
  phase('FOUNDATION', 'PASS');
} catch (e) {
  phase('FOUNDATION', 'FAIL');
  fatal(e.message);
}


// ═════════════════════════════════════════════════════════════════════
// STEP 2 — AUTHENTICATION: create auth users
// ═════════════════════════════════════════════════════════════════════

console.log('\n── STEP 2: AUTHENTICATION ─────────────────────────────────');

const authUserIds = {};
const accessTokens = {};

try {
  for (const user of QA_USERS) {
    const uid = await authAdminCreateUser(user.email, user.password);
    authUserIds[user.key] = uid;
    console.log(`    Created/found: ${user.key.padEnd(15)} ${user.email} → ${uid}`);
  }
  phase('AUTHENTICATION', 'PASS');
} catch (e) {
  phase('AUTHENTICATION', 'FAIL');
  fatal(e.message);
}


// ═════════════════════════════════════════════════════════════════════
// STEP 3 — FIXTURES: link auth_user_id + memberships + tokens
// ═════════════════════════════════════════════════════════════════════

console.log('\n── STEP 3: FIXTURES ────────────────────────────────────────');

try {
  // 3a · Link agents to auth users
  const agentLinks = [
    { agentId: QA_IDS.agentA,        authUserId: authUserIds.agentA,        label: 'Agent A' },
    { agentId: QA_IDS.agentB,        authUserId: authUserIds.agentB,        label: 'Agent B' },
    { agentId: QA_IDS.agentC,        authUserId: authUserIds.agentC,        label: 'Agent C' },
    { agentId: QA_IDS.inactiveAgent, authUserId: authUserIds.inactiveAgent, label: 'Inactive' },
  ];

  for (const link of agentLinks) {
    const { status } = await serviceRoleQuery('agents', 'PATCH', `id=eq.${link.agentId}`, {
      auth_user_id: link.authUserId,
    });
    if (status >= 400) {
      fatal(`Failed to link ${link.label} auth_user_id (HTTP ${status}).`);
    }
    console.log(`    Linked ${link.label.padEnd(10)} → auth ${link.authUserId.slice(0, 8)}…`);
  }

  // 3b · Verify linkage — read back and confirm
  for (const link of agentLinks) {
    const { status, body } = await serviceRoleQuery(
      'agents', 'GET', `id=eq.${link.agentId}&select=auth_user_id`
    );
    const actual = Array.isArray(body) && body[0]?.auth_user_id;
    if (status >= 400 || actual !== link.authUserId) {
      fatal(`Verification failed for ${link.label}: expected ${link.authUserId}, got ${actual}`);
    }
  }
  console.log('    Linkage verified ✓');

  // 3c · Create memberships (service_role bypasses RLS)
  const memberships = [
    { user_id: authUserIds.adminA,        organization_id: QA_IDS.orgA, role: 'admin' },
    { user_id: authUserIds.adminB,        organization_id: QA_IDS.orgB, role: 'admin' },
    { user_id: authUserIds.agentA,        organization_id: QA_IDS.orgA, role: 'agent' },
    { user_id: authUserIds.agentB,        organization_id: QA_IDS.orgA, role: 'agent' },
    { user_id: authUserIds.agentC,        organization_id: QA_IDS.orgB, role: 'agent' },
    { user_id: authUserIds.inactiveAgent, organization_id: QA_IDS.orgA, role: 'agent' },
  ];

  for (const m of memberships) {
    const { status, body } = await serviceRoleQuery('memberships', 'POST', '', m);
    if (status === 201 || status === 200) {
      console.log(`    Membership: ${m.role.padEnd(6)} → org …${m.organization_id.slice(-4)}`);
    } else if (status === 409 || (body?.code === '23505')) {
      console.log(`    Membership: ${m.role.padEnd(6)} → org …${m.organization_id.slice(-4)} (exists)`);
    } else {
      fatal(`Membership insert failed (HTTP ${status}): ${JSON.stringify(body)}`);
    }
  }

  // 3d · Verify membership count
  const { body: memCheck } = await serviceRoleQuery('memberships', 'GET', 'select=id');
  const memCount = Array.isArray(memCheck) ? memCheck.length : 0;
  if (memCount < 6) {
    fatal(`Expected at least 6 memberships, found ${memCount}.`);
  }
  console.log(`    Memberships verified: ${memCount} rows ✓`);

  // 3e · Acquire access tokens for all users
  for (const user of QA_USERS) {
    accessTokens[user.key] = await authSignIn(user.email, user.password);
    console.log(`    Token: ${user.key}`);
  }

  phase('FIXTURES', 'PASS');
} catch (e) {
  phase('FIXTURES', 'FAIL');
  fatal(e.message);
}


// ═════════════════════════════════════════════════════════════════════
// STEP 4 — POLICIES: manual step + verification
// ═════════════════════════════════════════════════════════════════════

console.log('\n── STEP 4: POLICIES ────────────────────────────────────────');

if (process.env.POLICIES_APPLIED === 'true') {
  console.log('    POLICIES_APPLIED=true — skipping manual pause.');
} else {
  console.log('');
  console.log('    ┌─────────────────────────────────────────────────────┐');
  console.log('    │  MANUAL STEP: run 006_policies_prepared.sql in the │');
  console.log('    │  isolated project\'s SQL Editor, then press Enter.  │');
  console.log('    │                                                     │');
  console.log('    │  If already applied, press Enter directly.          │');
  console.log('    │                                                     │');
  console.log('    │  Or re-run with POLICIES_APPLIED=true to skip.      │');
  console.log('    └─────────────────────────────────────────────────────┘');
  console.log('');

  await new Promise(resolve => {
    if (!process.stdin.isTTY) {
      console.log('    (non-interactive stdin detected — continuing)');
      resolve();
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
    process.stdin.resume();
  });
}

// Verify policies are active: the old "authenticated all agents" policy
// should be gone, replaced by "agents admin manages own org".
// We test this by checking that the unlinked user (no membership) can
// NO LONGER read agents — under the old open policy, they could.
async function verifyPoliciesApplied() {
  const { status, body } = await safeFetch(
    `${SUPABASE_URL}/rest/v1/agents?select=id&limit=1`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessTokens.unlinkedUser}` } }
  );
  if (status === 200 && Array.isArray(body) && body.length > 0) {
    fatal(
      'Policy verification FAILED: unlinked user can still read agents.\n' +
      '         The old "authenticated all agents" policy is still active.\n' +
      '         Run 006_policies_prepared.sql in the SQL Editor and try again.'
    );
  }
}

try {
  await verifyPoliciesApplied();
  phase('POLICIES', 'PASS (verified — unlinked user denied agents)');
} catch (e) {
  phase('POLICIES', 'FAIL');
  fatal(e.message);
}


// ═════════════════════════════════════════════════════════════════════
// STEP 5 — TEST MATRIX
// ═════════════════════════════════════════════════════════════════════

console.log('\n── STEP 5: TEST MATRIX ─────────────────────────────────────');

const fixturesJson = JSON.stringify({
  anonKey: ANON_KEY,
  // organizations
  orgA: QA_IDS.orgA,
  orgB: QA_IDS.orgB,
  // agents (business entity ids)
  agentA: QA_IDS.agentA,
  agentB: QA_IDS.agentB,
  agentC: QA_IDS.agentC,
  inactiveAgent: QA_IDS.inactiveAgent,
  // auth.users.id values
  agentAAuthUserId: authUserIds.agentA,
  agentBAuthUserId: authUserIds.agentB,
  agentCAuthUserId: authUserIds.agentC,
  inactiveAgentAuthUserId: authUserIds.inactiveAgent,
  // properties
  propertyA: QA_IDS.propertyA,
  propertyB: QA_IDS.propertyB,
  propertyC: QA_IDS.propertyC,
  // leads
  leadA: QA_IDS.leadA,
  leadB: QA_IDS.leadB,
  // audits
  auditA: QA_IDS.auditA,
  // concierge
  conversationA: QA_IDS.conversationA,
  // sessions
  sessionA: QA_IDS.sessionA,
  // access tokens
  adminAToken: accessTokens.adminA,
  adminBToken: accessTokens.adminB,
  agentAToken: accessTokens.agentA,
  agentBToken: accessTokens.agentB,
  agentCToken: accessTokens.agentC,
  inactiveAgentToken: accessTokens.inactiveAgent,
  unlinkedUserToken: accessTokens.unlinkedUser,
});

try {
  const testFile = join(__dirname, 'authorization-foundation.test.mjs');
  execSync(`node "${testFile}"`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ISOLATED_SUPABASE_URL: SUPABASE_URL,
      ISOLATED_FIXTURES_JSON: fixturesJson,
    },
    timeout: 120_000,
  });
  phase('TEST MATRIX', 'PASS');
} catch (e) {
  phase('TEST MATRIX', 'FAIL');
  process.exit(1);
}


// ═════════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  ALL STEPS PASSED');
console.log('');
console.log('  ✓ FOUNDATION      schema + functions verified');
console.log('  ✓ AUTHENTICATION  7 auth users created/found');
console.log('  ✓ FIXTURES        agents linked, memberships created');
console.log('  ✓ POLICIES        cutover verified (old policies gone)');
console.log('  ✓ TEST MATRIX     all assertions passed');
console.log('');
console.log('  Authorization foundation is validated for production cutover.');
console.log('══════════════════════════════════════════════════════════════\n');
