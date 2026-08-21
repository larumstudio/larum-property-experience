/**
 * Admin-M6.5b · Truncation Visibility — Test Matrix
 *
 * Dependency-free (node:assert, node:fs, node:path). No browser. No
 * Supabase. Mock-based verification of the M6.5b scope:
 *
 *   1. Detection — admin-core.js's load() sets state.truncated.{leads,
 *      sessions,events} from the { count: 'exact' } PostgREST response,
 *      never from state.<x>.length === <cap> alone.
 *   2. Notice rendering — admin-ui.js's truncationNotice() produces the
 *      required message only when truncated, never suggests raising
 *      the cap.
 *   3. Wiring — the 4 consuming views (Dashboard, Leads, Visits,
 *      Analytics Overview) actually call truncationNotice() with the
 *      right state.truncated key.
 *
 * Groups:
 *   1 — load(): truncation detection (leads/sessions/events, success/
 *       exact-fit/error)
 *   2 — truncationNotice(): message shape
 *   3 — Consuming views render the notice conditionally
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const readFile = f => readFileSync(join(root, f), 'utf8');

globalThis.location = { protocol: 'https:', search: '' };
globalThis.window = {};

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

/* Mocks the exact chain admin-core.js's load() calls:
   .from(table).select('*', {count:'exact'}).gte().order().limit()
   `responses` is keyed by table name as passed to .from() —
   'leads' | 'sessions' | 'analytics_events'. */
function mockDataClient(responses) {
  return {
    from(table) {
      const resp = responses[table] || { data: [], count: 0, error: null };
      const chain = {
        select: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve) => Promise.resolve(resp).then(resolve)
      };
      return chain;
    }
  };
}

function mockDom() {
  const banner = { innerHTML: '', classList: { add() {}, remove() {} } };
  globalThis.document = {
    getElementById: (id) => (id === 'banner' ? banner : null),
    dispatchEvent: () => true,
    createElement: () => ({ id: '', className: '', textContent: '', classList: { add() {}, remove() {} }, setAttribute() {} }),
    body: { appendChild() {} },
    querySelectorAll: () => []
  };
  return banner;
}

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — load(): truncation detection
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] load(): truncation detection');

await test('leads: count > returned rows → state.truncated.leads = true', async () => {
  mockDom();
  globalThis.supabaseClient = mockDataClient({
    leads: { data: new Array(1000).fill({ id: 'x' }), count: 1347, error: null },
    sessions: { data: [], count: 0, error: null },
    analytics_events: { data: [], count: 0, error: null }
  });
  const adminCore = await import('../admin/admin-core.js?leads-truncated');
  await adminCore.load();
  assert.equal(adminCore.state.truncated.leads, true);
  assert.equal(adminCore.state.leads.length, 1000);
});

await test('leads: count === returned rows (exact fit at the cap) → NOT truncated', async () => {
  mockDom();
  globalThis.supabaseClient = mockDataClient({
    leads: { data: new Array(1000).fill({ id: 'x' }), count: 1000, error: null },
    sessions: { data: [], count: 0, error: null },
    analytics_events: { data: [], count: 0, error: null }
  });
  const adminCore = await import('../admin/admin-core.js?leads-exact-fit');
  await adminCore.load();
  assert.equal(adminCore.state.truncated.leads, false,
    'a period with exactly 1000 leads and no more must not be flagged as truncated');
});

await test('leads: well under the cap → NOT truncated', async () => {
  mockDom();
  globalThis.supabaseClient = mockDataClient({
    leads: { data: new Array(12).fill({ id: 'x' }), count: 12, error: null },
    sessions: { data: [], count: 0, error: null },
    analytics_events: { data: [], count: 0, error: null }
  });
  const adminCore = await import('../admin/admin-core.js?leads-low');
  await adminCore.load();
  assert.equal(adminCore.state.truncated.leads, false);
});

await test('leads: query error → NOT truncated (no false positive from a null count)', async () => {
  mockDom();
  globalThis.supabaseClient = mockDataClient({
    leads: { data: null, count: null, error: { message: 'permission denied' } },
    sessions: { data: [], count: 0, error: null },
    analytics_events: { data: [], count: 0, error: null }
  });
  const adminCore = await import('../admin/admin-core.js?leads-error');
  await adminCore.load();
  assert.equal(adminCore.state.truncated.leads, false);
  assert.deepEqual(adminCore.state.leads, []);
});

await test('sessions: count > returned rows → state.truncated.sessions = true', async () => {
  mockDom();
  globalThis.supabaseClient = mockDataClient({
    leads: { data: [], count: 0, error: null },
    sessions: { data: new Array(1000).fill({ id: 's' }), count: 1250, error: null },
    analytics_events: { data: [], count: 0, error: null }
  });
  const adminCore = await import('../admin/admin-core.js?sessions-truncated');
  await adminCore.load();
  assert.equal(adminCore.state.truncated.sessions, true);
});

await test('events: count > returned rows → state.truncated.events = true', async () => {
  mockDom();
  globalThis.supabaseClient = mockDataClient({
    leads: { data: [], count: 0, error: null },
    sessions: { data: [], count: 0, error: null },
    analytics_events: { data: new Array(3000).fill({ id: 'e' }), count: 4820, error: null }
  });
  const adminCore = await import('../admin/admin-core.js?events-truncated');
  await adminCore.load();
  assert.equal(adminCore.state.truncated.events, true);
});

await test('the query still requests { count: "exact" } — source check (limits are never raised)', async () => {
  const src = readFile('admin/admin-core.js');
  const loadFn = src.match(/export async function load\(\)[\s\S]*?\n\}/)[0];
  assert.match(loadFn, /select\('\*',\s*\{\s*count:\s*'exact'\s*\}\)/g);
  // Exactly the 3 M6.5b caps, unchanged from before this milestone —
  // this only inspects load()'s own body, not unrelated .limit() calls
  // elsewhere in the file (e.g. getRole()'s .limit(1)).
  const limitMatches = loadFn.match(/\.limit\((\d+)\)/g) || [];
  assert.deepEqual(limitMatches.sort(), ['.limit(1000)', '.limit(1000)', '.limit(3000)'].sort(),
    'M6.5b must not raise any of the 3 caps');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — truncationNotice(): message shape
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] truncationNotice()');

const adminUi = await import('../admin/admin-ui.js');

await test('returns empty string when not truncated', async () => {
  assert.equal(adminUi.truncationNotice(false, 1000, 'leads'), '');
});

await test('returns the required message, with the count, when truncated', async () => {
  const html = adminUi.truncationNotice(true, 1000, 'leads');
  assert.match(html, /Showing the latest 1,000 leads for this period/);
  assert.match(html, /Older records are not included/);
});

await test('formats the count with thousands separators (3000 events)', async () => {
  const html = adminUi.truncationNotice(true, 3000, 'events');
  assert.match(html, /3,000 events/);
});

await test('never mentions raising the limit / increasing the cap', async () => {
  const html = adminUi.truncationNotice(true, 1000, 'leads');
  assert.doesNotMatch(html, /increase|raise|higher limit/i);
});

await test('escapes the label (defense in depth, even though callers only pass literals today)', async () => {
  const html = adminUi.truncationNotice(true, 5, '<script>');
  assert.doesNotMatch(html, /<script>/);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — Consuming views wire the notice to the right state key
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Consuming views');

const dashboardSrc = readFile('admin/admin-dashboard.js');
const leadsSrc = readFile('admin/admin-leads.js');
const sessionsSrc = readFile('admin/admin-sessions.js');
const analyticsSrc = readFile('admin/admin-analytics.js');

await test('admin-dashboard.js renders both leads and sessions truncation notices', async () => {
  assert.match(dashboardSrc, /truncationNotice\(state\.truncated\.leads,\s*state\.leads\.length,\s*'leads'\)/);
  assert.match(dashboardSrc, /truncationNotice\(state\.truncated\.sessions,\s*state\.sessions\.length,\s*'sessions'\)/);
});

await test('admin-leads.js (global Leads list) renders the leads truncation notice', async () => {
  assert.match(leadsSrc, /truncationNotice\(state\.truncated\.leads,\s*state\.leads\.length,\s*'leads'\)/);
});

await test('admin-sessions.js (Visits list) renders the sessions truncation notice', async () => {
  assert.match(sessionsSrc, /truncationNotice\(state\.truncated\.sessions,\s*state\.sessions\.length,\s*'sessions'\)/);
});

await test('admin-analytics.js Overview renders both sessions and events truncation notices', async () => {
  assert.match(analyticsSrc, /truncationNotice\(state\.truncated\.sessions,\s*state\.sessions\.length,\s*'sessions'\)/);
  assert.match(analyticsSrc, /truncationNotice\(state\.truncated\.events,\s*state\.events\.length,\s*'events'\)/);
});

await test('none of the 4 consuming views hardcode a raised cap number (1500, 5000, etc.)', async () => {
  for (const [name, src] of [['dashboard', dashboardSrc], ['leads', leadsSrc], ['sessions', sessionsSrc], ['analytics', analyticsSrc]]) {
    assert.doesNotMatch(src, /\.limit\(\s*(1500|2000|5000|10000)\s*\)/, `${name} must not raise any cap`);
  }
});

/* Functional check (not just source-regex): render() with a mock
   state actually includes the notice text in its HTML output.
   admin-leads.js imports `state` from the plain, non-suffixed
   './admin-core.js' — so this test must mutate that SAME canonical
   module instance, not one of Group 1's isolated ?query-suffixed
   copies (those are deliberately separate instances and would not be
   visible to admin-leads.js at all). */
mockDom();
const canonicalCore = await import('../admin/admin-core.js');
const adminLeads = await import('../admin/admin-leads.js');

await test('admin-leads.js render(): notice text actually appears in the rendered HTML when truncated', async () => {
  canonicalCore.state.leads = new Array(1000).fill({ id: 'x', property: 'madrid', created_at: new Date().toISOString() });
  canonicalCore.state.truncated = { leads: true, sessions: false, events: false };

  const container = { innerHTML: '' };
  adminLeads.render(container);

  assert.match(container.innerHTML, /Showing the latest 1,000 leads for this period/);
});

await test('admin-leads.js render(): notice absent when not truncated', async () => {
  canonicalCore.state.leads = new Array(5).fill({ id: 'x', property: 'madrid', created_at: new Date().toISOString() });
  canonicalCore.state.truncated = { leads: false, sessions: false, events: false };

  const container = { innerHTML: '' };
  adminLeads.render(container);

  assert.doesNotMatch(container.innerHTML, /Showing the latest/);
});

console.log('\n══ Admin-M6.5b TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
