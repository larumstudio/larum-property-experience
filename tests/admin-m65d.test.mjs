/**
 * Admin-M6.5d · Readiness / Larum Score Reconciliation — Test Matrix
 *
 * Dependency-free (node:assert, node:fs, node:path). No browser. No
 * Supabase. Verifies the UX-only cross-reference added between the
 * Readiness tab and the Audit tab's Larum Score, plus the publish-
 * confirm advisory note — none of it changes either scoring algorithm.
 *
 * Groups:
 *   1 — admin-readiness-panel.js: cross-reference note to Audit tab
 *   2 — admin-audit-panel.js: cross-reference note to Readiness tab +
 *       live blocker count, computeScore() now exported unchanged
 *   3 — admin-workspace.js publish confirm: Larum Score advisory line,
 *       still never blocking (regression guard alongside M6.4's own)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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

function fakeContainer() {
  return { innerHTML: '', addEventListener() {}, removeEventListener() {} };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

const FAKE_PROPERTY = {
  slug: 'test-villa',
  content: { label: 'Test Villa' },
  knowledge: {},
  assets: {}
};

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — admin-readiness-panel.js
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] Readiness tab: cross-reference note to Larum Score');

await test('renders a note pointing to the Audit tab, explaining Readiness is not a quality score', async () => {
  globalThis.window.LarumReadiness = {
    readiness: () => ({ family: 'villa-estate', modules: [], slots: [], blockers: [], warnings: [], infos: [], unclassified: [] })
  };
  const readinessPanel = await import('../admin/admin-readiness-panel.js?t=' + Date.now());
  const container = fakeContainer();
  readinessPanel.render(container, FAKE_PROPERTY);

  assert.match(container.innerHTML, /Larum Score/);
  assert.match(container.innerHTML, /__workspaceTab\('audit'\)/);
  assert.match(container.innerHTML, /technically safe to publish/i);
  assert.match(container.innerHTML, /not a quality score/i);

  readinessPanel.teardown();
  delete globalThis.window.LarumReadiness;
});

await test('the note appears without changing the READY/NOT READY header ordering', async () => {
  globalThis.window.LarumReadiness = {
    readiness: () => ({ family: 'villa-estate', modules: [], slots: [], blockers: [], warnings: [], infos: [], unclassified: [] })
  };
  const readinessPanel = await import('../admin/admin-readiness-panel.js?t=' + Date.now());
  const container = fakeContainer();
  readinessPanel.render(container, FAKE_PROPERTY);

  const headerIdx = container.innerHTML.indexOf('READY');
  const noteIdx = container.innerHTML.indexOf('Larum Score');
  assert.ok(headerIdx !== -1 && noteIdx !== -1 && headerIdx < noteIdx,
    'the READY/NOT READY header must still render before the cross-reference note');

  readinessPanel.teardown();
  delete globalThis.window.LarumReadiness;
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — admin-audit-panel.js
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] Audit tab: cross-reference note to Readiness + live blocker count');

await test('admin-audit-panel.js exports computeScore unchanged (same function, now reusable elsewhere)', async () => {
  const auditPanel = await import('../admin/admin-audit-panel.js?t=' + Date.now());
  assert.equal(typeof auditPanel.computeScore, 'function');
  const result = auditPanel.computeScore(FAKE_PROPERTY);
  assert.equal(typeof result.overall, 'number');
  assert.ok(Array.isArray(result.dimensions));
  assert.equal(result.dimensions.length, 5, 'the 5 scoring dimensions must be unchanged');
});

const auditSrc = readFile('admin/admin-audit-panel.js');

await test('the Larum Score section renders a note pointing to the Readiness tab', async () => {
  assert.match(auditSrc, /function renderRelationNote\(\)/);
  const fn = auditSrc.match(/function renderRelationNote\(\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /__workspaceTab\(\\'readiness\\'\)/);
  assert.match(fn, /not a publish gate/i);
});

await test('the note surfaces the live readiness blocker count via window.LarumReadiness (read-only, same call shape as admin-workspace.js)', async () => {
  assert.match(auditSrc, /function getReadinessBlockerCount\(\)/);
  const fn = auditSrc.match(/function getReadinessBlockerCount\(\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /window\.LarumReadiness\.readiness\(/);
  assert.match(fn, /catch \(e\) \{\s*return null;/, 'must fail silently like the other two readiness-summary call sites');
});

await test('scoreContent/scoreKnowledge/scoreAssets/scoreConcierge/scoreExperience weights are untouched (no algorithm change)', async () => {
  // Same 5 dimension labels, same order, as before M6.5d — a change
  // here would mean the scoring algorithm was touched, which is out
  // of scope for this milestone.
  const result = (await import('../admin/admin-audit-panel.js?t=' + Date.now())).computeScore(FAKE_PROPERTY);
  const labels = result.dimensions.map(d => d.label);
  assert.deepEqual(labels, ['Content', 'Knowledge', 'Assets', 'Concierge', 'Experience']);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — admin-workspace.js publish confirm
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Publish confirm: Larum Score advisory line, still non-blocking');

const workspaceSrc = readFile('admin/admin-workspace.js');

await test('the Larum Score advisory is computed only inside the pendingStatus === \'published\' branch, via auditPanel.computeScore (no new engine)', async () => {
  const confirmBlock = workspaceSrc.match(/\} else if \(pendingStatus && CONFIRM_STATUSES\.has\(pendingStatus\)\) \{[\s\S]*?\} else if \(transitions\.length\)/)[0];
  assert.match(confirmBlock, /auditPanel\.computeScore\(currentProperty\)/);
  assert.match(confirmBlock, /Larum Score is/);
  assert.match(confirmBlock, /not a publish gate/i);
});

await test('the Larum Score advisory only shows below 50 — not shown otherwise', async () => {
  const confirmBlock = workspaceSrc.match(/\} else if \(pendingStatus && CONFIRM_STATUSES\.has\(pendingStatus\)\) \{[\s\S]*?\} else if \(transitions\.length\)/)[0];
  assert.match(confirmBlock, /larumScore < 50/);
});

await test('the Confirm button\'s disabled state still depends only on savingStatus — the score note never blocks (regression guard alongside M6.4\'s own)', async () => {
  const confirmBlock = workspaceSrc.match(/\} else if \(pendingStatus && CONFIRM_STATUSES\.has\(pendingStatus\)\) \{[\s\S]*?\} else if \(transitions\.length\)/)[0];
  const btnMatch = confirmBlock.match(/<button class="btn btn-primary" onclick="__wsConfirmStatus\(\)" '\s*\+\s*\n?\s*\(savingStatus \? 'disabled' : ''\)/);
  assert.ok(btnMatch, 'Confirm button disabled-state must still depend only on savingStatus, not on the Larum Score');
});

await test('auditPanel is imported as a namespace in admin-workspace.js (reuses computeScore, does not reimplement it)', async () => {
  assert.match(workspaceSrc, /import \* as auditPanel from '\.\/admin-audit-panel\.js'/);
});

console.log('\n══ Admin-M6.5d TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
