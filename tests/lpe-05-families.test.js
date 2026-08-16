'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LarumFamilies = require('../schemas/families');
const { familyFor, deriveManifest } = require('../schemas/adapters');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const ENUM = ['urban-apartment', 'villa-estate', 'metropolitan-luxury'];

/* 1. three recipes, valid shape */
assert.deepEqual(LarumFamilies.listFamilies(), ['villa-estate', 'urban-apartment', 'metropolitan-luxury']);
for (const id of LarumFamilies.listFamilies()) {
  const f = LarumFamilies.getFamily(id);
  assert.ok(f, `${id} missing`);
  assert.equal(f.familyId, id);
  assert.equal(f.themeId, `${id}-default`);
  assert.ok(ENUM.includes(f.familyId));
  assert.ok(f.tokens && f.tokens.colors && f.tokens.typography && f.tokens.spacing, `${id} tokens incomplete`);
  assert.ok(Array.isArray(f.defaultModules) && f.defaultModules.length === 9, `${id} defaultModules not 9`);
  assert.ok(f.defaultModules.every(m => typeof m === 'string'), `${id} defaultModules entries must be strings`);
  assert.equal(typeof f.motionPreset, 'string');
  assert.ok(f.ctaVocabulary && f.ctaVocabulary.primary && f.ctaVocabulary.secondary, `${id} ctaVocabulary incomplete`);
}

/* 2. Villa is the current look: recipe tokens == :root literals */
const villa = LarumFamilies.getFamily('villa-estate');
assert.equal(villa.tokens.colors.ink, '#161714');
assert.equal(villa.tokens.colors.paper, '#e9e6de');
assert.equal(villa.tokens.colors.line, 'rgba(233,230,222,.28)');
assert.equal(villa.tokens.colors.soft, '#b7b5ad');
assert.equal(villa.tokens.colors.accent, '#c5ab75');
assert.equal(villa.tokens.typography.display, "Georgia,'Times New Roman',serif");
assert.equal(villa.tokens.typography.mono, "'Courier New',Courier,monospace");
assert.ok(css.includes('--ink:#161714'), ':root ink unchanged');
assert.ok(css.includes('--gold:#c5ab75'), ':root gold retained (back-compat)');

/* 3. resolve / getTheme */
assert.equal(LarumFamilies.resolve('urban-apartment').familyId, 'urban-apartment');
assert.equal(LarumFamilies.resolve('metropolitan-luxury').familyId, 'metropolitan-luxury');
assert.equal(LarumFamilies.resolve('beach-resort').familyId, 'villa-estate');
assert.equal(LarumFamilies.defaultFamily(), 'villa-estate');
assert.equal(LarumFamilies.getTheme('villa-estate', 'nope'), null);
assert.equal(LarumFamilies.getTheme('urban-apartment', 'urban-apartment-default').familyId, 'urban-apartment');
assert.equal(LarumFamilies.getTheme('nope', 'nope'), null);

/* 4. familyFor unchanged */
assert.equal(familyFor('madrid'), 'urban-apartment');
assert.equal(familyFor('marbella'), 'villa-estate');
assert.equal(familyFor('_template'), 'villa-estate');
assert.equal(familyFor('unknown-slug'), 'villa-estate');

/* 5. token layers present in CSS, :root intact */
assert.ok(css.includes('html[data-family="urban-apartment"]'), 'urban layer missing');
assert.ok(css.includes('html[data-family="metropolitan-luxury"]'), 'metro layer missing');
assert.ok(css.includes('--accent:#8a98a0'), 'urban accent missing');
assert.ok(css.includes('--accent:#b9a26a'), 'metro accent missing');

/* 6. no unparameterized display/mono font literals outside :root default */
/* :root defines --font-display with the literal; everywhere else uses var(). */
const varDisplay = (css.match(/var\(--font-display\)/g) || []).length;
assert.ok(varDisplay >= 27, `expected >=27 var(--font-display), got ${varDisplay}`);
const literalDisplay = (css.match(/font-family:Georgia/g) || []).length;
assert.equal(literalDisplay, 0, 'font-family:Georgia should be fully parameterized');
const varMono = (css.match(/var\(--font-mono\)/g) || []).length;
assert.ok(varMono >= 37, `expected >=37 var(--font-mono), got ${varMono}`);
const literalMono = (css.match(/font-family:'Courier New'/g) || []).length;
assert.equal(literalMono, 0, "font-family:'Courier New' should be fully parameterized");
assert.equal((css.match(/var\(--gold\)/g) || []).length, 0, 'no bare var(--gold) usages remain');

/* 7. single engine: family boundary confined to app.js + styles.css */
assert.ok((app.match(/LarumFamilies\.resolve/g) || []).length === 1, 'app.js should reference LarumFamilies.resolve exactly once');
for (const f of ['modules/registry.js','modules/enquiry-handoff.js','modules/arrival.js','modules/property-dna.js','modules/lived-sequence.js','modules/verified-intelligence.js','modules/concierge.js','experience-shell.js','schemas/module-registry.js']) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  assert.ok(!src.includes('LarumFamilies'), `${f} must not reference LarumFamilies`);
  assert.ok(!src.includes('data-family'), `${f} must not reference data-family`);
}

/* 8. metropolitan fixture renders from data; madrid manifest unchanged */
const madrid = deriveManifest('madrid');
assert.equal(madrid.family, 'urban-apartment');
assert.equal(madrid.themeId, 'urban-apartment-default');
assert.deepEqual(madrid.modules.map(m => m.id), LarumFamilies.getFamily('urban-apartment').defaultModules);
const metro = { family: 'metropolitan-luxury', themeId: 'metropolitan-luxury-default' };
assert.equal(LarumFamilies.resolve(metro.family).familyId, 'metropolitan-luxury');
assert.ok(LarumFamilies.getFamily('metropolitan-luxury').defaultModules.indexOf('verified-intelligence') <
          LarumFamilies.getFamily('metropolitan-luxury').defaultModules.indexOf('spatial-zones'),
          'metro orders proof before spatial');

console.log('LPE-05 families tests: PASS');
