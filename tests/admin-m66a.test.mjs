/**
 * Admin-M6.6a · Lead History UI — Test Matrix
 *
 * Dependency-free (node:assert, node:fs, node:path). No browser. No
 * Supabase. Verifies the on-demand lead_history reader, actor-label
 * resolution, the pure historyHtml() renderer, and that both lead
 * drawers (global admin-leads.js, per-property admin-property-leads.js)
 * wire it in with the same stale-response guard.
 *
 * Uses RLS already shipped in migration 008 (M6.5c) — no schema/policy
 * change here, matches the approved M6.6a scope.
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
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', className: '', textContent: '', classList: { add() {}, remove() {} }, setAttribute() {} }),
  body: { appendChild() {} },
  querySelectorAll: () => []
};

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

function mockClient(handlers) {
  return {
    from(table) {
      const chain = {
        select: () => chain,
        eq: (k, v) => { chain._eq = chain._eq || {}; chain._eq[k] = v; return chain; },
        order: () => chain,
        then: (resolve) => Promise.resolve(
          handlers[table] ? handlers[table](chain) : { data: [], error: null }
        ).then(resolve)
      };
      return chain;
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — admin-core.js: loadLeadHistory / actor resolution
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] admin-core.js: loadLeadHistory / ensureAgentDirectory / actorLabel');

await test('loadLeadHistory() queries lead_history filtered by lead_id, newest first', async () => {
  let capturedEq = null;
  globalThis.supabaseClient = mockClient({
    lead_history: (chain) => { capturedEq = chain._eq; return { data: [{ id: 'h1' }], error: null }; }
  });
  const adminCore = await import('../admin/admin-core.js?t=' + Date.now());
  const rows = await adminCore.loadLeadHistory('lead-123');

  assert.deepEqual(rows, [{ id: 'h1' }]);
  assert.equal(capturedEq.lead_id, 'lead-123');
  delete globalThis.supabaseClient;
});

await test('loadLeadHistory() throws a plain Error on a real Supabase error', async () => {
  globalThis.supabaseClient = mockClient({
    lead_history: () => ({ data: null, error: { message: 'permission denied' } })
  });
  const adminCore = await import('../admin/admin-core.js?t=' + Date.now());
  await assert.rejects(() => adminCore.loadLeadHistory('lead-123'), /permission denied/);
  delete globalThis.supabaseClient;
});

await test('actorLabel(): the viewer\'s own auth uid resolves to "You"', async () => {
  const adminCore = await import('../admin/admin-core.js?t=' + Date.now());
  adminCore.state.user = { id: 'viewer-1' };
  assert.equal(adminCore.actorLabel('viewer-1'), 'You');
  adminCore.state.user = null;
});

await test('actorLabel(): null changed_by resolves to "System"', async () => {
  const adminCore = await import('../admin/admin-core.js?t=' + Date.now());
  assert.equal(adminCore.actorLabel(null), 'System');
});

await test('actorLabel(): an unresolvable id (not the viewer, not in the agent directory) falls back to "Admin"', async () => {
  const adminCore = await import('../admin/admin-core.js?t=' + Date.now());
  assert.equal(adminCore.actorLabel('some-other-uuid'), 'Admin');
});

await test('ensureAgentDirectory(): builds a Map of auth_user_id -> name from loadAllAgents(), used by actorLabel()', async () => {
  globalThis.window.supabaseClient = mockClient({
    agents: () => ({
      data: [
        { id: 'a1', name: 'Agent One', auth_user_id: 'auth-agent-1' },
        { id: 'a2', name: 'Agent Two', auth_user_id: null } // no auth linked yet — must not crash
      ],
      error: null
    })
  });
  const adminCore = await import('../admin/admin-core.js?t=' + Date.now());
  await adminCore.ensureAgentDirectory();
  assert.equal(adminCore.actorLabel('auth-agent-1'), 'Agent One');
  delete globalThis.window.supabaseClient;
});

await test('ensureAgentDirectory(): a failed load fails open to generic labels, never throws', async () => {
  globalThis.window.supabaseClient = mockClient({
    agents: () => ({ data: null, error: { message: 'network error' } })
  });
  const adminCore = await import('../admin/admin-core.js?t=' + Date.now());
  await assert.doesNotReject(() => adminCore.ensureAgentDirectory());
  delete globalThis.window.supabaseClient;
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — admin-ui.js: historyHtml() pure renderer
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] historyHtml() renderer');

await test('renders "no changes" empty state for zero rows', async () => {
  const adminUi = await import('../admin/admin-ui.js?t=' + Date.now());
  assert.match(adminUi.historyHtml([]), /No changes recorded yet/);
});

await test('a status-field row renders old and new as badges, not plain text', async () => {
  const adminUi = await import('../admin/admin-ui.js?t=' + Date.now());
  const html = adminUi.historyHtml([
    { changed_at: '2026-01-01T00:00:00Z', field: 'status', old_value: 'new', new_value: 'contacted', actor: 'Agent One' }
  ]);
  assert.match(html, /badge/);
  assert.match(html, /Agent One/);
});

await test('a notes-field row shows old value struck through and new value plain, both escaped', async () => {
  const adminUi = await import('../admin/admin-ui.js?t=' + Date.now());
  const html = adminUi.historyHtml([
    { changed_at: '2026-01-01T00:00:00Z', field: 'notes', old_value: '<script>x</script>', new_value: 'called back', actor: 'You' }
  ]);
  assert.doesNotMatch(html, /<script>x<\/script>/, 'raw HTML in a note must never reach the DOM unescaped');
  assert.match(html, /text-decoration:line-through/);
  assert.match(html, /called back/);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — drawer wiring (structural)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Both lead drawers wire the history mount with the same stale-response guard');

const leadsSrc = readFile('admin/admin-leads.js');
const propertyLeadsSrc = readFile('admin/admin-property-leads.js');

for (const [name, src] of [['admin-leads.js', leadsSrc], ['admin-property-leads.js', propertyLeadsSrc]]) {
  await test(name + ': drawer includes a leadHistoryMount section and calls loadHistoryInto()', async () => {
    assert.match(src, /section\('Change history', '<div id="leadHistoryMount">Loading…<\/div>'\)/);
    assert.match(src, /loadHistoryInto\(l\.id\)/);
  });

  await test(name + ': loadHistoryInto() guards against a stale response after the drawer moved on', async () => {
    const fn = src.match(/async function loadHistoryInto\(leadId\)[\s\S]*?\n\}/)[0];
    assert.match(fn, /openHistoryForLeadId = leadId/);
    assert.match(fn, /if \(openHistoryForLeadId !== leadId\) return/);
    assert.match(fn, /loadLeadHistory\(leadId\)/);
    assert.match(fn, /ensureAgentDirectory\(\)/);
    assert.match(fn, /actorLabel\(r\.changed_by\)/);
  });

  await test(name + ': teardown() resets openHistoryForLeadId (no stale write after the view tears down)', async () => {
    const fn = src.match(/export function teardown\(\)[\s\S]*?\n\}/)[0];
    assert.match(fn, /openHistoryForLeadId = null/);
  });
}

console.log('\n══ Admin-M6.6a TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
