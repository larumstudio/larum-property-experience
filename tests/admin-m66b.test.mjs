/**
 * Admin-M6.6b · Concurrency Parity (updateAgent / updateAudit) — Test Matrix
 *
 * Dependency-free (node:assert, node:fs, node:path). No browser. No
 * Supabase. Same mechanism M6.5a already proved for the 5 property
 * saves + updateLead(), applied to the 2 remaining blind-overwrite
 * write points found in the M6.6 discovery. No new helper — both
 * reuse updateWithConcurrencyCheck() unchanged.
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

const adminStore = await import('../admin/admin-property-store.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

function mockClient(tables) {
  return {
    from(table) {
      const handlers = tables[table] || {};
      const chain = {
        select: (cols) => { chain._select = cols; return chain; },
        update: (patch) => { chain._updated = patch; return chain; },
        eq: (k, v) => { chain._eq = chain._eq || {}; chain._eq[k] = v; return chain; },
        then: (resolve) => Promise.resolve(
          handlers.then ? handlers.then(chain) : { data: [], error: null }
        ).then(resolve)
      };
      return chain;
    }
  };
}

const CASES = [
  { fn: 'updateAudit', table: 'audits', key: 'id' },
  { fn: 'updateAgent', table: 'agents', key: 'id' }
];

for (const { fn, table, key } of CASES) {
  const arg = fn === 'updateAgent' ? { name: 'New Name' } : { status: 'completed' };

  await test(`${fn}: success returns the fresh updated_at and reaches the ${table}.updated_at filter`, async () => {
    let eqUpdatedAt = null, eqKey = null;
    globalThis.window.supabaseClient = mockClient({
      [table]: {
        then: (chain) => {
          eqUpdatedAt = chain._eq?.updated_at;
          eqKey = chain._eq?.[key];
          return { data: [{ updated_at: '2026-01-02T00:00:00Z' }], error: null };
        }
      }
    });

    const result = await adminStore[fn]('row-1', arg, '2026-01-01T00:00:00Z');
    assert.equal(result, '2026-01-02T00:00:00Z');
    assert.equal(eqKey, 'row-1');
    assert.equal(eqUpdatedAt, '2026-01-01T00:00:00Z');
  });

  await test(`${fn}: 0 rows matched throws ConflictError`, async () => {
    globalThis.window.supabaseClient = mockClient({
      [table]: { then: () => ({ data: [], error: null }) }
    });
    await assert.rejects(
      () => adminStore[fn]('row-1', arg, 'stale'),
      (e) => e instanceof adminStore.ConflictError
    );
  });

  await test(`${fn}: a real Supabase error throws a plain Error, never a ConflictError`, async () => {
    globalThis.window.supabaseClient = mockClient({
      [table]: { then: () => ({ data: null, error: { message: 'permission denied' } }) }
    });
    await assert.rejects(
      () => adminStore[fn]('row-1', arg, '2026-01-01T00:00:00Z'),
      (e) => !(e instanceof adminStore.ConflictError) && /permission denied/.test(e.message)
    );
  });
}

await test('updateAgent: still only patches the allowed column whitelist (M5.x behavior unchanged)', async () => {
  let updatedPatch = null;
  globalThis.window.supabaseClient = mockClient({
    agents: {
      then: (chain) => { updatedPatch = chain._updated; return { data: [{ updated_at: 'x' }], error: null }; }
    }
  });
  await adminStore.updateAgent('row-1', { name: 'X', organization_id: 'hacked', auth_user_id: 'hacked' }, 'y');
  assert.equal(updatedPatch.name, 'X');
  assert.equal(updatedPatch.organization_id, undefined, 'organization_id must never be patchable via updateAgent');
  assert.equal(updatedPatch.auth_user_id, undefined, 'auth_user_id must never be patchable via updateAgent');
});

/* ═══════════════════════════════════════════════════════════════
   Structural — callers pass expectedUpdatedAt fresh + handle ConflictError
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[callers] admin-audit-panel.js / admin-agents.js pass expectedUpdatedAt + branch on ConflictError');

const auditSrc = readFile('admin/admin-audit-panel.js');
const agentsSrc = readFile('admin/admin-agents.js');

await test('admin-audit-panel.js: saveEdit() reads existing.updated_at fresh and syncs it back after success', async () => {
  const fn = auditSrc.match(/async function saveEdit\(\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /updateAudit\(state\.editingId, patch, existing\?\.updated_at\)/);
  assert.match(fn, /existing\.updated_at = newUpdatedAt/);
  assert.match(fn, /e instanceof ConflictError/);
});

await test('admin-agents.js: saveEdit() reads detailAgent.updated_at fresh and syncs both detailAgent and the list row after success', async () => {
  const fn = agentsSrc.match(/async function saveEdit\(\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /updateAgent\(editDraft\.id, patch, detailAgent\?\.updated_at\)/);
  assert.match(fn, /detailAgent\.updated_at = newUpdatedAt/);
  assert.match(fn, /agents\[idxA\]\.updated_at = newUpdatedAt/);
  assert.match(fn, /e instanceof ConflictError/);
});

console.log('\n══ Admin-M6.6b TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
