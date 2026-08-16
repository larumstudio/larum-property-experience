'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* ── Test environment setup ────────────────────────────────────────── */
global.location = { protocol: 'https:', search: '' };
global.window = {};

const LarumLoader = require('../property-loader.js');

const root = path.join(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

/* ── Fake Supabase client factory ─────────────────────────────────── */

const INDEX_ROWS = [
  { slug: 'madrid',   status: 'published', is_default: true,  display_order: 1, label: 'Madrid · Goya' },
  { slug: 'marbella', status: 'published', is_default: false, display_order: 2, label: 'Nueva Andalucía · Marbella' }
];

const INDEX_ROWS_WITH_DRAFT = [
  ...INDEX_ROWS,
  { slug: 'draft-prop', status: 'draft', is_default: false, display_order: 3, label: null }
];

const PAYLOADS = {
  madrid:   { slug: 'madrid',   status: 'published', content: read('properties/madrid/content.json'),   knowledge: read('properties/madrid/knowledge.json'),   assets: read('properties/madrid/assets.json') },
  marbella: { slug: 'marbella', status: 'published', content: read('properties/marbella/content.json'), knowledge: read('properties/marbella/knowledge.json'), assets: read('properties/marbella/assets.json') }
};

function makeClient(indexRows, payloadMap, opts) {
  opts = opts || {};
  const calls = { index: 0, payload: {} };

  const client = {
    get calls() { return calls; },
    from() {
      let _eqSlug = null;
      let _isSingle = false;

      const q = {
        select() { return q; },
        order()  { return q; },
        eq(col, val) { if (col === 'slug') _eqSlug = val; return q; },
        limit()  { return q; },
        maybeSingle() { _isSingle = true; return q; },
        then(resolve, reject) {
          const delay = opts.delay || 0;
          const work = () => {
            let result;
            if (_isSingle && _eqSlug !== null) {
              calls.payload[_eqSlug] = (calls.payload[_eqSlug] || 0) + 1;
              const err = opts.payloadError && opts.payloadError[_eqSlug] ? { message: opts.payloadError[_eqSlug] } : null;
              result = { data: err ? null : (payloadMap[_eqSlug] || null), error: err };
            } else {
              calls.index++;
              const err = opts.indexError ? { message: opts.indexError } : null;
              result = { data: err ? null : indexRows, error: err };
            }
            return Promise.resolve(result).then(resolve, reject);
          };
          return delay ? new Promise(r => setTimeout(r, delay)).then(work) : work();
        }
      };
      return q;
    }
  };
  return client;
}

function setup(indexRows, payloadMap, opts) {
  const client = makeClient(indexRows, payloadMap, opts);
  global.window.supabaseClient = client;
  global.location = { protocol: 'https:', search: '' };
  return client;
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

async function main() {
  console.log('\nLPE-08 · Lazy Loading\n');

  /* ── T1: loadIndex() makes light query — no payload ── */
  await test('T1 · loadIndex() — query excludes content/knowledge/assets', async () => {
    const client = setup(INDEX_ROWS, PAYLOADS);
    const ok = await LarumLoader.loadIndex();
    assert.ok(ok, 'loadIndex should return true');
    assert.equal(client.calls.index, 1, 'index query should fire exactly once');
    assert.equal(Object.keys(client.calls.payload).length, 0, 'payload query must NOT fire during loadIndex');
  });

  /* ── T2: Draft guard — rows without label skipped ── */
  await test('T2 · loadIndex() — draft rows without label are skipped', async () => {
    setup(INDEX_ROWS_WITH_DRAFT, PAYLOADS);
    await LarumLoader.loadIndex();
    const slugs = LarumLoader.getIndexSlugs();
    assert.ok(!slugs.includes('draft-prop'), 'draft-prop (no label) must be excluded');
    assert.equal(slugs.length, 2);
  });

  /* ── T3: Order matches display_order ── */
  await test('T3 · getIndexSlugs() — order matches display_order', async () => {
    setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadIndex();
    assert.deepEqual(LarumLoader.getIndexSlugs(), ['madrid', 'marbella']);
  });

  /* ── T4: getIndexLabel() works without payload loaded ── */
  await test('T4 · getIndexLabel() — works without payload loaded', async () => {
    setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadIndex();
    assert.ok(!LarumLoader.hasProperty('marbella'), 'marbella payload must not be loaded yet');
    assert.equal(LarumLoader.getIndexLabel('marbella'), 'Nueva Andalucía · Marbella');
  });

  /* ── T5: loadFromDb() loads index + default only ── */
  await test('T5 · loadFromDb() — loads index + default (madrid); marbella NOT loaded', async () => {
    const client = setup(INDEX_ROWS, PAYLOADS);
    const ok = await LarumLoader.loadFromDb('.');
    assert.ok(ok);
    assert.equal(client.calls.index, 1);
    assert.equal(client.calls.payload['madrid'], 1);
    assert.equal(client.calls.payload['marbella'] || 0, 0, 'marbella payload must NOT be fetched at boot');
    assert.ok(LarumLoader.hasProperty('madrid'));
    assert.ok(!LarumLoader.hasProperty('marbella'));
  });

  /* ── T6: getPropertySlugs() vs getIndexSlugs() ── */
  await test('T6 · getPropertySlugs() vs getIndexSlugs() after loadFromDb', async () => {
    setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadFromDb('.');
    assert.deepEqual(LarumLoader.getPropertySlugs(), ['madrid']);
    assert.deepEqual(LarumLoader.getIndexSlugs(), ['madrid', 'marbella']);
  });

  /* ── T7: loadProperty(slug) — on-demand payload ── */
  await test('T7 · loadProperty(slug) — on-demand payload load', async () => {
    const client = setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadFromDb('.');
    const ok = await LarumLoader.loadProperty('marbella');
    assert.ok(ok);
    assert.ok(LarumLoader.hasProperty('marbella'));
    assert.equal(client.calls.payload['marbella'], 1);
    const content = LarumLoader.getContent('marbella');
    assert.ok(content && content.label);
    assert.deepEqual(LarumLoader.getPropertySlugs(), ['madrid', 'marbella']);
  });

  /* ── T8: Idempotency — 1 network call per slug ── */
  await test('T8 · loadProperty() — idempotent (no duplicate network calls)', async () => {
    const client = setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadFromDb('.');
    await LarumLoader.loadProperty('marbella');
    await LarumLoader.loadProperty('marbella');
    assert.equal(client.calls.payload['marbella'], 1, 'Supabase called only once');
  });

  /* ── T9: Loaded-only maps ── */
  await test('T9 · getContentMap() — contains only loaded slugs', async () => {
    setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadFromDb('.');
    const map = LarumLoader.getContentMap();
    assert.ok('madrid' in map);
    assert.ok(!('marbella' in map), 'marbella must not appear until loaded');
    assert.ok(map.madrid && map.madrid.label);
  });

  /* ── T10: getPropertyLabel() falls back to index label ── */
  await test('T10 · getPropertyLabel() — index fallback for unloaded slug', async () => {
    setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadFromDb('.');
    assert.equal(LarumLoader.getPropertyLabel('marbella'), 'Nueva Andalucía · Marbella');
    assert.equal(LarumLoader.getPropertyLabel('madrid'), LarumLoader.getContent('madrid').label);
  });

  /* ── T11: loadProperty failure — returns false, state preserved ── */
  await test('T11 · loadProperty() failure — returns false, state unchanged', async () => {
    setup(INDEX_ROWS, PAYLOADS, { payloadError: { marbella: 'connection refused' } });
    await LarumLoader.loadFromDb('.');
    const ok = await LarumLoader.loadProperty('marbella');
    assert.ok(!ok);
    assert.ok(!LarumLoader.hasProperty('marbella'));
    assert.ok(LarumLoader.hasProperty('madrid'), 'madrid unaffected');
  });

  /* ── T12: hasProperty() lifecycle (via loadFromDb to get clean state) ── */
  await test('T12 · hasProperty() — false for unloaded, true for loaded', async () => {
    setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadFromDb('.');
    /* After boot: default (madrid) loaded, marbella not yet. */
    assert.ok(LarumLoader.hasProperty('madrid'), 'default property must be loaded');
    assert.ok(!LarumLoader.hasProperty('marbella'), 'non-default property must not be loaded');
    /* After on-demand load: */
    await LarumLoader.loadProperty('marbella');
    assert.ok(LarumLoader.hasProperty('marbella'), 'true after loadProperty');
  });

  /* ── T13: Concurrent calls idempotent ── */
  await test('T13 · Concurrent loadProperty calls — idempotent', async () => {
    setup(INDEX_ROWS, PAYLOADS, { delay: 10 });
    await LarumLoader.loadIndex();
    const [ok1, ok2] = await Promise.all([
      LarumLoader.loadProperty('madrid'),
      LarumLoader.loadProperty('madrid')
    ]);
    assert.ok(ok1 && ok2);
    assert.ok(LarumLoader.hasProperty('madrid'));
  });

  /* ── T14: Non-db sources — getIndexSlugs falls back to registry.order ──
     loadFromFiles() uses fetch() which requires HTTP and cannot run in plain
     Node unit tests; covered by lpe-01…07 regression suite. Here we verify
     the LPE-08 new APIs behave correctly when the pack path is active. */
  await test('T14 · Non-db source — getIndexSlugs/getIndexLabel work via pack', async () => {
    global.window.supabaseClient = null;
    const pack = {
      registry: { order: ['madrid', 'marbella'], default: 'madrid', rules: {} },
      properties: {
        madrid:   { content: read('properties/madrid/content.json'),   knowledge: {}, assets: {} },
        marbella: { content: read('properties/marbella/content.json'), knowledge: {}, assets: {} }
      },
      contact: null, purchase: null
    };
    LarumLoader.loadFromPack(pack);
    /* All slugs visible in index via registry.order */
    assert.deepEqual(LarumLoader.getIndexSlugs(), ['madrid', 'marbella']);
    /* Labels available via content fallback in getIndexLabel */
    assert.equal(LarumLoader.getIndexLabel('madrid'), pack.properties.madrid.content.label);
    assert.equal(LarumLoader.getIndexLabel('marbella'), pack.properties.marbella.content.label);
    /* Both properties loaded (pack loads all at once) */
    assert.ok(LarumLoader.hasProperty('madrid'));
    assert.ok(LarumLoader.hasProperty('marbella'));
  });

  /* ── T15: loadFromPack() unchanged ── */
  await test('T15 · loadFromPack() — pack path unchanged', async () => {
    global.window.supabaseClient = null;
    const pack = {
      registry: { order: ['madrid', 'marbella'], default: 'madrid', rules: {} },
      properties: {
        madrid:   { content: read('properties/madrid/content.json'),   knowledge: read('properties/madrid/knowledge.json'),   assets: read('properties/madrid/assets.json') },
        marbella: { content: read('properties/marbella/content.json'), knowledge: read('properties/marbella/knowledge.json'), assets: read('properties/marbella/assets.json') }
      },
      contact: null, purchase: null
    };
    const ok = LarumLoader.loadFromPack(pack);
    assert.ok(ok);
    assert.ok(LarumLoader.hasProperty('madrid'));
    assert.ok(LarumLoader.hasProperty('marbella'));
    assert.deepEqual(LarumLoader.getIndexSlugs(), ['madrid', 'marbella']);
    assert.equal(LarumLoader.getIndexLabel('madrid'), read('properties/madrid/content.json').label);
  });

  /* ── T16: Regression — validate() still works after loadFromDb ── */
  await test('T16 · Regression — madrid validates with 0 issues after loadFromDb', async () => {
    setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadFromDb('.');
    const result = LarumLoader.validate('madrid');
    assert.equal(result.issues.length, 0, result.issues.join('; '));
  });

  await test('T16b · Regression — marbella validates with 0 issues after on-demand load', async () => {
    setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadFromDb('.');
    await LarumLoader.loadProperty('marbella');
    const result = LarumLoader.validate('marbella');
    assert.equal(result.issues.length, 0, result.issues.join('; '));
  });

  /* ── T17: getDefaultSlug() after loadFromDb ── */
  await test('T17 · getDefaultSlug() — returns the is_default property', async () => {
    setup(INDEX_ROWS, PAYLOADS);
    await LarumLoader.loadFromDb('.');
    assert.equal(LarumLoader.getDefaultSlug(), 'madrid');
  });

  /* ── T18: Index error — loadFromDb returns false ── */
  await test('T18 · loadFromDb() — graceful on index error', async () => {
    setup(INDEX_ROWS, PAYLOADS, { indexError: 'connection refused' });
    const ok = await LarumLoader.loadFromDb('.');
    assert.ok(!ok);
    assert.equal(LarumLoader.getIndexSlugs().length, 0);
  });

  /* ── Final report ── */
  console.log(`\n${passed + failed} tests  ·  ${passed} passed  ·  ${failed} failed\n`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
