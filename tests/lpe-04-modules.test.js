'use strict';
const assert = require('node:assert/strict');

const Catalog = require('../modules/registry');
const { MODULE_IDS, composePlan } = require('../schemas/module-registry');
const { deriveManifest } = require('../schemas/adapters');

/* Register all 6 P0 modules (each self-registers into globalThis.LarumModules). */
const enquiry = require('../modules/enquiry-handoff');
const arrival = require('../modules/arrival');
const dna = require('../modules/property-dna');
const sequence = require('../modules/lived-sequence');
const verified = require('../modules/verified-intelligence');
const concierge = require('../modules/concierge');

const P0 = {
  'enquiry-handoff': enquiry,
  arrival,
  'property-dna': dna,
  'lived-sequence': sequence,
  'verified-intelligence': verified,
  concierge
};

/* ── minimal ctx fixture (mirrors the fields app.js exposes) ── */
function makeCtx(overrides) {
  const sequences = [['Wake', '07:00', 'Morning light'], ['Gather', '13:00', 'Shared meal']];
  const scenes = [['Wake', ['Terrace', 'Living room']], ['Gather', ['Dining room']]];
  const base = {
    slug: 'madrid',
    lang: 'en',
    copy: { concierge: 'Ask the property', conciergeSub: 'sub', explore: 'Explore', send: 'Send', placeholder: 'Q', advisorSummary: 'Summary', summaryIntro: 'Intro' },
    property: { label: 'Madrid · Goya', brand: 'Brand', title: 'Title', subtitle: 'Sub', intro: 'Intro', image: 'i.jpg', band: 'b.jpg', facts: [['Area', '100 m²']], dna: { title: 'DNA', intro: 'dintro' }, conciergeIntro: 'hello', experiences: [], referencePrice: 1000000 },
    pc: () => 'copy text',
    dnaDimensions: () => [{ label: 'Light', score: '80', note: { en: 'note' } }],
    activeSequences: () => sequences,
    activeScenes: () => scenes,
    model: () => null,
    activeSpatial: () => [],
    activeAssets: () => ({}),
    settingCards: () => [],
    track: () => {},
    navigate: () => {},
    selectSequence: () => {},
    openSpace: () => {},
    openFilm: () => {},
    isVisible: () => true,
    visited: [],
    knowledge: () => null,
    qualification: {},
    entryPath: () => '',
    contactConfig: { defaultEmail: 'a@b.c', properties: {}, mode: 'mailto', endpoint: null },
    actions: {}
  };
  return Object.assign({}, base, overrides);
}

/* ── 1. contract: 6 modules, correct shape, ids within MODULE_IDS ── */
const registered = Catalog.modules();
assert.deepEqual(Object.keys(registered).sort(), Object.keys(P0).sort(), 'exactly 6 P0 modules registered');
for (const id of Object.keys(P0)) {
  const m = P0[id];
  for (const k of ['id', 'render', 'mount', 'update', 'destroy', 'actions']) {
    assert.ok(k in m, `${id} missing ${k}`);
  }
  assert.equal(m.id, id);
  assert.ok(MODULE_IDS.includes(id), `${id} not in MODULE_IDS`);
  assert.equal(typeof m.render, 'function');
  assert.equal(typeof m.mount, 'function');
  assert.equal(typeof m.update, 'function');
  assert.equal(typeof m.destroy, 'function');
}

/* ── 2. render parity: compat roots present, no inline handlers ── */
const roots = {
  'enquiry-handoff': 'id="enquiryOverlay"',
  arrival: 'id="arrivalOverlay"',
  'property-dna': 'class="dna-section"',
  'lived-sequence': 'id="sequence"',
  'verified-intelligence': 'id="details"',
  concierge: 'id="concierge"'
};
for (const id of Object.keys(P0)) {
  for (const slug of ['madrid', 'marbella']) {
    const html = P0[id].render(makeCtx({ slug }));
    assert.ok(html.includes(roots[id]), `${id} (${slug}) missing root ${roots[id]}`);
    for (const bad of ['onclick=', 'onload=', 'onsubmit=', 'onchange=', 'oninput=']) {
      assert.ok(!html.includes(bad), `${id} (${slug}) contains inline ${bad}`);
    }
  }
}
/* child ids still present */
assert.ok(P0.concierge.render(makeCtx()).includes('id="chatMessages"'));
assert.ok(P0.concierge.render(makeCtx()).includes('id="conciergeStatus"'));
assert.ok(P0.arrival.render(makeCtx()).includes('id="arrivalTitle"'));
assert.ok(P0['enquiry-handoff'].render(makeCtx()).includes('id="enquirySuccess"'));
assert.ok(P0['lived-sequence'].render(makeCtx()).includes('id="sequenceStage"'));
assert.ok(P0['property-dna'].render(makeCtx()).includes('dna-trigger'));

/* ── 3. composition unchanged; every module step maps to P0 or inline P1 ── */
const P1_INLINE = ['spatial-zones', 'setting-lifestyle', 'documents-private-room'];
const defaultPlan = composePlan(deriveManifest('madrid')).map(s => s.id);
assert.deepEqual(defaultPlan, [
  'hero', 'identity',
  'property-dna', 'image-band',
  'lived-sequence', 'explore',
  'spatial-zones',
  'verified-intelligence',
  'setting-lifestyle',
  'documents-private-room', 'calculator',
  'concierge'
]);
for (const step of composePlan(deriveManifest('madrid'))) {
  if (step.type === 'module') {
    assert.ok(P0[step.id] || P1_INLINE.includes(step.id), `module step ${step.id} orphaned`);
  }
}

/* ── 4. lifecycle (stub DOM): mount binds, destroy removes, idempotent, update boolean ── */
function makeEl() {
  const listeners = {};
  return {
    _listeners: listeners,
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {}, getAttribute() { return null; },
    innerHTML: '', textContent: '', style: {}, offsetWidth: 0
  };
}

const root = makeEl();
const ctx = makeCtx();
dna.mount(root, ctx);
assert.equal((root._listeners['click'] || []).length, 1, 'dna mount should bind 1 click listener');
dna.destroy();
assert.equal((root._listeners['click'] || []).length, 0, 'dna destroy should unbind');
dna.destroy(); /* idempotent — must not throw */
dna.mount(root, ctx);
assert.equal((root._listeners['click'] || []).length, 1, 'mount→destroy→mount leaves exactly one listener');
dna.destroy();

/* arrival: click listener + idempotent destroy */
const r2 = makeEl();
arrival.mount(r2, ctx);
assert.equal((r2._listeners['click'] || []).length, 1);
arrival.destroy();
arrival.destroy();
assert.equal((r2._listeners['click'] || []).length, 0);

/* verified-intelligence: mount/destroy are no-ops, must not throw */
const r3 = makeEl();
verified.mount(r3, ctx);
verified.destroy();
assert.equal(Object.keys(r3._listeners).length, 0);

/* update returns a boolean for every module */
for (const id of Object.keys(P0)) {
  assert.equal(typeof P0[id].update(makeCtx()), 'boolean', `${id} update() must return boolean`);
}

/* ── 5. actions ── */
assert.equal(typeof enquiry.actions.open, 'function');
assert.equal(typeof enquiry.actions.close, 'function');
assert.equal(typeof enquiry.actions.submit, 'function');
assert.equal(typeof arrival.actions.open, 'function');
assert.equal(typeof arrival.actions.next, 'function');
assert.equal(typeof arrival.actions.close, 'function');
assert.equal(typeof sequence.actions.select, 'function');
assert.equal(typeof sequence.actions.navigateToScene, 'function');

/* ── 6. legacy fallback via resolveModule ── */
for (const id of Object.keys(P0)) {
  assert.equal(Catalog.resolveModule(id), P0[id], `${id} should resolve when flag on`);
}
global.LARUM_MODULES = global.LARUM_MODULES || {};
global.LARUM_MODULES['arrival'] = false;
assert.equal(Catalog.resolveModule('arrival'), null, 'flag off → null');
global.LARUM_MODULES['arrival'] = true;
assert.equal(Catalog.resolveModule('hero'), null, 'frame never resolves');
assert.equal(Catalog.resolveModule('spatial-zones'), null, 'P1 never resolves');
assert.equal(Catalog.resolveModule('not-registered'), null, 'unknown never resolves');

/* ── 7. flag-off equivalence: coordinator treats null as legacy ── */
/* The engine's render() uses `moduleHtml[id] = useModule(id) ? render : null`
   and falls back to the retained legacy html*; resolveModule returning null
   is exactly the signal the coordinator reads. */
assert.equal(Catalog.resolveModule('not-registered'), null);

console.log('LPE-04 modules tests: PASS');
