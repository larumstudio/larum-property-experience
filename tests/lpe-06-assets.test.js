'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Contracts = require('../schemas/asset-contracts');
const Resolver = require('../schemas/asset-resolver');
const { adaptAssets, deriveManifest } = require('../schemas/adapters');

const root = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

const KINDS = ['image', 'video', 'image_sequence', 'svg', 'document', 'depth_map'];
const SOURCES = ['existing_agency', 'ai_enhancement', 'new_digital', 'human_production', 'placeholder'];

/* ── fixtures ── */
function base() {
  return {
    propertyId: 'T1', authorised: true,
    hero: { video: null, poster: null, fallbackImage: 'https://x/hero.jpg',
      provenance: { source: 'Unsplash', licence: 'Unsplash License', author: 'A', url: 'https://x/p' } },
    bandImage: 'https://x/band.jpg',
    bandProvenance: { source: 'Unsplash', licence: 'Unsplash License', author: 'B', url: 'https://x/b' },
    propertyFilm: null, spaces: {}
  };
}

/* 1. registry shape */
for (const id of Contracts.listContracts()) {
  const c = Contracts.getContract(id);
  assert.ok(c, `missing contract ${id}`);
  assert.equal(c.schemaVersion, '1.0');
  assert.equal(c.id, id);
  assert.equal(c.slotId, id);
  assert.ok(typeof c.moduleId === 'string');
  assert.ok(KINDS.includes(c.kind), `${id} bad kind`);
  assert.equal(typeof c.required, 'boolean');
  assert.ok(Array.isArray(c.acceptedSources));
  assert.ok(c.acceptedSources.every(s => SOURCES.includes(s)), `${id} bad acceptedSources`);
  assert.equal(typeof c.minWidth, 'number');
  assert.ok(Array.isArray(c.preferredAspectRatios));
  assert.ok(c.variants && typeof c.variants === 'object');
  assert.ok(Array.isArray(c.fallbackSlotIds));
  assert.equal(c.rightsPolicy, 'agency-authorised');
  assert.ok(c.composition && typeof c.composition === 'object');
}
assert.equal(Contracts.getContract('hero').required, true);
assert.equal(Contracts.getContract('band-image').required, true);
assert.equal(Contracts.getContract('property-film').required, false);

/* 2. canonical slots */
const list = Contracts.listContracts();
assert.ok(list.includes('hero') && list.includes('band-image') && list.includes('property-film'));
assert.equal(Contracts.dynamicSlot('space', 'terrace'), 'space-terrace');
assert.equal(Contracts.dynamicSlot('documents', 'plan'), 'documents-plan');
assert.ok(Contracts.contractsForModule('hero').some(c => c.id === 'hero'));
assert.ok(Contracts.contractsForModule('lived-sequence').some(c => c.id === 'property-film'));

/* 3. requiredContractIds — visibility-aware, family-neutral, ignores manifest.assetContractIds */
const madrid = deriveManifest('madrid');
const metro = Object.assign({}, madrid, { family: 'metropolitan-luxury', assetContractIds: ['metro-hero', 'metro-view'] });
const req1 = Contracts.requiredContractIds(madrid);
assert.deepEqual(req1, ['hero', 'band-image']);
assert.deepEqual(Contracts.requiredContractIds(metro), req1, 'family/assetContractIds must not change required contracts');

/* 4. approved base resolves clear */
const approved = base(); /* authorised true → adaptAssets status 'received' */
const r4 = Resolver.resolve(null, 't', approved);
assert.equal(r4.slots['hero'].url, 'https://x/hero.jpg');
assert.equal(r4.slots['hero'].rights.clear, true);
assert.equal(r4.slots['hero'].variant, 'base');
assert.equal(r4.slots['hero'].fallbackUsed, null);
assert.equal(r4.slots['band-image'].rights.clear, true);

/* 5. fallback chain: hero missing → band-image */
const noHero = base();
delete noHero.hero;
const r5 = Resolver.resolve(null, 't', noHero);
assert.equal(r5.slots['hero'].fallbackUsed, 'band-image');
assert.equal(r5.slots['hero'].url, 'https://x/band.jpg');
/* band missing too → text/structural */
const noBand = base();
delete noBand.hero; delete noBand.bandImage; delete noBand.bandProvenance;
const r5b = Resolver.resolve(null, 't', noBand);
assert.equal(r5b.slots['hero'].status, 'missing');
assert.equal(r5b.slots['hero'].fallbackUsed, 'content');

/* 6. placeholder resolves but flagged */
const placeholder = base();
placeholder.authorised = false; /* → adaptAssets status 'placeholder' */
const r6 = Resolver.resolve(null, 't', placeholder);
assert.equal(r6.slots['hero'].status, 'placeholder');
assert.ok(r6.slots['hero'].url, 'placeholder still previews');
assert.equal(r6.slots['hero'].rights.clear, false);
assert.ok(r6.flagged.some(f => f.slotId === 'hero' && f.reason === 'placeholder'));

/* 7. rights: missing-provenance + expired (isolate: no approved band fallback) */
const noProv = base();
noProv.hero.provenance = null;
delete noProv.bandImage; delete noProv.bandProvenance;
const r7 = Resolver.resolve(null, 't', noProv);
assert.ok(r7.flagged.some(f => f.slotId === 'hero' && f.reason === 'missing-provenance'));
assert.equal(r7.slots['hero'].rights.clear, false);

const expired = base();
expired.hero.provenance.expiry = '2020-01-01T00:00:00Z';
delete expired.bandImage; delete expired.bandProvenance;
const r7b = Resolver.resolve(null, 't', expired);
assert.ok(r7b.flagged.some(f => f.slotId === 'hero' && f.reason === 'expired'));
assert.equal(r7b.slots['hero'].rights.clear, false);

/* 7c. §4.5 conformance: authorised===true + flat status 'prototype-reference'
   must still resolve clear (rights follow the authorised flag, NOT adaptAssets'
   derived status). */
const proto = base();
proto.status = 'prototype-reference'; /* authorised stays true */
const r7c = Resolver.resolve(null, 't', proto);
assert.equal(r7c.slots['hero'].rights.clear, true, 'authorised===true must be clear regardless of status field');
assert.equal(r7c.slots['hero'].rights.reason, null);

/* 8. video without poster/fallback still resolves, flagged no-poster */
const film = base();
film.propertyFilm = 'https://www.youtube.com/embed/X';
const r8 = Resolver.resolve(null, 't', film);
assert.equal(r8.slots['property-film'].status, 'placeholder');
assert.ok(r8.slots['property-film'].url);
assert.ok(r8.flagged.some(f => f.slotId === 'property-film' && f.reason === 'no-poster'));

/* 9. space slots: present resolves; empty falls back to band-image */
const withSpace = base(); withSpace.authorised = false;
withSpace.spaces = { terrace: { image: 'https://x/terrace.jpg' } };
const r9 = Resolver.resolve(null, 't', withSpace);
assert.equal(r9.slots['space-terrace'].url, 'https://x/terrace.jpg');

const emptySpace = base(); emptySpace.authorised = false;
emptySpace.spaces = { terrace: { image: '' } };
const r9c = Resolver.resolve(null, 't', emptySpace);
assert.equal(r9c.slots['space-terrace'].fallbackUsed, 'band-image');
assert.equal(r9c.slots['space-terrace'].url, 'https://x/band.jpg');

/* 10. reuse adaptAssets — same normalization path */
const records = adaptAssets(withSpace, 't').assets;
const slotIds = records.map(r => r.slotId);
assert.ok(slotIds.includes('hero'));
assert.ok(slotIds.includes('band-image'));
assert.ok(slotIds.includes('space-terrace'));
assert.ok(slotIds.includes('property-film') === false); /* no film in this fixture */

/* 11. no mutation */
const before = JSON.stringify(withSpace);
Resolver.resolve(null, 't', withSpace);
assert.equal(JSON.stringify(withSpace), before, 'resolver must not mutate rawAssets');

/* requiredMissing never triggers for a fully-populated fixture */
const full = base();
const rFull = Resolver.resolve(null, 't', full);
assert.deepEqual(rFull.requiredMissing, []);

console.log('LPE-06 assets tests: PASS');
