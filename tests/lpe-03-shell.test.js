'use strict';
const assert = require('node:assert/strict');
const { deriveManifest, validateManifest } = require('../schemas/adapters');
const {
  MODULE_IDS, BINDINGS, get, require: requireModule,
  isKnownModule, composePlan, railChapterIds, menuTargets, moduleVisible
} = require('../schemas/module-registry');
const Shell = require('../experience-shell');

const REQUIRED_FIELDS = ['id', 'slot', 'glue', 'chapter', 'chapterId', 'menu', 'menuId', 'slice', 'legacyId'];
const CLOSED_GLUE = ['image-band', 'explore', 'calculator'];
const DEFAULT = deriveManifest('madrid');

/* 1. every MODULE_IDS id has a complete descriptor (all §4.1 fields) */
for (const id of MODULE_IDS) {
  const d = BINDINGS[id];
  assert.ok(d, `missing descriptor for ${id}`);
  for (const f of REQUIRED_FIELDS) {
    assert.ok(f in d, `descriptor ${id} missing field ${f}`);
  }
  assert.equal(d.id, id);
  assert.ok(d.slot === 'scroll' || d.slot === 'overlay', `${id} bad slot`);
  assert.ok(d.glue === null || CLOSED_GLUE.includes(d.glue), `${id} bad glue`);
  assert.equal(typeof d.chapter, 'boolean', `${id} chapter not boolean`);
  assert.equal(typeof d.menu, 'boolean', `${id} menu not boolean`);
  assert.equal(d.chapter, !!d.chapterId, `${id} chapter/chapterId disagree`);
  assert.equal(d.menu, !!d.menuId, `${id} menu/menuId disagree`);
}
assert.equal(get('arrival').slot, 'overlay');
assert.equal(get('nope'), null);
assert.throws(() => requireModule('nope'), /Unknown module id/);

/* 2. no descriptor id outside MODULE_IDS */
assert.deepEqual(Object.keys(BINDINGS).sort(), [...MODULE_IDS].sort());

/* 3. default compose deep-equals the LPE-02 plan */
assert.deepEqual(composePlan(DEFAULT).map(s => s.id), [
  'hero', 'identity',
  'property-dna', 'image-band',
  'lived-sequence', 'explore',
  'spatial-zones',
  'verified-intelligence',
  'setting-lifestyle',
  'documents-private-room', 'calculator',
  'concierge'
]);

/* 4. default rail */
assert.deepEqual(railChapterIds(DEFAULT), ['hero', 'identity', 'sequence', 'spatial', 'concierge']);

/* 5. default menu */
assert.deepEqual(menuTargets(DEFAULT).map(t => t.id), ['identity', 'sequence', 'spatial', 'documents', 'calculator', 'concierge']);

/* 6. hide property-dna: plan omits it, glue image-band remains */
const noDna = deriveManifest('madrid');
noDna.modules.find(m => m.id === 'property-dna').visible = false;
const noDnaPlan = composePlan(noDna).map(s => s.id);
assert.ok(!noDnaPlan.includes('property-dna'));
assert.ok(noDnaPlan.includes('image-band'));

/* 7. hide lived-sequence: rail drops sequence; menu drops sequence */
const noSeq = deriveManifest('madrid');
noSeq.modules.find(m => m.id === 'lived-sequence').visible = false;
assert.deepEqual(railChapterIds(noSeq), ['hero', 'identity', 'spatial', 'concierge']);
assert.ok(!menuTargets(noSeq).map(t => t.id).includes('sequence'));

/* 8. shell.compose concatenates provider output in plan order */
const providers = {};
for (const step of composePlan(DEFAULT)) providers[step.id] = `[${step.id}]`;
const page = Shell.compose(DEFAULT, providers);
assert.deepEqual(page.plan.map(s => s.id), composePlan(DEFAULT).map(s => s.id));
assert.deepEqual(page.railIds, railChapterIds(DEFAULT));
assert.deepEqual(page.menuIds, menuTargets(DEFAULT).map(t => t.id));
assert.equal(page.mainHtml, composePlan(DEFAULT).map(s => providers[s.id]).join(''));

/* 9. showArrival / showEnquiry follow visibility */
assert.equal(page.showArrival, true);
assert.equal(page.showEnquiry, true);
const hiddenOverlay = deriveManifest('madrid');
hiddenOverlay.modules.find(m => m.id === 'arrival').visible = false;
hiddenOverlay.modules.find(m => m.id === 'enquiry-handoff').visible = false;
const p2 = Shell.compose(hiddenOverlay, providers);
assert.equal(p2.showArrival, false);
assert.equal(p2.showEnquiry, false);

/* 10. unknown module id still fails validateManifest (LPE-02 invariant) */
const unknown = deriveManifest('madrid');
unknown.modules[0].id = 'not-registered';
assert.equal(validateManifest(unknown).valid, false);
assert.ok(validateManifest(unknown).issues.some(x => /unknown module/.test(x)));
assert.equal(isKnownModule('not-registered'), false);
assert.equal(isKnownModule('arrival'), true);
assert.equal(moduleVisible(DEFAULT, 'arrival'), true);

console.log('LPE-03 shell tests: PASS');
