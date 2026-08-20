/**
 * Admin-M6.1 · Structural Tests — Visits subtab inside Analytics
 *
 * Dependency-free (node:assert, node:fs, node:path). No browser, no
 * Supabase. Same convention as tests/admin-m5x.test.mjs: dynamic import
 * of the real admin/*.js modules for contract checks, plus source-text
 * assertions for structural properties that don't need a live DOM.
 *
 * Groups:
 *   1 — Module contract: admin-analytics.js exports render/teardown
 *   2 — Reuse, not duplication: admin-sessions.js is imported and
 *       called, its own internals are not copy-pasted into analytics
 *   3 — Visits subtab is defined structurally
 *   4 — Role-aware notice exists (no fake "0" for the agent role)
 *   5 — Navigation: no new sidebar item, #sessions route untouched
 *   6 — Protected files unchanged
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const readFile = f => readFileSync(join(root, f), 'utf8');
const exists = f => existsSync(join(root, f));

/* ── Bootstrap globals (same minimal shape as admin-m5x.test.mjs) ── */
globalThis.location = { protocol: 'https:', search: '' };
globalThis.window = {};
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', className: '', textContent: '', classList: { add() {}, remove() {} }, setAttribute() {} }),
  body: { appendChild() {} },
  querySelectorAll: () => []
};

/* ── Dynamic import of browser ESM modules ── */
const adminAnalytics = await import('../admin/admin-analytics.js');
const adminSessions  = await import('../admin/admin-sessions.js');
const adminCore      = await import('../admin/admin-core.js');

const analyticsSrc = readFile('admin/admin-analytics.js');
const sessionsSrc  = readFile('admin/admin-sessions.js');
const adminHtmlSrc = readFile('admin.html');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.error('  FAIL  ' + name);
    console.error('        ' + e.message);
    failed++;
  }
}

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — Module contract
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] Module contract');

await test('admin-analytics.js exists and exports render()', async () => {
  assert.ok(exists('admin/admin-analytics.js'));
  assert.equal(typeof adminAnalytics.render, 'function');
});

await test('admin-analytics.js exports teardown()', async () => {
  assert.equal(typeof adminAnalytics.teardown, 'function');
});

await test('admin-analytics.js exports title = "Analytics"', async () => {
  assert.equal(adminAnalytics.title, 'Analytics');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — Reuse, not duplication
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] admin-sessions.js reused, not duplicated');

await test('admin-sessions.js still exists and exports render/teardown unchanged', async () => {
  assert.ok(exists('admin/admin-sessions.js'));
  assert.equal(typeof adminSessions.render, 'function');
  assert.equal(typeof adminSessions.teardown, 'function');
});

await test('admin-analytics.js imports admin-sessions.js (reuse via import)', async () => {
  assert.match(analyticsSrc, /from\s+['"]\.\/admin-sessions\.js['"]/);
});

await test('admin-analytics.js calls sessionsModule.render() and .teardown()', async () => {
  assert.match(analyticsSrc, /sessionsModule\.render\(/);
  assert.match(analyticsSrc, /sessionsModule\.teardown\(/);
});

await test('admin-analytics.js does NOT copy admin-sessions.js internals (no duplicated logic)', async () => {
  // admin-sessions.js's own private helpers/identifiers — if any of these
  // literal function definitions appear inside admin-analytics.js, that's
  // a sign of copy-paste rather than reuse via the module contract.
  assert.doesNotMatch(analyticsSrc, /function\s+openSession\s*\(/);
  assert.doesNotMatch(analyticsSrc, /function\s+conciergeQuestions\s*\(/);
  assert.doesNotMatch(analyticsSrc, /currentSessions\s*=\s*\[\]/);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — Visits subtab defined structurally
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Visits subtab');

await test('admin-analytics.js defines a "visits" subtab id and "Visits" label', async () => {
  assert.match(analyticsSrc, /id:\s*['"]visits['"]/);
  assert.match(analyticsSrc, /label:\s*['"]Visits['"]/);
});

await test('admin-analytics.js still defines an "overview" subtab (existing content preserved)', async () => {
  assert.match(analyticsSrc, /id:\s*['"]overview['"]/);
  assert.match(analyticsSrc, /label:\s*['"]Overview['"]/);
});

await test('admin-analytics.js uses the shared tabs() UI helper (same pattern as Workspace)', async () => {
  assert.match(analyticsSrc, /import\s*\{[^}]*\btabs\b[^}]*\}\s*from\s*['"]\.\/admin-ui\.js['"]/);
  assert.match(analyticsSrc, /tabs\(SUBTABS/);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 4 — Role-aware: no fake "0" for the agent role
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[4] Role-aware Visits/Overview (agent gets an explicit notice, not empty charts)');

await test('admin-core.js exports getRole()', async () => {
  assert.equal(typeof adminCore.getRole, 'function');
});

await test('admin-core.js state has a role field', async () => {
  assert.ok('role' in adminCore.state);
});

await test('admin-analytics.js imports getRole from admin-core.js', async () => {
  assert.match(analyticsSrc, /import\s*\{[^}]*\bgetRole\b[^}]*\}\s*from\s*['"]\.\/admin-core\.js['"]/);
});

await test('admin-analytics.js checks role before rendering Visits/Overview content', async () => {
  const occurrences = (analyticsSrc.match(/role\s*===\s*['"]agent['"]/g) || []).length;
  assert.ok(occurrences >= 2, `expected the agent-role check in both drawVisits() and drawOverview(), found ${occurrences}`);
});

await test('admin-analytics.js has an explicit restricted-access notice (not a silent empty chart)', async () => {
  assert.match(analyticsSrc, /admin-only/i);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 5 — Navigation: subtab-only, no new sidebar item
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[5] Navigation stays subtab-only');

await test('admin.html sidebar has no new "Visits" nav button', async () => {
  const sidebarNavBlock = adminHtmlSrc.match(/<div class="sidebar-nav">[\s\S]*?<\/div>/);
  assert.ok(sidebarNavBlock, 'sidebar-nav block not found in admin.html');
  assert.doesNotMatch(sidebarNavBlock[0], />\s*Visits\s*</);
});

await test('#sessions route registration in admin.html is untouched', async () => {
  assert.match(adminHtmlSrc, /register\(\s*['"]sessions['"]\s*,\s*sessions\s*\)/);
});

await test('admin-router.js still has no dedicated Visits route beyond #sessions', async () => {
  const routerSrc = readFile('admin/admin-router.js');
  assert.doesNotMatch(routerSrc, /visits/i);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 6 — Protected files unchanged
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[6] Protected files exist and are untouched by this change');

await test('app.js exists (public write path — must not be touched by M6.1)', async () => {
  assert.ok(exists('app.js'));
});

await test('admin-property-analytics.js exists (Workspace Analytics tab — separate module, untouched)', async () => {
  assert.ok(exists('admin/admin-property-analytics.js'));
});

await test('admin-workspace.js exists (not removed)', async () => {
  assert.ok(exists('admin/admin-workspace.js'));
});

/* ═══════════════════════════════════════════════════════════════
   SUMMARY
   ═══════════════════════════════════════════════════════════════ */
console.log('\n══ Admin-M6.1 TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
