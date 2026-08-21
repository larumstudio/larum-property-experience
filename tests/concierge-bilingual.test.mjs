/**
 * M6.8 — api/concierge.mjs bilingual-content compatibility fix · Test Matrix
 *
 * api/concierge.mjs only exports its Vercel `handler` (by design — this
 * fix must not add any other export, per the approved scope), and
 * exercising the real handler end-to-end would require mocking the
 * Anthropic SDK, rate limiting and Supabase dossier fetch all at once.
 * Two complementary strategies instead, same spirit as this repo's
 * existing structural tests for app.js/modules (string-based, see
 * tests/app-antispam.test.mjs):
 *
 *   1 — Structural: confirm the crash-prone pattern is gone and the
 *       fixed pattern is in place, at the exact two call sites.
 *   2 — Behavioral: extract textEn()'s own source text via regex and
 *       execute it for real (`new Function`) against representative
 *       inputs — bilingual objects, legacy plain strings, and nested
 *       dna/setting/facts/sequences shapes — so this is a genuine
 *       functional test of the real fix code, not just a text match.
 *
 * Covers exactly what was asked:
 *   1. content.title no longer causes .replace() on an object.
 *   2. the JSON context sent to the model contains plain strings, not
 *      {en, es} objects, for dna/setting/sequences/facts.
 *   3. legacy monolingual (plain-string) content still works exactly
 *      as before — the fix must not require content.json to already
 *      be migrated.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = readFileSync(join(root, 'api/concierge.mjs'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

/* Extract the real textEn() function body from the source and execute
   it live — proves the actual shipped logic, not a reimplementation. */
const fnMatch = src.match(/function textEn\(v\) \{[\s\S]*?\n\}/);
if (!fnMatch) { console.error('FATAL: textEn() not found in api/concierge.mjs'); process.exit(1); }
const textEn = new Function('v', fnMatch[0].replace(/^function textEn\(v\) \{/, '').replace(/\}$/, ''));
/* textEn recurses by calling itself by name (v.map(textEn), etc.) —
   inside a `new Function`-built function that name resolves through
   the global scope, not a closure, since `new Function` bodies run
   detached from this module's lexical scope. Exposing it on
   globalThis is what makes the extracted, REAL source recurse
   correctly here, exactly as it does inside api/concierge.mjs itself. */
globalThis.textEn = textEn;

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — content.title no longer crashes .replace()
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] content.title.replace() crash is fixed');

test('the crash-prone bare "content.title.replace(" pattern is gone', () => {
  assert.ok(!/\$\{content\.title\.replace\(/.test(src),
    'content.title.replace( must not appear unwrapped — this throws once title is {en,es}');
});

test('the fixed call site wraps content.title in textEn() before .replace()', () => {
  assert.match(src, /\$\{textEn\(content\.title\)\.replace\('\\n', ' '\)\}/);
});

test('textEn() executed live: a bilingual title.replace() no longer throws, resolves to en', () => {
  const title = { en: 'The Light\nof Goya', es: '' };
  assert.doesNotThrow(() => textEn(title).replace('\n', ' '));
  assert.equal(textEn(title).replace('\n', ' '), 'The Light of Goya');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — the AI context contains plain strings, not {en,es}
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] Dossier JSON context: plain strings, not bilingual objects');

test('dna/setting/sequences/facts are all wrapped in textEn() before JSON.stringify', () => {
  const jsonCall = src.match(/\$\{JSON\.stringify\(\{[\s\S]*?\}, null, 1\)\}/);
  assert.ok(jsonCall, 'JSON.stringify dossier context call not found');
  const call = jsonCall[0];
  assert.match(call, /dna:\s*textEn\(content\.dna\)/);
  assert.match(call, /setting:\s*textEn\(content\.setting\)/);
  assert.match(call, /sequences:\s*textEn\(content\.sequences\)/);
  assert.match(call, /facts:\s*textEn\(content\.facts\)/);
});

test('textEn() executed live: nested dna.dimensions[].note resolves to a plain string, not {en,es}', () => {
  const dna = {
    title: { en: 'The Private Urban Residence', es: '' },
    intro: { en: 'A home defined by light.', es: '' },
    dimensions: [
      { label: 'Light', score: '94', note: { en: 'Light organises this home.', es: 'La luz organiza esta casa.' } }
    ]
  };
  const out = textEn(dna);
  assert.equal(typeof out.title, 'string');
  assert.equal(out.title, 'The Private Urban Residence');
  assert.equal(typeof out.dimensions[0].note, 'string');
  assert.equal(out.dimensions[0].note, 'Light organises this home.');
  assert.equal(out.dimensions[0].label, 'Light', 'unconverted plain-string fields must pass through unchanged');
  assert.equal(out.dimensions[0].score, '94');
});

test('textEn() executed live: setting.cards[] title/line resolve to strings, source key untouched', () => {
  const setting = {
    title: { en: 'The city, within reach.', es: '' },
    cards: [{ title: { en: 'Morning', es: '' }, line: { en: 'Retiro waking around you', es: '' }, source: 'parks' }]
  };
  const out = textEn(setting);
  assert.equal(typeof out.cards[0].title, 'string');
  assert.equal(out.cards[0].title, 'Morning');
  assert.equal(typeof out.cards[0].line, 'string');
  assert.equal(out.cards[0].source, 'parks', 'the source identifier key must never be touched by textEn');
});

test('textEn() executed live: facts[] tuples resolve label to a string, numeric value untouched', () => {
  const facts = [['3', { en: 'BEDROOMS', es: '' }], ['4', { en: 'BATHROOMS', es: '' }]];
  const out = textEn(facts);
  assert.equal(out[0][0], '3');
  assert.equal(typeof out[0][1], 'string');
  assert.equal(out[0][1], 'BEDROOMS');
});

test('textEn() executed live: sequences[] — title (index 0, never converted) and description (index 2) both survive', () => {
  const sequences = [['Morning light', '09:12', { en: 'The residence wakes slowly.', es: '' }]];
  const out = textEn(sequences);
  assert.equal(out[0][0], 'Morning light');
  assert.equal(out[0][1], '09:12');
  assert.equal(typeof out[0][2], 'string');
  assert.equal(out[0][2], 'The residence wakes slowly.');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — legacy monolingual content keeps working unchanged
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Legacy (not-yet-migrated) plain-string content still works');

test('textEn() is a pure passthrough for plain strings — a not-yet-migrated property is untouched', () => {
  assert.equal(textEn('The Light\nof Goya'), 'The Light\nof Goya');
  assert.equal(textEn(''), '');
  assert.equal(textEn(null), null);
  assert.equal(textEn(undefined), undefined);
});

test('a fully legacy (all-plain-string) dna object passes through with no shape change', () => {
  const dna = { title: 'The Private Urban Residence', intro: 'A home defined by light.', dimensions: [{ label: 'Light', score: '94', note: { en: 'x', es: 'y' } }] };
  const out = textEn(dna);
  assert.equal(out.title, 'The Private Urban Residence');
  assert.equal(out.intro, 'A home defined by light.');
  assert.equal(out.dimensions[0].note, 'x', 'note was already bilingual before M6.8 and must keep resolving the same way');
});

console.log('\n══ M6.8 concierge.mjs bilingual-fix TEST SUMMARY ═══════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
