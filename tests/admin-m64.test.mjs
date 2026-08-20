/**
 * Admin-M6.4 · Property Workspace hardening — fixes for the 5 findings
 * from the M6.4 discovery audit rated 🔴 (can break/compromise/hinder
 * the real production cycle of a Property). Discovery-only items rated
 * 🟡/🟢 are intentionally not addressed here — see the M6.4 report.
 *
 * Mix of functional tests (dynamic import of the real module, mocked
 * window/document/supabaseClient) and source-text structural tests —
 * functional wherever the module's exports make it feasible, structural
 * where a fix lives inside a DOM-heavy, module-private function a
 * DOM-less harness can't drive end-to-end (same convention documented
 * in admin-m62.test.mjs's own header).
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

const workspaceSrc = readFile('admin/admin-workspace.js');
const leadsSrc = readFile('admin/admin-leads.js');
const propertyLeadsSrc = readFile('admin/admin-property-leads.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

/* ═══════════════════════════════════════════════════════════════
   1 — Content editor: tab-switch no longer discards unsaved edits
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] Content editor preserves unsaved edits across a same-property re-render');

await test('render() called twice for the SAME slug keeps the in-progress edit (functional)', async () => {
  const contentEditor = await import('../admin/admin-content-editor.js');
  const container = { innerHTML: '' };
  const property = { slug: 'madrid', content: { label: 'Original label' }, knowledge: {}, assets: {} };

  contentEditor.render(container, property);
  assert.match(container.innerHTML, /Original label/);

  window.__ceInput('label', 'Edited by operator, not yet saved');
  // Simulates admin-workspace.js's switchTab()->draw() re-invoking
  // render() with the same property object on tab switch-and-back.
  contentEditor.render(container, property);

  assert.match(container.innerHTML, /Edited by operator, not yet saved/,
    'unsaved edit must survive a re-render for the same slug — this was the M6.4 data-loss bug');
  assert.doesNotMatch(container.innerHTML, /(?<!Edited by operator, not yet saved">)Original label/,
    'draft must not have been silently reset back to the saved value');

  contentEditor.teardown();
});

await test('render() called for a DIFFERENT slug correctly resets the draft (no regression)', async () => {
  const contentEditor = await import('../admin/admin-content-editor.js');
  const container = { innerHTML: '' };

  contentEditor.render(container, { slug: 'madrid', content: { label: 'Madrid label' }, knowledge: {}, assets: {} });
  window.__ceInput('label', 'Unsaved Madrid edit');

  contentEditor.render(container, { slug: 'marbella', content: { label: 'Marbella label' }, knowledge: {}, assets: {} });
  assert.match(container.innerHTML, /Marbella label/);
  assert.doesNotMatch(container.innerHTML, /Unsaved Madrid edit/,
    'switching to a genuinely different property must NOT carry over the other property\'s draft');

  contentEditor.teardown();
});

/* ═══════════════════════════════════════════════════════════════
   2 — Assets editor: same fix, plus confirmation on removeSpace()
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] Assets editor preserves unsaved edits + confirms space removal');

await test('render() called twice for the SAME slug keeps the in-progress edit (functional)', async () => {
  const assetsEditor = await import('../admin/admin-assets-editor.js');
  const container = { innerHTML: '' };
  const property = { slug: 'madrid', assets: { bandImage: 'https://example.invalid/original.jpg' }, content: {} };

  assetsEditor.render(container, property);
  window.__aeToggle('band'); // Band section is closed by default
  window.__aeUrl('bandImage', 'https://example.invalid/EDITED.jpg', null);
  assetsEditor.render(container, property); // sameSlug — openSections state (band open) is preserved too

  assert.match(container.innerHTML, /EDITED\.jpg/,
    'unsaved edit must survive a re-render for the same slug — this was the M6.4 data-loss bug');

  assetsEditor.teardown();
});

await test('removeSpace() asks for confirmation and respects cancel (functional, was zero-confirmation before M6.4)', async () => {
  const assetsEditor = await import('../admin/admin-assets-editor.js');
  const container = { innerHTML: '' };
  const property = {
    slug: 'madrid',
    assets: { spaces: { 'Master suite': { image: 'https://example.invalid/master.jpg' } } },
    content: {}
  };
  assetsEditor.render(container, property);
  window.__aeToggle('spaces'); // Spaces section is closed by default
  assert.match(container.innerHTML, /Master suite/);

  const origConfirm = window.confirm;
  try {
    window.confirm = () => false; // operator cancels
    window.__aeRemoveSpace('Master suite');
    assetsEditor.render(container, property); // same slug — re-render shows current draft
    assert.match(container.innerHTML, /Master suite/, 'cancelling the confirm must NOT remove the space');

    window.confirm = () => true; // operator confirms
    window.__aeRemoveSpace('Master suite');
    assetsEditor.render(container, property);
    assert.doesNotMatch(container.innerHTML, /Master suite/, 'confirming must remove the space');
  } finally {
    window.confirm = origConfirm;
    assetsEditor.teardown();
  }
});

/* ═══════════════════════════════════════════════════════════════
   3 — Publish confirmation surfaces Readiness blockers (warn, not block)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Publish confirmation surfaces Readiness blockers without blocking the action');

await test('getReadinessSummary() reuses window.LarumReadiness.readiness(), never reimplements it', async () => {
  assert.match(workspaceSrc, /function getReadinessSummary\(property\)/);
  const fn = workspaceSrc.match(/function getReadinessSummary\(property\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /window\.LarumReadiness\.readiness\(/);
  assert.match(fn, /catch \(e\) \{\s*return null;\s*\}/, 'must fail silently, matching the Readiness tab\'s own fallback behavior');
});

await test('the blocker warning is only computed/shown for pendingStatus === \'published\'', async () => {
  const confirmBlock = workspaceSrc.match(/\} else if \(pendingStatus && CONFIRM_STATUSES\.has\(pendingStatus\)\) \{[\s\S]*?\} else if \(transitions\.length\)/)[0];
  assert.match(confirmBlock, /if \(pendingStatus === 'published'\) \{/);
  assert.match(confirmBlock, /readiness blocker/i);
});

await test('the warning never disables or removes the Confirm button — this warns, does not block (explicit product decision)', async () => {
  const confirmBlock = workspaceSrc.match(/\} else if \(pendingStatus && CONFIRM_STATUSES\.has\(pendingStatus\)\) \{[\s\S]*?\} else if \(transitions\.length\)/)[0];
  assert.match(confirmBlock, /__wsConfirmStatus\(\)/);
  // The confirm button's disabled state is driven only by savingStatus,
  // never by the readiness summary — confirms this stays a warning.
  const btnMatch = confirmBlock.match(/<button class="btn btn-primary" onclick="__wsConfirmStatus\(\)" '\s*\+\s*\n?\s*\(savingStatus \? 'disabled' : ''\)/);
  assert.ok(btnMatch, 'Confirm button disabled-state must depend only on savingStatus, not on readiness blockers');
});

/* ═══════════════════════════════════════════════════════════════
   4 — updateLead() fails visibly, not silently
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[4] updateLead() surfaces failure inline, not just in the far-away banner');

function mockLeadsClient(shouldError) {
  return {
    from(table) {
      return {
        update: (patch) => ({
          eq: async () => shouldError
            ? { error: { message: 'permission denied for table leads' } }
            : { error: null }
        })
      };
    }
  };
}

await test('failed update: lead object is NOT mutated, #savedNote shows an inline error (functional)', async () => {
  const adminCore = await import('../admin/admin-core.js');
  const added = [];
  const savedNote = { textContent: '', classList: { add: (c) => added.push(c), remove() {} } };
  const banner = { innerHTML: '', classList: { add() {} } };
  const origGetById = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => id === 'savedNote' ? savedNote : (id === 'banner' ? banner : null);
  globalThis.supabaseClient = mockLeadsClient(true);

  try {
    const lead = { id: 'lead-1', status: 'new', notes: 'original notes' };
    const ok = await adminCore.updateLead(lead, { status: 'contacted', notes: 'new notes' });

    assert.equal(ok, false);
    assert.deepEqual(lead, { id: 'lead-1', status: 'new', notes: 'original notes' },
      'a failed write must never mutate the in-memory lead object');
    assert.notEqual(savedNote.textContent, '', 'the inline note must show something on failure, not go blank (M6.4 finding)');
    assert.ok(added.includes('error'), '#savedNote must get the .error class for a visible failure state');
  } finally {
    globalThis.document.getElementById = origGetById;
    delete globalThis.supabaseClient;
  }
});

await test('successful update: lead object IS mutated, #savedNote shows Saved and clears any prior error state', async () => {
  const adminCore = await import('../admin/admin-core.js');
  const removed = [];
  const savedNote = { textContent: '', classList: { add() {}, remove(c) { removed.push(c); } } };
  const origGetById = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => id === 'savedNote' ? savedNote : null;
  globalThis.supabaseClient = mockLeadsClient(false);

  try {
    const lead = { id: 'lead-2', status: 'new', notes: 'x' };
    const ok = await adminCore.updateLead(lead, { status: 'contacted', notes: 'y' });

    assert.equal(ok, true);
    assert.equal(lead.status, 'contacted');
    assert.equal(lead.notes, 'y');
    assert.equal(savedNote.textContent, 'Saved');
    assert.ok(removed.includes('error'), 'a successful save must clear any leftover .error state from a prior failed attempt');
  } finally {
    globalThis.document.getElementById = origGetById;
    delete globalThis.supabaseClient;
  }
});

/* ═══════════════════════════════════════════════════════════════
   5 — Lead notes: confirm before discarding on drawer close
   (structural — the guard lives in a module-private function wired
   to window/delegated-click handlers inside a full drawer render;
   driving that end-to-end needs more DOM than this harness mocks,
   consistent with admin-m62.test.mjs's own stated convention for
   DOM-heavy modules)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[5] Lead notes: closing the drawer with unsaved notes requires confirmation');

await test('admin-leads.js: closeDrawerGuarded() compares the live textarea against the baseline before discarding', async () => {
  assert.match(leadsSrc, /function closeDrawerGuarded\(baselineNotes\)/);
  const fn = leadsSrc.match(/function closeDrawerGuarded\(baselineNotes\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /getElementById\('leadNotes'\)/);
  assert.match(fn, /window\.confirm\(/);
  assert.match(fn, /current !== baselineNotes/);
  assert.match(leadsSrc, /__closeDrawer = \(\) => closeDrawerGuarded\(l\.notes \|\| ''\)/,
    'the close button must be wired through the guard, not directly to closeDrawer()');
});

await test('admin-property-leads.js: closeDrawerGuarded() compares the live textarea against the open lead\'s baseline', async () => {
  assert.match(propertyLeadsSrc, /let openLeadNotesBaseline = null/);
  assert.match(propertyLeadsSrc, /openLeadNotesBaseline = l\.notes \|\| ''/, 'baseline must be captured when the drawer opens');
  const fn = propertyLeadsSrc.match(/function closeDrawerGuarded\(\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /getElementById\('leadNotes'\)/);
  assert.match(fn, /window\.confirm\(/);
  assert.match(propertyLeadsSrc, /action === 'close'\) \{\s*\n\s*closeDrawerGuarded\(\);/,
    'the delegated close action must call the guard, not closeDrawer() directly');
});

/* ═══════════════════════════════════════════════════════════════
   SUMMARY
   ═══════════════════════════════════════════════════════════════ */
console.log('\n══ Admin-M6.4 TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
