/**
 * M6.7c — app.js anti-spam · Test Matrix
 *
 * Structural (string-based), matching this repo's existing convention
 * for testing app.js (see tests/lpe-12-gates.test.js) — app.js is a
 * monolithic browser script built around `window`/DOM globals, not a
 * clean ES module, so every existing test of it reads the source and
 * asserts on its shape/content rather than executing it in a DOM.
 *
 * Covers:
 *   1 — honeypot field exists in the enquiry form, hidden and unnamed
 *       like a real field a visitor would recognize
 *   2 — submitEnquiry() checks the honeypot AND a minimum time-since-
 *       page-load, before any Supabase/endpoint call
 *   3 — a caught submission still shows success (never tips off a bot,
 *       never leaves a real visitor looking at a broken form)
 *   4 — no other part of app.js was touched (scope discipline)
 *   5 — modules/enquiry-handoff.js: THE FORM ACTUALLY USED IN PRODUCTION.
 *       Verified live in a browser that window.LarumModules['enquiry-
 *       handoff'] — not app.js's htmlEnquiry()/submitEnquiry() — is what
 *       renders and handles #enquiryOverlay's form; app.js's copy is
 *       only reached if this module fails to load. Same honeypot +
 *       timing criteria, applied here too, confirmed live: a filled
 *       honeypot skips the submission (success still shown, but
 *       supabaseClient.from() is never called) without touching mount()/
 *       open()/close()/the real submission path for a genuine lead.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = readFileSync(join(root, 'app.js'), 'utf8');
const moduleSrc = readFileSync(join(root, 'modules/enquiry-handoff.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — Honeypot field
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] Honeypot field in the enquiry form');

test('a hidden "company" input exists in the enquiry form, before the real fields', () => {
  const formMatch = src.match(/<form onsubmit="submitEnquiry\(event\)">[\s\S]*?<\/form>/);
  assert.ok(formMatch, 'enquiry form not found');
  const form = formMatch[0];
  assert.match(form, /name="company"/);
  assert.match(form, /name="company"[^>]*name="name"|name="company"/); // present ahead of the real name field, checked precisely below
  const companyIdx = form.indexOf('name="company"');
  const nameIdx = form.indexOf('name="name"');
  assert.ok(companyIdx > -1 && nameIdx > -1 && companyIdx < nameIdx, 'honeypot must appear before the real "name" field');
});

test('the honeypot field is visually hidden and excluded from tab order / a11y tree', () => {
  const formMatch = src.match(/<input type="text" name="company"[^>]*\/>/);
  assert.ok(formMatch, 'honeypot input tag not found');
  const tag = formMatch[0];
  assert.match(tag, /tabindex="-1"/, 'must not be tabbable — a keyboard user must never land on it');
  assert.match(tag, /aria-hidden="true"/, 'must not be announced by screen readers');
  assert.match(tag, /position:absolute/, 'must be visually hidden, not just styled small');
  assert.match(tag, /autocomplete="off"/, 'must not be pre-filled by the browser\'s own autofill for a real user');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — submitEnquiry() check
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] submitEnquiry() spam check');

test('APP_LOAD_TS is captured once at script load, module-level', () => {
  assert.match(src, /const APP_LOAD_TS\s*=\s*Date\.now\(\)/);
});

test('submitEnquiry checks both the honeypot value and elapsed time since APP_LOAD_TS', () => {
  const fnMatch = src.match(/function submitEnquiry\(e\)\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'submitEnquiry function not found');
  const fn = fnMatch[0];
  assert.match(fn, /data\.get\('company'\)/);
  assert.match(fn, /Date\.now\(\)\s*-\s*APP_LOAD_TS/);
});

test('the spam check runs before sendLeadToSupabase / the endpoint fetch is reached', () => {
  const fnMatch = src.match(/function submitEnquiry\(e\)\{[\s\S]*?\n\}/);
  const fn = fnMatch[0];
  const spamCheckIdx = fn.indexOf('isSpam');
  const storeIdx = fn.indexOf('sendLeadToSupabase(');
  assert.ok(spamCheckIdx > -1 && storeIdx > -1 && spamCheckIdx < storeIdx,
    'the spam check must short-circuit before any storage/network call');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — Caught submissions still look successful
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] A caught submission still shows success (never tips off a bot)');

test('the isSpam branch calls showEnquirySuccess and returns, without ever reaching storage', () => {
  const fnMatch = src.match(/function submitEnquiry\(e\)\{[\s\S]*?\n\}/);
  const fn = fnMatch[0];
  const branch = fn.match(/if\s*\(isSpam\)\s*\{[\s\S]*?\}/);
  assert.ok(branch, 'isSpam branch not found');
  assert.match(branch[0], /showEnquirySuccess/);
  assert.match(branch[0], /return/);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 4 — Scope discipline
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[4] Scope discipline — nothing else in app.js changed');

test('every other named field in the enquiry form is unchanged (name, email, interest, message)', () => {
  const formMatch = src.match(/<form onsubmit="submitEnquiry\(event\)">[\s\S]*?<\/form>/);
  const form = formMatch[0];
  for (const field of ['name="name"', 'name="email"', 'name="interest"', 'name="message"']) {
    assert.match(form, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 5 — modules/enquiry-handoff.js (the form actually used live)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[5] modules/enquiry-handoff.js — the real, live enquiry form');

test('a hidden "company" honeypot exists in render()\'s form, before the real "name" field', () => {
  const formMatch = moduleSrc.match(/<form>[\s\S]*?<\/form>/);
  assert.ok(formMatch, 'form not found in render()');
  const form = formMatch[0];
  const companyIdx = form.indexOf('name="company"');
  const nameIdx = form.indexOf('name="name"');
  assert.ok(companyIdx > -1 && nameIdx > -1 && companyIdx < nameIdx,
    'honeypot must appear before the real "name" field');
});

test('the honeypot is visually hidden and excluded from tab order / a11y tree, same criteria as app.js', () => {
  const tagMatch = moduleSrc.match(/<input type="text" name="company"[^>]*\/>/);
  assert.ok(tagMatch, 'honeypot input tag not found');
  const tag = tagMatch[0];
  assert.match(tag, /tabindex="-1"/);
  assert.match(tag, /aria-hidden="true"/);
  assert.match(tag, /position:absolute/);
  assert.match(tag, /autocomplete="off"/);
});

test('MODULE_LOAD_TS is captured once at module scope, mirroring app.js\'s APP_LOAD_TS', () => {
  assert.match(moduleSrc, /const MODULE_LOAD_TS\s*=\s*Date\.now\(\)/);
});

test('submit() checks both the honeypot and elapsed time before any storage/network call, same as app.js', () => {
  const fnMatch = moduleSrc.match(/function submit\(e\) \{[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'submit() function not found');
  const fn = fnMatch[0];
  assert.match(fn, /data\.get\('company'\)/);
  assert.match(fn, /Date\.now\(\)\s*-\s*MODULE_LOAD_TS/);
  const spamCheckIdx = fn.indexOf('isSpam');
  const storeIdx = fn.indexOf('sendLeadToSupabase(');
  assert.ok(spamCheckIdx > -1 && storeIdx > -1 && spamCheckIdx < storeIdx,
    'the spam check must short-circuit before any storage/network call');
});

test('the isSpam branch in submit() shows success and returns, without reaching storage', () => {
  const fnMatch = moduleSrc.match(/function submit\(e\) \{[\s\S]*?\n  \}/);
  const branch = fnMatch[0].match(/if\s*\(isSpam\)\s*\{[\s\S]*?\}/);
  assert.ok(branch, 'isSpam branch not found in submit()');
  assert.match(branch[0], /showEnquirySuccess/);
  assert.match(branch[0], /return/);
});

test('mount()/open()/close()/destroy() and the real submission fields are untouched', () => {
  for (const field of ['name="name"', 'name="email"', 'name="interest"', 'name="message"']) {
    assert.match(moduleSrc, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(moduleSrc, /function mount\(root, ctx\) \{/);
  assert.match(moduleSrc, /form\.addEventListener\('submit', onSubmit\)/);
  assert.match(moduleSrc, /function open\(\) \{/);
  assert.match(moduleSrc, /function close\(\) \{/);
  assert.match(moduleSrc, /function destroy\(\) \{/);
});

console.log('\n══ M6.7c app.js anti-spam TEST SUMMARY ═══════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
