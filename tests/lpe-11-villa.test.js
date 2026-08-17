'use strict';
/* ── LPE-11 · Villa Vertical Slice ─────────────────────────────────
   Dependency-free acceptance test (node:assert, node:fs).
   Verifies the 7-stage Villa journey on marbella using the as-built
   LPE-01→06 runtime. No browser automation; no DB; no Supabase.

   Groups
     1 — 7-stage structural pass
     2 — Fallback assertions (grep-level)
     3 — Marbella data invariants
     4 — No forbidden change

   HANDOFF §9 — matches LPE_11_HANDOFF.md specification.
   ─────────────────────────────────────────────────────────────────── */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readFile = f => fs.readFileSync(path.join(root, f), 'utf8');
const readJSON = f => JSON.parse(readFile(f));
const exists = f => fs.existsSync(path.join(root, f));

const { deriveManifest, familyFor } = require('../schemas/adapters');
const LarumLoader = require('../property-loader.js');

/* ── Initialise LarumLoader with file data (mirrors validate-content.js) ── */
(function initPack() {
  const registry = readJSON('properties/index.json');
  const pack = { registry, properties: {}, contact: null, purchase: null };
  for (const slug of registry.order || []) {
    const dir = `properties/${slug}`;
    const tryJSON = f => { try { return readJSON(f); } catch { return null; } };
    pack.properties[slug] = {
      content:    readJSON(`${dir}/content.json`),
      knowledge:  readJSON(`${dir}/knowledge.json`),
      assets:     tryJSON(`${dir}/assets.json`) || {},
      experience: tryJSON(`${dir}/experience.json`)
    };
  }
  LarumLoader.loadFromPack(pack);
})();

/* ── Test runner ── */
let pass = 0, fail = 0;
function ok(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    pass++;
  } catch (e) {
    console.error('  ✗ ' + name + ': ' + e.message);
    fail++;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   GROUP 1 — 7-stage structural pass
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[1] 7-stage structural pass');

ok('marbella family === villa-estate', () => {
  assert.equal(familyFor('marbella'), 'villa-estate');
});

ok('deriveManifest: family + themeId', () => {
  const m = deriveManifest('marbella');
  assert.equal(m.family, 'villa-estate');
  assert.equal(m.themeId, 'villa-estate-default');
});

ok('deriveManifest: 9 modules ordered 10→90', () => {
  const m = deriveManifest('marbella');
  assert.equal(m.modules.length, 9);
  assert.deepEqual(m.modules.map(x => x.order), [10, 20, 30, 40, 50, 60, 70, 80, 90]);
});

ok('deriveManifest: defaultEntry === arrival-01', () => {
  assert.equal(deriveManifest('marbella').navigation.defaultEntry, 'arrival-01');
});

ok('deriveManifest: reducedMotionFallback === static-composed', () => {
  assert.equal(deriveManifest('marbella').motionPolicy.reducedMotionFallback, 'static-composed');
});

ok('deriveManifest === experience.json snapshot (no drift)', () => {
  const derived   = deriveManifest('marbella');
  const snapshot  = readJSON('properties/marbella/experience.json');
  assert.deepEqual(derived, snapshot);
});

ok('Stage 1 (arrival)               — modules/arrival.js exists', () => {
  assert.ok(exists('modules/arrival.js'));
});

ok('Stage 2 (property-dna)          — modules/property-dna.js exists', () => {
  assert.ok(exists('modules/property-dna.js'));
});

ok('Stage 3 (lived-sequence)        — modules/lived-sequence.js exists', () => {
  assert.ok(exists('modules/lived-sequence.js'));
});

ok('Stage 4 (spatial-zones P1)      — htmlSpatial + selectMapSpace in app.js', () => {
  const src = readFile('app.js');
  assert.ok(src.includes('function htmlSpatial('), 'htmlSpatial not found in app.js');
  assert.ok(src.includes('function selectMapSpace('), 'selectMapSpace not found in app.js');
  assert.ok(!exists('modules/spatial-zones.js'), 'modules/spatial-zones.js must not be extracted (P1 stays in app.js)');
});

ok('Stage 4                         — no plan asset in Marbella assets', () => {
  const a = readJSON('properties/marbella/assets.json');
  assert.ok(!a.plan && !a.planImage && !a.floorplan, 'unexpected plan asset in Marbella assets.json');
});

ok('Stage 5 (verified-intelligence) — modules/verified-intelligence.js exists', () => {
  assert.ok(exists('modules/verified-intelligence.js'));
});

ok('Stage 6 (concierge client)      — modules/concierge.js exists', () => {
  assert.ok(exists('modules/concierge.js'));
});

ok('Stage 6 (concierge grounded)    — api/concierge.mjs + _data + _pack exist', () => {
  assert.ok(exists('api/concierge.mjs'),  'api/concierge.mjs missing');
  assert.ok(exists('api/_data.mjs'),      'api/_data.mjs missing');
  assert.ok(exists('api/_pack.mjs'),      'api/_pack.mjs missing');
});

ok('Stage 7 (enquiry-handoff)       — modules/enquiry-handoff.js exists', () => {
  assert.ok(exists('modules/enquiry-handoff.js'));
});

ok('Stage 7                         — buildAdvisorSummary in analytics.js', () => {
  assert.ok(readFile('analytics.js').includes('buildAdvisorSummary'));
});

/* ═══════════════════════════════════════════════════════════════════
   GROUP 2 — Fallback assertions (grep-level; DOM-free)
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[2] Fallback assertions');

ok('handleFilmTrigger → jumpTo("concierge") when no propertyFilm', () => {
  const src = readFile('app.js');
  assert.ok(src.includes('handleFilmTrigger'), 'handleFilmTrigger not found in app.js');
  assert.ok(src.includes("jumpTo('concierge')"), "jumpTo('concierge') branch missing in handleFilmTrigger");
});

ok('openSpace → p.band fallback when spaces empty', () => {
  assert.ok(readFile('app.js').includes('p.band'), 'p.band fallback not found in openSpace');
});

ok('prefersReducedMotion(): function defined + called ≥2 times', () => {
  const src = readFile('app.js');
  assert.ok(src.includes('function prefersReducedMotion('), 'prefersReducedMotion not defined');
  const calls = (src.match(/prefersReducedMotion\(\)/g) || []).length;
  assert.ok(calls >= 2, `Expected ≥2 prefersReducedMotion() call sites, found ${calls}`);
});

ok('no-video: hero.video === null → arrival uses fallbackImage', () => {
  const a = readJSON('properties/marbella/assets.json');
  assert.equal(a.hero.video, null, 'hero.video is not null — fallback path inactive');
  assert.ok(a.hero.fallbackImage, 'no fallbackImage for no-video path');
});

ok('no-plan: htmlSpatial does not reference planImage', () => {
  assert.ok(!readFile('app.js').includes('planImage'), 'planImage referenced in app.js — fake plan risk');
});

ok('failed optional media: assets.spaces === {} → p.band is the fallback', () => {
  const a = readJSON('properties/marbella/assets.json');
  assert.deepEqual(a.spaces, {}, 'assets.spaces is not empty — fallback path not exercised');
  assert.ok(readJSON('properties/marbella/content.json').band, 'no p.band on Marbella content');
});

/* ═══════════════════════════════════════════════════════════════════
   GROUP 3 — Marbella data invariants
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[3] Marbella data invariants');

ok('sequences.length === 4', () => {
  assert.equal(readJSON('properties/marbella/content.json').sequences.length, 4);
});

ok('sceneSpaces.length === sequences.length', () => {
  const c = readJSON('properties/marbella/content.json');
  assert.equal(c.sceneSpaces.length, c.sequences.length);
});

ok('spatial zones ≥ 2', () => {
  const c = readJSON('properties/marbella/content.json');
  assert.ok(c.spatial.length >= 2, `Only ${c.spatial.length} zones (need ≥ 2)`);
});

ok('spatialNodeDetails: one entry per zone (EN + ES)', () => {
  const c = readJSON('properties/marbella/content.json');
  assert.equal(c.spatialNodeDetails.en.length, c.spatial.length, 'EN count mismatch');
  assert.equal(c.spatialNodeDetails.es.length, c.spatial.length, 'ES count mismatch');
});

ok('knowledge.property.spaces ≥ 5', () => {
  const k = readJSON('properties/marbella/knowledge.json');
  const n = Object.keys(k.property.spaces).length;
  assert.ok(n >= 5, `Only ${n} spaces (need ≥ 5)`);
});

ok('dna present with ≥ 1 dimension (score + rationale)', () => {
  const c = readJSON('properties/marbella/content.json');
  assert.ok(c.dna && Array.isArray(c.dna.dimensions) && c.dna.dimensions.length >= 1,
    'dna.dimensions missing or empty');
  const d = c.dna.dimensions[0];
  assert.ok(d.score, 'dimension missing score');
  assert.ok(d.note && (d.note.en || d.note.es), 'dimension missing rationale note');
});

ok('arrival text present (EN + ES)', () => {
  const c = readJSON('properties/marbella/content.json');
  assert.ok(Array.isArray(c.arrival.en) && c.arrival.en.length > 0, 'arrival.en missing');
  assert.ok(Array.isArray(c.arrival.es) && c.arrival.es.length > 0, 'arrival.es missing');
});

ok('pending/requires-advisor statuses present (verified ≠ pending)', () => {
  const k = readJSON('properties/marbella/knowledge.json');
  const facts = Object.values(k.property.facts);
  assert.ok(
    facts.some(f => f.status !== 'confirmed'),
    'All facts show "confirmed" — no pending/requires-advisor statuses found'
  );
});

ok('LarumLoader.validate("marbella") → 0 issues', () => {
  const r = LarumLoader.validate('marbella');
  assert.equal(r.issues.length, 0,
    `Validation issues: ${r.issues.join('; ')}`);
});

/* ═══════════════════════════════════════════════════════════════════
   GROUP 4 — No forbidden change
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[4] No forbidden change');

ok('schemas/adapters/index.js: exists + exports deriveManifest', () => {
  assert.ok(exists('schemas/adapters/index.js'), 'schemas/adapters/index.js missing');
  assert.ok(readFile('schemas/adapters/index.js').includes('deriveManifest'));
});

ok('analytics.js: exists + has nullReport + event_schema (LPE-10 frozen)', () => {
  assert.ok(exists('analytics.js'), 'analytics.js missing');
  const src = readFile('analytics.js');
  assert.ok(src.includes('nullReport'),   'nullReport missing from analytics.js');
  assert.ok(src.includes('event_schema'), 'event_schema missing from analytics.js');
});

ok('property-loader.js: exists + exposes validate + loadFromPack', () => {
  assert.ok(exists('property-loader.js'), 'property-loader.js missing');
  const src = readFile('property-loader.js');
  assert.ok(src.includes('function validate('), 'validate() not found');
  assert.ok(src.includes('loadFromPack'),       'loadFromPack not found');
});

ok('index.html: exists', () => {
  assert.ok(exists('index.html'));
});

ok('experience-shell.js: exists (LPE-03 frozen)', () => {
  assert.ok(exists('experience-shell.js'));
});

ok('modules/spatial-zones.js: must NOT exist (P1 stays in app.js)', () => {
  assert.ok(!exists('modules/spatial-zones.js'),
    'modules/spatial-zones.js was created — P1 module must NOT be extracted in LPE-11');
});

ok('docs/migrations/: no new migration file for LPE-11', () => {
  const dir = path.join(root, 'docs', 'migrations');
  if (!fs.existsSync(dir)) return; // directory absent = no migrations = ok
  const files = fs.readdirSync(dir);
  const lpe11 = files.filter(f => /lpe.?11/i.test(f));
  assert.equal(lpe11.length, 0,
    `Unexpected LPE-11 migration file(s): ${lpe11.join(', ')}`);
});

/* ═══════════════════════════════════════════════════════════════════
   Final summary
   ═══════════════════════════════════════════════════════════════════ */
const total = pass + fail;
console.log(`\n${total} assertions: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
