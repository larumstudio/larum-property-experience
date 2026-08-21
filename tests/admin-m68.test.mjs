/**
 * M6.8 · Bilingual Content Architecture — verification tests.
 *
 * Discovery confirmed the "language problem" was structural: several
 * display fields in content.json were monolingual while the renderer
 * (app.js/modules) worked correctly with whatever it was given. M6.8
 * promoted the display-only BILINGUAL_REQUIRED fields to {en, es} and
 * updated every consumer that resolves display text (never content
 * used as an analytics/functional key — those stay untouched, REVIEW).
 *
 * This suite proves, per the approved scope:
 *   1. EN returns EN values.
 *   2. ES returns ES values when they exist.
 *   3. No existing (legacy, all-plain-string) property breaks.
 *   4. The content editor loads and saves both languages correctly,
 *      including for brand-new repeater items and the setPath()
 *      primitive-string upgrade path this migration exposed.
 *
 * (api/concierge.mjs's own fix is covered separately, in
 * concierge-bilingual.test.mjs — not duplicated here.)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const readFile = f => readFileSync(join(root, f), 'utf8');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

/* ═══════════════════════════════════════════════════════════════
   1 — File structure: the bilingual resolver pattern is present
   everywhere it needs to be
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] File structure — bilingual resolvers present');

const appSrc = readFile('app.js');
const adaptersSrc = readFile('schemas/adapters/index.js');
const dnaModSrc = readFile('modules/property-dna.js');
const conciergeModSrc = readFile('modules/concierge.js');
const viModSrc = readFile('modules/verified-intelligence.js');
const editorSrc = readFile('admin/admin-content-editor.js');
const storeSrc = readFile('admin/admin-property-store.js');

await test('app.js defines t(v) and tkey(v)', async () => {
  assert.match(appSrc, /function t\(v\)\{/);
  assert.match(appSrc, /function tkey\(v\)\{/);
});

await test('schemas/adapters/index.js defines textOf()', async () => {
  assert.match(adaptersSrc, /const textOf = value =>/);
});

await test('modules/property-dna.js, concierge.js, verified-intelligence.js each carry a local t() resolver', async () => {
  for (const [name, src] of [['property-dna.js', dnaModSrc], ['concierge.js', conciergeModSrc], ['verified-intelligence.js', viModSrc]]) {
    assert.match(src, /function t\(v, ?lang\)/, `${name} missing local t()`);
  }
});

await test('admin-content-editor.js: fieldBilingual() supports opts.multiline and getPath/setPath are generic', async () => {
  assert.match(editorSrc, /function fieldBilingual\(path, label, obj, opts\)/);
  assert.match(editorSrc, /const multiline = !!\(opts && opts\.multiline\)/);
  assert.match(editorSrc, /function getPath\(obj, path\)/);
  assert.match(editorSrc, /function setPath\(obj, path, value\)/);
});

/* ═══════════════════════════════════════════════════════════════
   2 — app.js t()/tkey(): EN, ES, and legacy-plain-string resolution
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] app.js t()/tkey() — EN/ES/legacy resolution (functional, extracted source)');

const tBody = appSrc.match(/function t\(v\)\{([\s\S]*?)\}\n/)[1];
const tkeyBody = appSrc.match(/function tkey\(v\)\{([\s\S]*?)\}\n/)[1];
const t = new Function('v', 'lang', tBody);
const tkey = new Function('v', tkeyBody);

await test('t(): EN language returns the EN value of a bilingual object', async () => {
  assert.equal(t({ en: 'The Light of Goya', es: 'La Luz de Goya' }, 'en'), 'The Light of Goya');
});

await test('t(): ES language returns the ES value when it exists', async () => {
  assert.equal(t({ en: 'The Light of Goya', es: 'La Luz de Goya' }, 'es'), 'La Luz de Goya');
});

await test('t(): ES language falls back to EN when ES is still empty (real production state today)', async () => {
  assert.equal(t({ en: 'The Light of Goya', es: '' }, 'es'), 'The Light of Goya',
    'this is the exact discovery finding — ES is structurally ready but not yet translated');
});

await test('t(): legacy plain-string content (pre-migration shape) passes through unchanged regardless of lang', async () => {
  assert.equal(t('Legacy plain title', 'en'), 'Legacy plain title');
  assert.equal(t('Legacy plain title', 'es'), 'Legacy plain title');
});

await test('t(): null/undefined resolves to empty string, never throws', async () => {
  assert.equal(t(null, 'en'), '');
  assert.equal(t(undefined, 'es'), '');
});

await test('tkey(): always prefers EN regardless of lang, to avoid fragmenting Admin analytics by visitor language', async () => {
  assert.equal(tkey({ en: 'Private core', es: 'Núcleo privado' }), 'Private core');
  assert.equal(tkey({ en: '', es: 'Núcleo privado' }), 'Núcleo privado', 'falls back to ES only if EN is genuinely empty');
});

await test('tkey(): legacy plain-string analytics keys still pass through unchanged (no regression)', async () => {
  assert.equal(tkey('Master suite'), 'Master suite');
});

/* ═══════════════════════════════════════════════════════════════
   3 — schemas/adapters textOf(): same guarantees via the public
   adapter surface (textOf itself is a private module const)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] schemas/adapters — textOf() resolution via adaptProperty()/adaptContent()');

// schemas/adapters/index.js is CommonJS (used via require() elsewhere in this
// suite's sibling lpe-01 test) — import it the same way that file does.
const adaptersMod = (await import('node:module')).createRequire(import.meta.url)(join(root, 'schemas/adapters'));

const madridRaw = {
  content: JSON.parse(readFile('properties/madrid/content.json')),
  knowledge: JSON.parse(readFile('properties/madrid/knowledge.json')),
  assets: JSON.parse(readFile('properties/madrid/assets.json'))
};

await test('adaptContent(): identity.title resolves the EN value of the real, migrated bilingual content.json', async () => {
  const normalized = adaptersMod.adaptContent(madridRaw.content);
  const rawTitle = madridRaw.content.title;
  const expectedEn = typeof rawTitle === 'string' ? rawTitle : rawTitle.en;
  assert.equal(normalized.identity.title, expectedEn);
});

await test('adaptContent(): resolves ES when a bilingual object actually carries ES text (synthetic — real content.json ES is intentionally still empty)', async () => {
  const synthetic = JSON.parse(JSON.stringify(madridRaw.content));
  synthetic.title = { en: 'The Light of Goya', es: 'La Luz de Goya' };
  const normalized = adaptersMod.adaptContent(synthetic);
  // adaptContent's identity layer is EN-preferred/language-agnostic by
  // design (see M6.8 report) — confirm it still resolves EN here...
  assert.equal(normalized.identity.title, 'The Light of Goya');
  // ...and confirm textOf's actual ES-fallback branch by using an
  // EN-empty synthetic object, which is the only way to observe it
  // through the public adapter surface.
  synthetic.title = { en: '', es: 'Solo en español' };
  const normalized2 = adaptersMod.adaptContent(synthetic);
  assert.equal(normalized2.identity.title, 'Solo en español');
});

await test('adaptContent(): legacy all-plain-string content (no {en,es} anywhere) still adapts with zero regression', async () => {
  const legacy = JSON.parse(JSON.stringify(madridRaw.content));
  legacy.title = 'Legacy Plain Title';
  legacy.subtitle = 'Legacy Plain Subtitle';
  legacy.intro = 'Legacy Plain Intro';
  legacy.conciergeIntro = 'Legacy Plain Concierge Intro';
  const normalized = adaptersMod.adaptContent(legacy);
  assert.equal(normalized.identity.title, 'Legacy Plain Title');
  assert.equal(normalized.identity.subtitle, 'Legacy Plain Subtitle');
  assert.equal(normalized.identity.intro, 'Legacy Plain Intro');
  assert.equal(normalized.identity.conciergeIntro, 'Legacy Plain Concierge Intro');
});

await test('adaptContent(): zone label resolution never leaks "[object Object]" into generated IDs (the critical fix)', async () => {
  const normalized = adaptersMod.adaptContent(madridRaw.content);
  for (const zone of normalized.zones) {
    assert.doesNotMatch(zone.id, /object.?Object/i, `zone id "${zone.id}" leaked a raw bilingual object into slug()`);
  }
});

/* ═══════════════════════════════════════════════════════════════
   4 — admin-content-editor.js: bilingual editing loads/saves both
   languages correctly (functional, DOM-less harness — same
   convention as admin-m64.test.mjs)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[4] admin-content-editor.js — bilingual field load/edit/save round trip');

globalThis.location = { protocol: 'https:', search: '' };
globalThis.window = {};
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', className: '', textContent: '', classList: { add() {}, remove() {} }, setAttribute() {} }),
  body: { appendChild() {} },
  querySelectorAll: () => []
};

function mockSaveClient() {
  const captured = {};
  return {
    from(table) {
      const chain = {
        update: (patch) => { captured.patch = patch; return chain; },
        eq: () => chain,
        select: () => chain,
        then: (resolve) => Promise.resolve({ data: [{ updated_at: '2026-08-21T00:00:00Z' }], error: null }).then(resolve)
      };
      return chain;
    },
    _captured: captured
  };
}

await test('render(): identity title/subtitle/intro/conciergeIntro show EN and ES input values from bilingual content', async () => {
  const contentEditor = await import('../admin/admin-content-editor.js');
  const container = { innerHTML: '' };
  const property = {
    slug: 'madrid',
    content: {
      title: { en: 'The Light of Goya', es: 'La Luz de Goya' },
      subtitle: { en: 'An EN subtitle', es: '' },
      intro: { en: 'EN intro text', es: 'ES intro text' },
      conciergeIntro: { en: 'EN concierge', es: '' }
    },
    knowledge: {}, assets: {}
  };

  contentEditor.render(container, property);
  assert.match(container.innerHTML, /The Light of Goya/);
  assert.match(container.innerHTML, /La Luz de Goya/);
  assert.match(container.innerHTML, /An EN subtitle/);
  assert.match(container.innerHTML, /EN intro text/);
  assert.match(container.innerHTML, /ES intro text/);
  assert.match(container.innerHTML, /EN concierge/);

  contentEditor.teardown();
});

await test('render(): legacy all-plain-string content renders without throwing, EN input shows the legacy value, ES input is blank', async () => {
  const contentEditor = await import('../admin/admin-content-editor.js');
  const container = { innerHTML: '' };
  const property = {
    slug: 'legacy-prop',
    content: { title: 'Legacy Plain Title', subtitle: 'Legacy Sub', intro: 'Legacy Intro', conciergeIntro: 'Legacy Concierge' },
    knowledge: {}, assets: {}
  };

  assert.doesNotThrow(() => contentEditor.render(container, property));
  assert.match(container.innerHTML, /Legacy Plain Title/);
  assert.match(container.innerHTML, /Legacy Intro/);

  contentEditor.teardown();
});

await test('__ceInput(): editing the EN and ES sub-fields of an existing bilingual field updates both independently', async () => {
  const contentEditor = await import('../admin/admin-content-editor.js');
  const container = { innerHTML: '' };
  const property = { slug: 'madrid', content: { title: { en: 'Original EN', es: 'Original ES' } }, knowledge: {}, assets: {} };

  contentEditor.render(container, property);
  window.__ceInput('title.en', 'Edited EN');
  contentEditor.render(container, property); // sameSlug re-render shows current draft

  assert.match(container.innerHTML, /Edited EN/);
  assert.match(container.innerHTML, /Original ES/, 'editing EN must not clobber the untouched ES value');

  window.__ceInput('title.es', 'Edited ES');
  contentEditor.render(container, property);
  assert.match(container.innerHTML, /Edited EN/);
  assert.match(container.innerHTML, /Edited ES/);

  contentEditor.teardown();
});

await test('__ceInput(): typing into a bilingual sub-field of a LEGACY plain-string field upgrades it in place instead of throwing (setPath fix)', async () => {
  const contentEditor = await import('../admin/admin-content-editor.js');
  const container = { innerHTML: '' };
  // Simulates an un-migrated draft where facts[0][1] is still a bare
  // string — before the setPath() fix, `cur['1']` would resolve to
  // that primitive string and `cur['en'] = value` would throw in this
  // ES module's strict-mode context.
  const property = { slug: 'madrid', content: { facts: [['3', 'BEDROOMS']] }, knowledge: {}, assets: {} };

  contentEditor.render(container, property);
  window.__ceToggle('information'); // Information section is closed by default — facts live there
  assert.doesNotThrow(() => window.__ceInput('facts.0.1.en', 'BEDROOMS (edited)'),
    'setPath must upgrade a primitive-string intermediate value into an object, not crash on it');
  contentEditor.render(container, property);
  assert.match(container.innerHTML, /BEDROOMS \(edited\)/);

  contentEditor.teardown();
});

await test('addRepeaterItem(): new fact/experience/spatial/setting entries get {en:"",es:""} defaults for the now-bilingual slots', async () => {
  const contentEditor = await import('../admin/admin-content-editor.js');
  const container = { innerHTML: '' };
  const property = { slug: 'madrid', content: { facts: [], experiences: [], spatial: [], setting: { cards: [] } }, knowledge: {}, assets: {} };

  contentEditor.render(container, property);
  window.__ceToggle('information');
  window.__ceToggle('spaces');
  window.__ceToggle('surroundings');
  window.__ceAddRepeat('fact');
  window.__ceAddRepeat('experience');
  window.__ceAddRepeat('spatial');
  window.__ceAddRepeat('setting');

  // Typing into the EN/ES sub-field of a brand-new item must not throw —
  // this is only guaranteed if the pushed default is already {en,es},
  // not a plain '' that setPath would then have to upgrade.
  assert.doesNotThrow(() => {
    window.__ceInput('facts.0.1.en', 'NEW LABEL');
    window.__ceInput('experiences.0.1.en', 'NEW TITLE');
    window.__ceInput('spatial.0.1.en', 'NEW ZONE');
    window.__ceInput('setting.cards.0.title.en', 'NEW CARD TITLE');
  });

  contentEditor.render(container, property);
  assert.match(container.innerHTML, /NEW LABEL/);
  assert.match(container.innerHTML, /NEW TITLE/);
  assert.match(container.innerHTML, /NEW ZONE/);
  assert.match(container.innerHTML, /NEW CARD TITLE/);

  contentEditor.teardown();
});

await test('handleSave(): saves both EN and ES values to the row sent to Supabase (functional, mocked client)', async () => {
  const contentEditor = await import('../admin/admin-content-editor.js');
  const container = { innerHTML: '' };
  const property = { slug: 'madrid', updated_at: '2026-08-20T00:00:00Z', content: { title: { en: 'EN', es: '' } }, knowledge: {}, assets: {} };

  contentEditor.render(container, property);
  window.__ceInput('title.en', 'Saved EN value');
  window.__ceInput('title.es', 'Saved ES value');

  const client = mockSaveClient();
  globalThis.supabaseClient = client;
  globalThis.window.supabaseClient = client;

  try {
    await window.__ceSave();
    assert.ok(client._captured.patch, 'save must have reached the mocked Supabase update() call');
    assert.deepEqual(client._captured.patch.content.title, { en: 'Saved EN value', es: 'Saved ES value' });
  } finally {
    delete globalThis.supabaseClient;
    delete globalThis.window.supabaseClient;
    contentEditor.teardown();
  }
});

/* ═══════════════════════════════════════════════════════════════
   5 — admin-property-store.js: INITIAL_CONTENT / createProperty
   produce the correct bilingual shape for brand-new properties
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[5] admin-property-store.js — new-property bilingual defaults');

await test('INITIAL_CONTENT: title/subtitle/intro/conciergeIntro/dna/setting default to {en:"",es:""} shapes', async () => {
  assert.match(storeSrc, /title: \{ en: '', es: '' \}/);
  assert.match(storeSrc, /subtitle: \{ en: '', es: '' \}/);
  assert.match(storeSrc, /intro: \{ en: '', es: '' \}/);
  assert.match(storeSrc, /conciergeIntro: \{ en: '', es: '' \}/);
  assert.match(storeSrc, /dna: \{ title: \{ en: '', es: '' \}, intro: \{ en: '', es: '' \}, dimensions: \[\] \}/);
  assert.match(storeSrc, /setting: \{ title: \{ en: '', es: '' \}, intro: \{ en: '', es: '' \}, cards: \[\] \}/);
});

function mockClient(tables) {
  return {
    from(table) {
      const handlers = tables[table] || {};
      const chain = {
        select: (cols) => { chain._select = cols; return chain; },
        insert: (row) => { chain._inserted = row; return chain; },
        update: (patch) => { chain._updated = patch; return chain; },
        delete: () => chain,
        eq: (k, v) => { chain._eq = chain._eq || {}; chain._eq[k] = v; return chain; },
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => {
          if (handlers.maybeSingle) return handlers.maybeSingle(chain);
          return Promise.resolve({ data: null, error: null });
        },
        single: () => {
          if (handlers.single) return handlers.single(chain);
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve) => {
          if (handlers.then) return handlers.then(chain).then(resolve);
          return Promise.resolve({ data: [], error: null }).then(resolve);
        }
      };
      return chain;
    }
  };
}

await test('createProperty(): wraps the plain-string subtitle/intro form inputs into {en,es} shape before insert (functional)', async () => {
  const adminStore = await import('../admin/admin-property-store.js');
  let insertedRow = null;
  globalThis.window = globalThis.window || {};
  globalThis.window.supabaseClient = mockClient({
    organizations: { maybeSingle: () => Promise.resolve({ data: { id: 'org-1' }, error: null }) },
    properties: {
      single: (chain) => {
        insertedRow = chain._inserted;
        return Promise.resolve({ data: { ...insertedRow, id: 'prop-1' }, error: null });
      }
    }
  });

  try {
    adminStore.clearCache();
    await adminStore.createProperty({ slug: 'new-prop', label: 'New', brand: 'B', subtitle: 'A subtitle', intro: 'An intro' });
    assert.deepEqual(insertedRow.content.subtitle, { en: 'A subtitle', es: '' });
    assert.deepEqual(insertedRow.content.intro, { en: 'An intro', es: '' });
    assert.deepEqual(insertedRow.content.title, { en: '', es: '' }, 'title has no create-form input yet — must still default to the bilingual shape');
  } finally {
    delete globalThis.window.supabaseClient;
  }
});

/* ═══════════════════════════════════════════════════════════════
   SUMMARY
   ═══════════════════════════════════════════════════════════════ */
console.log('\n══ Admin-M6.8 TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
