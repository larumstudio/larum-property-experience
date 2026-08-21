'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const LarumLoader = require('../property-loader.js');
const { adaptProperty, adaptContent, adaptKnowledge, adaptAssets, adaptExperience, validateNormalized, MODULE_IDS } = require('../schemas/adapters');
const root = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

for (const file of fs.readdirSync(path.join(root, 'schemas')).filter(x => x.endsWith('.schema.json'))) {
  assert.equal(read(`schemas/${file}`).$schema, 'http://json-schema.org/draft-07/schema#', file);
}

function fixture(slug) {
  return { content: read(`properties/${slug}/content.json`), knowledge: read(`properties/${slug}/knowledge.json`), assets: read(`properties/${slug}/assets.json`) };
}

for (const slug of ['madrid', 'marbella']) {
  const raw = fixture(slug);
  const normalized = adaptProperty(slug, raw);
  const result = validateNormalized(normalized);
  assert.equal(result.issues.length, 0, `${slug}: ${result.issues.join('; ')}`);
  assert.equal(normalized.content.scenes.length, raw.content.sequences.length);
  /* M6.8: content.title was promoted from a plain string to {en, es} —
     the normalized identity layer is language-agnostic by design (see
     schemas/adapters/index.js's textOf()) and always resolves English,
     so compare against that specifically rather than the raw bilingual
     object (which the normalized string can no longer equal). */
  const expectedTitle = typeof raw.content.title === 'string' ? raw.content.title : raw.content.title.en;
  assert.equal(normalized.content.identity.title, expectedTitle);
  assert.deepEqual(raw.content.sequences[0], [raw.content.sequences[0][0], raw.content.sequences[0][1], raw.content.sequences[0][2]]);
  assert.equal(adaptProperty(slug, raw).content.scenes[0].id, normalized.content.scenes[0].id);
}

LarumLoader.loadFromPack({ registry:{ order:['madrid'], default:'madrid' }, properties:{ madrid:fixture('madrid') } });
assert.equal(LarumLoader.getNormalized('madrid').schemaVersion, '1.0');
assert.equal(LarumLoader.validateNormalized('madrid').issues.length, 0);

const template = adaptProperty('template', fixture('madrid'));
assert.equal(validateNormalized(template).issues.length, 0);
assert.equal(MODULE_IDS.length, 9);

const raw = fixture('madrid');
for (const [name, fn, value] of [
  ['content', adaptContent, raw.content],
  ['knowledge', adaptKnowledge, raw.knowledge],
  ['assets', value => adaptAssets(value, 'madrid'), raw.assets]
]) {
  const before = JSON.stringify(value);
  fn(value, 'madrid');
  assert.equal(JSON.stringify(value), before, `${name} adapter mutated input`);
}

const broken = adaptProperty('madrid', fixture('madrid'));
broken.content.scenes[0].spaceIds.push('missing-space');
assert.ok(validateNormalized(broken).issues.some(x => /unknown space/.test(x)));

const badFact = adaptProperty('madrid', fixture('madrid'));
badFact.knowledge.property.facts.bedrooms.status = 'confirmed';
delete badFact.knowledge.property.facts.bedrooms.source;
assert.ok(validateNormalized(badFact).warnings.some(x => /confirmed fact .* has no source/.test(x)));

const duplicate = adaptProperty('madrid', fixture('madrid'));
duplicate.content.spaces.push({ ...duplicate.content.spaces[0] });
assert.ok(validateNormalized(duplicate).issues.some(x => /duplicate IDs/.test(x)));

const invalidEnum = adaptProperty('madrid', fixture('madrid'));
invalidEnum.knowledge.property.facts.bedrooms.status = 'invented';
assert.ok(validateNormalized(invalidEnum).issues.some(x => /invalid status/.test(x)));

const circular = adaptProperty('madrid', fixture('madrid'));
circular.assets.assets[0].fallbackSlotIds = [circular.assets.assets[1].slotId];
circular.assets.assets[1].fallbackSlotIds = [circular.assets.assets[0].slotId];
assert.ok(validateNormalized(circular).issues.some(x => /circular fallback/.test(x)));

const unknownModule = adaptProperty('madrid', fixture('madrid'));
unknownModule.experience.modules[0].id = 'not-registered';
assert.ok(validateNormalized(unknownModule).issues.some(x => /unknown module/.test(x)));

console.log('LPE-01 schema/adapters tests: PASS');

