/**
 * Admin-M6.2 · Structural Tests — Role-aware UI + Agent Onboarding wiring
 *
 * Dependency-free (node:assert, node:fs, node:path). Same convention as
 * admin-m5x.test.mjs / admin-m61.test.mjs: dynamic import of the real
 * admin/*.js modules for contract + direct function checks, plus
 * source-text assertions for structural properties a DOM-less harness
 * can't otherwise observe.
 *
 * Groups:
 *   1 — admin-auth-context.js: the capability matrix itself
 *   2 — Secret hygiene: SERVICE_ROLE_KEY never referenced client-side
 *   3 — Endpoint + store wiring exist
 *   4 — [10] Agent UI: admin-only controls are gated, not just visible-but-failing
 *   5 — [11] Admin UI: existing controls are preserved (regression)
 *   6 — Navigation: sidebar hiding wired through capabilities
 *   7 — Protected boundaries: RLS/Migration 006/app.js untouched
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const readFile = f => readFileSync(join(root, f), 'utf8');
const exists = f => existsSync(join(root, f));

globalThis.location = { protocol: 'https:', search: '' };
globalThis.window = {};
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', className: '', textContent: '', classList: { add() {}, remove() {} }, setAttribute() {} }),
  body: { appendChild() {} },
  querySelectorAll: () => []
};

const authContext = await import('../admin/admin-auth-context.js');
const propertyStore = await import('../admin/admin-property-store.js');

const adminHtmlSrc          = readFile('admin.html');
const propertiesSrc         = readFile('admin/admin-properties.js');
const workspaceSrc          = readFile('admin/admin-workspace.js');
const auditPanelSrc         = readFile('admin/admin-audit-panel.js');
const conciergePanelSrc     = readFile('admin/admin-concierge-panel.js');
const propertyAnalyticsSrc  = readFile('admin/admin-property-analytics.js');
const agentsSrc             = readFile('admin/admin-agents.js');
const auditoriasSrc         = readFile('admin/admin-auditorias.js');
const invitEndpointSrc      = readFile('api/admin-invite-agent.mjs');
const appJsSrc               = readFile('app.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — Capability matrix
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] admin-auth-context.js capability matrix');

await test('capabilitiesFor("admin") grants every gated capability', async () => {
  const caps = authContext.capabilitiesFor('admin');
  for (const key of [
    'nav.agentes', 'nav.auditorias', 'properties.create', 'properties.changeStatus',
    'properties.assignAgent', 'properties.setDefault', 'agents.manage', 'audits.write',
    'analytics.raw', 'concierge.history'
  ]) {
    assert.equal(caps[key], true, `admin should have ${key}`);
  }
});

await test('capabilitiesFor("agent") denies every admin-only capability', async () => {
  const caps = authContext.capabilitiesFor('agent');
  for (const key of [
    'nav.agentes', 'nav.auditorias', 'properties.create', 'properties.changeStatus',
    'properties.assignAgent', 'properties.setDefault', 'agents.manage', 'audits.write',
    'analytics.raw', 'concierge.history'
  ]) {
    assert.equal(caps[key], false, `agent should NOT have ${key}`);
  }
});

await test('capabilitiesFor("agent") still grants what an agent needs to work', async () => {
  const caps = authContext.capabilitiesFor('agent');
  assert.equal(caps['nav.propiedades'], true);
  assert.equal(caps['nav.leads'], true);
  assert.equal(caps['nav.analytics'], true);
  assert.equal(caps['nav.dashboard'], true);
});

await test('an unrecognized/null role fails CLOSED (agent table), not open', async () => {
  const caps = authContext.capabilitiesFor(undefined);
  assert.equal(caps['properties.create'], false);
  assert.equal(caps['agents.manage'], false);
});

await test('resolveCapabilities() is exported and async', async () => {
  assert.equal(typeof authContext.resolveCapabilities, 'function');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — Secret hygiene
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] SUPABASE_SERVICE_ROLE_KEY never reaches client code');

await test('SERVICE_ROLE_KEY appears in the endpoint, nowhere in admin/*.js or admin.html', async () => {
  assert.match(invitEndpointSrc, /SUPABASE_SERVICE_ROLE_KEY/);

  const adminDir = join(root, 'admin');
  const clientFiles = readdirSync(adminDir).filter(f => f.endsWith('.js'));
  for (const f of clientFiles) {
    const src = readFileSync(join(adminDir, f), 'utf8');
    assert.doesNotMatch(src, /SERVICE_ROLE/i, `${f} must never reference the service role key`);
  }
  assert.doesNotMatch(adminHtmlSrc, /SERVICE_ROLE/i);
});

await test('the endpoint never logs or returns the service key value itself', async () => {
  // console.log/error calls in the endpoint must not interpolate SB_SERVICE.
  const logLines = invitEndpointSrc.match(/console\.(log|error|warn)\([^)]*\)/g) || [];
  for (const line of logLines) assert.doesNotMatch(line, /SB_SERVICE/);
  // res.json(...) calls must not include SB_SERVICE either.
  const resJsonLines = invitEndpointSrc.match(/res\.status\([^)]*\)\.json\(\{[^}]*\}\)/g) || [];
  for (const line of resJsonLines) assert.doesNotMatch(line, /SB_SERVICE/);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — Endpoint + store wiring
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Endpoint + store wiring');

await test('api/admin-invite-agent.mjs exists and exports a default handler', async () => {
  assert.ok(exists('api/admin-invite-agent.mjs'));
  const mod = await import('../api/admin-invite-agent.mjs');
  assert.equal(typeof mod.default, 'function');
});

await test('admin-property-store.js exports inviteAgent()', async () => {
  assert.equal(typeof propertyStore.inviteAgent, 'function');
});

await test('inviteAgent() calls the endpoint via fetch, not the Admin API directly', async () => {
  const storeSrc = readFile('admin/admin-property-store.js');
  const section = storeSrc.slice(storeSrc.indexOf('export async function inviteAgent'));
  assert.match(section, /fetch\(\s*['"]\/api\/admin-invite-agent['"]/);
  assert.doesNotMatch(section, /auth\.admin\./); // never calls Admin API from the browser
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3b — Access card data correctness (regression guard)
   Found during the M6.2 production smoke test: AGENT_COLUMNS never
   selected auth_user_id, so loadAgent()/loadAllAgents() always
   returned it as undefined — the Access card showed "No account yet"
   even for an agent whose invite had genuinely succeeded (verified
   directly against the database at the time; the backend/endpoint
   were correct, only this column list was wrong). Two layers on
   purpose: the source check alone would not have caught this bug
   (AGENT_COLUMNS is a plain string — nothing forces its content to
   match what the UI actually needs), so the functional mock test
   below is the one that actually protects the Access card going
   forward.
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3b] Access card: loadAgent()/loadAllAgents() must select auth_user_id');

await test('AGENT_COLUMNS source includes auth_user_id', async () => {
  const storeSrc = readFile('admin/admin-property-store.js');
  const m = storeSrc.match(/const AGENT_COLUMNS = '([^']+)'/);
  assert.ok(m, 'AGENT_COLUMNS constant not found');
  const cols = m[1].split(',').map(c => c.trim());
  assert.ok(cols.includes('auth_user_id'), 'AGENT_COLUMNS is missing auth_user_id');
});

await test('loadAgent() actually requests auth_user_id from Supabase (functional, not just source text)', async () => {
  const origClient = globalThis.window.supabaseClient;
  let requestedSelect = null;
  globalThis.window.supabaseClient = {
    from(table) {
      const chain = {
        select: (cols) => { requestedSelect = cols; return chain; },
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: { id: 'a1', auth_user_id: 'u1' }, error: null })
      };
      return chain;
    }
  };
  try {
    const agent = await propertyStore.loadAgent('a1');
    assert.ok(requestedSelect && requestedSelect.includes('auth_user_id'), `select() was called without auth_user_id: "${requestedSelect}"`);
    assert.equal(agent.auth_user_id, 'u1', 'loadAgent() must return the auth_user_id it fetched');
  } finally {
    globalThis.window.supabaseClient = origClient;
  }
});

await test('loadAllAgents() actually requests auth_user_id from Supabase (functional, not just source text)', async () => {
  const origClient = globalThis.window.supabaseClient;
  let requestedSelect = null;
  globalThis.window.supabaseClient = {
    from(table) {
      const chain = {
        select: (cols) => { requestedSelect = cols; return chain; },
        order: () => chain,
        then: (resolve) => Promise.resolve({ data: [{ id: 'a1', auth_user_id: 'u1' }, { id: 'a2', auth_user_id: null }], error: null }).then(resolve)
      };
      return chain;
    }
  };
  try {
    const agents = await propertyStore.loadAllAgents();
    assert.ok(requestedSelect && requestedSelect.includes('auth_user_id'), `select() was called without auth_user_id: "${requestedSelect}"`);
    assert.equal(agents.find(a => a.id === 'a1').auth_user_id, 'u1');
    assert.equal(agents.find(a => a.id === 'a2').auth_user_id, null);
  } finally {
    globalThis.window.supabaseClient = origClient;
  }
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 4 — [10] Agent UI: gated, not just failing silently
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[10] Agent UI has no admin-only controls');

await test('admin-properties.js hides "+ Create property" unless properties.create', async () => {
  assert.match(propertiesSrc, /caps\[.properties\.create.\]/);
  assert.match(propertiesSrc, /canCreate/);
});

await test('admin-properties.js toggleCreate() refuses to open the form without the capability', async () => {
  const fn = propertiesSrc.slice(propertiesSrc.indexOf('function toggleCreate'));
  assert.match(fn.slice(0, 200), /caps\[.properties\.create.\]/);
});

await test('admin-workspace.js gates status/default/agent controls behind capabilities', async () => {
  assert.match(workspaceSrc, /caps\[.properties\.changeStatus.\]/);
  assert.match(workspaceSrc, /caps\[.properties\.setDefault.\]/);
  assert.match(workspaceSrc, /caps\[.properties\.assignAgent.\]/);
});

await test('admin-workspace.js handleSaveMeta() only sends is_default/agent_id when the capability allows it (no silent-clear bug)', async () => {
  const fn = workspaceSrc.slice(
    workspaceSrc.indexOf('async function handleSaveMeta'),
    workspaceSrc.indexOf('async function handleSaveMeta') + 1800
  );
  // The unconditional "read the DOM element or default to false/null"
  // pattern from before M6.2 must be gone — every read of ws_default /
  // ws_agent must be inside a capability check.
  assert.doesNotMatch(fn, /document\.getElementById\(.ws_default.\)\?\.checked \|\| false;\s*\n\s*const agentId/);
  assert.match(fn, /caps && caps\[.properties\.setDefault.\]/);
  assert.match(fn, /caps && caps\[.properties\.assignAgent.\]/);
});

await test('admin-audit-panel.js hides "+ New audit" / Edit / Delete unless audits.write', async () => {
  assert.match(auditPanelSrc, /caps\[.audits\.write.\]/);
});

await test('admin-concierge-panel.js shows an explicit notice for History when !concierge.history', async () => {
  assert.match(conciergePanelSrc, /caps\[.concierge\.history.\]/);
  assert.match(conciergePanelSrc, /admin-only/i);
});

await test('admin-concierge-panel.js defaults an agent to the Knowledge subtab, not the restricted one', async () => {
  assert.match(conciergePanelSrc, /canHistory \? 'history' : 'knowledge'/);
});

await test('admin-property-analytics.js (Workspace tab) shows admin-only notice when !analytics.raw', async () => {
  assert.match(propertyAnalyticsSrc, /caps\[.analytics\.raw.\]/);
  assert.match(propertyAnalyticsSrc, /admin-only/i);
});

await test('admin-agents.js render() refuses the list entirely when !agents.manage', async () => {
  assert.match(agentsSrc, /caps\[.agents\.manage.\]/);
  const fn = agentsSrc.slice(agentsSrc.indexOf('export async function render'), agentsSrc.indexOf('export async function render') + 900);
  assert.match(fn, /Not available/);
});

await test('admin-auditorias.js render() refuses the global list when !nav.auditorias', async () => {
  assert.match(auditoriasSrc, /caps\[.nav\.auditorias.\]/);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 5 — [11] Admin UI: existing controls preserved
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[11] Admin UI keeps its existing controls');

await test('admin-properties.js still defines the create form + submit flow', async () => {
  assert.match(propertiesSrc, /function renderCreateForm/);
  assert.match(propertiesSrc, /function handleCreateSubmit/);
  assert.match(propertiesSrc, /createProperty\(/);
});

await test('admin-workspace.js still defines status transitions and the confirm flow', async () => {
  assert.match(workspaceSrc, /STATUS_TRANSITIONS/);
  assert.match(workspaceSrc, /CONFIRM_STATUSES/);
  assert.match(workspaceSrc, /function handleStatusChange/);
  assert.match(workspaceSrc, /function confirmStatusChange/);
});

await test('admin-audit-panel.js still defines full CRUD (create/edit/delete)', async () => {
  assert.match(auditPanelSrc, /createAudit/);
  assert.match(auditPanelSrc, /updateAudit/);
  assert.match(auditPanelSrc, /deleteAudit/);
});

await test('admin-agents.js still defines create + edit for agents (admin path unchanged)', async () => {
  assert.match(agentsSrc, /function renderCreateForm/);
  assert.match(agentsSrc, /function renderEditForm/);
  assert.match(agentsSrc, /createAgent\(/);
  assert.match(agentsSrc, /updateAgent\(/);
});

await test('admin-agents.js has the new Access/Invite card', async () => {
  assert.match(agentsSrc, /function renderAccessCard/);
  assert.match(agentsSrc, /inviteAgent\(/);
  assert.match(agentsSrc, /__agInvite/);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 6 — Navigation gating
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[6] Sidebar navigation gated through capabilities');

await test('admin.html imports resolveCapabilities and applies it on data-loaded', async () => {
  assert.match(adminHtmlSrc, /import\s*\{\s*resolveCapabilities\s*\}\s*from\s*['"]\.\/admin\/admin-auth-context\.js['"]/);
  assert.match(adminHtmlSrc, /resolveCapabilities\(\)/);
});

await test('admin.html hides a nav button only via style.display, never removes it from the DOM', async () => {
  // Removing the element would break navigate()'s existing click-binding
  // loop, which already ran once at boot over the full node list.
  const section = adminHtmlSrc.slice(adminHtmlSrc.indexOf("addEventListener('larum:data-loaded'"));
  assert.match(section, /btn\.style\.display/);
  assert.doesNotMatch(section, /\.remove\(\)/);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 7 — Protected boundaries
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[7] Protected boundaries — RLS / Migration 006 / app.js untouched');

await test('app.js has no reference to agent onboarding, invite, or SERVICE_ROLE', async () => {
  assert.doesNotMatch(appJsSrc, /inviteAgent|admin-invite-agent|SERVICE_ROLE/i);
});

await test('no new migration file was added for M6.2 (no RLS/schema change)', async () => {
  const migDir = join(root, 'docs', 'migrations');
  const files = readdirSync(migDir);
  const newForM62 = files.filter(f => /m6\.?2|invite/i.test(f));
  assert.equal(newForM62.length, 0, `unexpected migration-looking file(s) for M6.2: ${newForM62.join(', ')}`);
});

await test('006_policies_prepared.sql and 006_authorization_foundation.sql are untouched (existence + no M6.2 markers)', async () => {
  assert.ok(exists('docs/migrations/006_policies_prepared.sql'));
  assert.ok(exists('docs/migrations/006_authorization_foundation.sql'));
  const policies = readFile('docs/migrations/006_policies_prepared.sql');
  assert.doesNotMatch(policies, /M6\.2/);
});

/* ═══════════════════════════════════════════════════════════════
   SUMMARY
   ═══════════════════════════════════════════════════════════════ */
console.log('\n══ Admin-M6.2 TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
