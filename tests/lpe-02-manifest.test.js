'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const LarumLoader = require('../property-loader.js');
const {
  deriveManifest, validateManifest, familyFor, adaptProperty, MODULE_IDS
} = require('../schemas/adapters');
const {
  composePlan, moduleVisible, isKnownModule, railChapterIds, BINDINGS
} = require('../schemas/module-registry');

const root = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

function fixture(slug) {
  return {
    content: read(`properties/${slug}/content.json`),
    knowledge: read(`properties/${slug}/knowledge.json`),
    assets: read(`properties/${slug}/assets.json`)
  };
}

function snapshot(slug) {
  return read(`properties/${slug}/experience.json`);
}

/* 1–3. derive valid, deterministic, no input mutation */
for (const slug of ['madrid', 'marbella', '_template']) {
  const raw = fixture(slug === '_template' ? '_template' : slug);
  const before = JSON.stringify(raw);
  const a = deriveManifest(slug);
  const b = deriveManifest(slug);
  assert.equal(validateManifest(a).valid, true, `${slug} derive invalid: ${validateManifest(a).issues.join('; ')}`);
  assert.deepEqual(a, b, `${slug} derive not deterministic`);
  assert.equal(JSON.stringify(raw), before, `${slug} derive mutated inputs`);
  assert.equal(a.modules.length, 9);
  assert.deepEqual(a.modules.map(m => m.id), MODULE_IDS);
  assert.ok(a.modules.every(m => m.visible === true));
  assert.deepEqual(a.modules.map(m => m.order), [10, 20, 30, 40, 50, 60, 70, 80, 90]);
}

/* 4. snapshot === derive */
for (const slug of ['madrid', 'marbella', '_template']) {
  assert.deepEqual(snapshot(slug), deriveManifest(slug), `${slug} snapshot !== derive`);
}

/* family table */
assert.equal(familyFor('madrid'), 'urban-apartment');
assert.equal(familyFor('marbella'), 'villa-estate');
assert.equal(familyFor('_template'), 'villa-estate');
assert.equal(deriveManifest('madrid').family, 'urban-apartment');
assert.equal(adaptProperty('madrid', fixture('madrid')).experience.family, 'urban-apartment');

/* 5. default compose === legacy page order */
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
assert.deepEqual(railChapterIds(deriveManifest('madrid')), ['hero', 'identity', 'sequence', 'spatial', 'concierge']);

/* 6. unknown module id → invalid */
const unknown = deriveManifest('madrid');
unknown.modules[0].id = 'not-registered';
assert.equal(validateManifest(unknown).valid, false);
assert.ok(validateManifest(unknown).issues.some(x => /unknown module/.test(x)));
assert.equal(isKnownModule('not-registered'), false);
assert.equal(isKnownModule('arrival'), true);

/* 7. duplicate module id → invalid */
const dup = deriveManifest('madrid');
dup.modules[1].id = 'arrival';
assert.equal(validateManifest(dup).valid, false);

/* 8. missing experience.json → loader derives */
LarumLoader.loadFromPack({
  registry: { order: ['madrid'], default: 'madrid' },
  properties: { madrid: fixture('madrid') }
});
const derivedViaLoader = LarumLoader.getManifest('madrid');
assert.deepEqual(derivedViaLoader, deriveManifest('madrid'));

/* 9. invalid / diverging experience.json → fallback to derive, no throw */
LarumLoader.loadFromPack({
  registry: { order: ['madrid'], default: 'madrid' },
  properties: {
    madrid: {
      ...fixture('madrid'),
      experience: { schemaVersion: '1.0', family: 'urban-apartment', modules: [{ id: 'arrival', visible: false }] }
    }
  }
});
const fellBack = LarumLoader.getManifest('madrid');
assert.deepEqual(fellBack, deriveManifest('madrid'));

/* 10. hidden scroll module omitted from compose; glue remains */
const hidden = deriveManifest('madrid');
hidden.modules.find(m => m.id === 'property-dna').visible = false;
const hiddenPlan = composePlan(hidden).map(s => s.id);
assert.ok(!hiddenPlan.includes('property-dna'));
assert.ok(hiddenPlan.includes('image-band'));
assert.equal(moduleVisible(hidden, 'property-dna'), false);
assert.deepEqual(railChapterIds(hidden), ['hero', 'identity', 'sequence', 'spatial', 'concierge']);

/* 11. reorder follows new order */
const reordered = deriveManifest('madrid');
const dna = reordered.modules.find(m => m.id === 'property-dna');
const conc = reordered.modules.find(m => m.id === 'concierge');
const tmp = dna.order; dna.order = conc.order; conc.order = tmp;
const reorderedPlan = composePlan(reordered).map(s => s.id);
assert.ok(reorderedPlan.indexOf('concierge') < reorderedPlan.indexOf('property-dna'));
assert.equal(reorderedPlan[reorderedPlan.indexOf('property-dna') + 1], 'image-band');

/* 12. overlay hidden does not change scroll plan */
const noArrival = deriveManifest('madrid');
noArrival.modules.find(m => m.id === 'arrival').visible = false;
assert.deepEqual(composePlan(noArrival).map(s => s.id), defaultPlan);
assert.equal(moduleVisible(noArrival, 'arrival'), false);
assert.equal(moduleVisible(noArrival, 'enquiry-handoff'), true);

/* bindings stay the closed 9 */
assert.equal(Object.keys(BINDINGS).length, 9);
assert.equal(MODULE_IDS.length, 9);

/* LPE-01 still green through adaptProperty */
assert.equal(require('../schemas/adapters').validateNormalized(adaptProperty('madrid', fixture('madrid'))).issues.length, 0);

console.log('LPE-02 manifest tests: PASS');
