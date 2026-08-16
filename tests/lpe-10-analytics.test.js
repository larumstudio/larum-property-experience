'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* ── Harness stubs (analytics.js is a window-attached IIFE, not CommonJS) ── */

const captured = { events: [], sessions: [] };

global.setInterval = () => 0;
global.clearInterval = () => {};
global.localStorage = {
  _s: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }
};
global.sessionStorage = {
  _s: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }
};
global.document = { addEventListener() {}, visibilityState: 'visible' };
global.window = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  addEventListener() {}
};
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (url.includes('/analytics_events')) captured.events.push(...body);
  else if (url.includes('/sessions')) captured.sessions.push(...body);
  return { ok: true };
};

require('../analytics.js');
const A = global.window.LarumAnalytics;

function fresh() {
  captured.events.length = 0;
  captured.sessions.length = 0;
  A.reset();
}

/* ── 1. event_schema on every event row ── */
fresh();
A.init('madrid', 'en', { family: 'urban-apartment' });
A.grantConsent();
A.track('dna_open', { name: 'Light' }, 'property-dna');
A.flush();
assert.ok(captured.events.length >= 1);
for (const e of captured.events) assert.equal(e.event_schema, 1, 'event_schema must be 1');

/* ── 2. slug (property) always present ── */
fresh();
A.init('madrid', 'en');
A.grantConsent();
A.track('space_open', { name: 'Terrace' });
A.flush();
assert.ok(captured.events.every(e => e.property === 'madrid'), 'slug always present');

/* ── 3. consume-when-present ── */
fresh();
A.init('madrid', 'en', { family: 'urban-apartment', propertyId: 'M1558', revisionId: 'rev-1' });
A.grantConsent();
A.track('chapter_enter', { name: 'sequence' }, 'lived-sequence');
A.flush();
const rich = captured.events[0];
assert.equal(rich.property_id, 'M1558');
assert.equal(rich.experience_revision_id, 'rev-1');
assert.equal(rich.family, 'urban-apartment');
assert.equal(rich.module_id, 'lived-sequence');
assert.equal(rich.property, 'madrid'); /* dual-write: slug retained */

fresh();
A.init('madrid', 'en'); /* no ids */
A.grantConsent();
A.track('chapter_enter', { name: 'sequence' });
A.flush();
const bare = captured.events[0];
assert.equal(bare.property_id, null);
assert.equal(bare.experience_revision_id, null);
assert.equal(bare.family, null);
assert.equal(bare.module_id, null);
assert.equal(bare.property, 'madrid'); /* no throw, slug still there */

/* ── 4. module_id stamping + unknown → null ── */
fresh();
A.init('madrid', 'en', { family: 'villa-estate' });
A.grantConsent();
A.track('dna_open', {}, 'property-dna');
A.track('x', {}, 'not-a-module');
A.flush();
assert.equal(captured.events.find(e => e.event_type === 'dna_open').module_id, 'property-dna');
assert.equal(captured.events.find(e => e.event_type === 'x').module_id, null);

/* ── 5. ctx.track seam (structural, app.js) ── */
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(/track:function\(ev,d,m\)\{LarumAnalytics\.track\(ev,d,m\);\}/.test(app), 'buildCtx track passes moduleId');
assert.ok(/LarumAnalytics\.track\(ev,d,id\)/.test(app), 'mountModules stamps owning module id');

/* ── 6. family capture at init (session row) ── */
fresh();
A.init('marbella', 'es', { family: 'villa-estate' });
captured.sessions.length = 0; /* drop cross-property switch artifact */
A.grantConsent();
A.flush();
assert.equal(captured.sessions[0].family, 'villa-estate');

/* ── 7. null report ── */
fresh();
A.init('madrid', 'en'); /* no ids, no family */
A.grantConsent();
A.track('scene_open', { name: 'Wake' });
A.track('space_open', { name: 'Terrace' });
const rep = A.nullReport();
assert.equal(rep.totalEvents, 2);
assert.equal(rep.missingPropertyId, 2);
assert.equal(rep.missingRevisionId, 2);
assert.equal(rep.missingModuleId, 2);
assert.equal(rep.missingFamily, 2);
assert.equal(rep.schemaVersion, 1);
/* resets on new-property init */
A.init('marbella', 'en', { family: 'villa-estate' });
A.grantConsent();
A.track('scene_open', { name: 'Wake' }, 'lived-sequence');
const rep2 = A.nullReport();
assert.equal(rep2.totalEvents, 1);
assert.equal(rep2.missingModuleId, 0); /* stamped */
assert.equal(rep2.missingFamily, 0);  /* family present */

/* ── 8. dual-write session row ── */
fresh();
A.init('madrid', 'en', { propertyId: 'M1558', family: 'urban-apartment' });
captured.sessions.length = 0; /* drop cross-property switch artifact */
A.grantConsent();
A.flush();
const s = captured.sessions[0];
assert.equal(s.property, 'madrid');
assert.equal(s.property_id, 'M1558');
assert.equal(s.event_schema, 1);

/* ── 9. no new event names (allow-list, structural) ── */
const KNOWN_EVENTS = new Set([
  'dna_open', 'setting_open', 'scene_open', 'space_open', 'entry_path',
  'document_request', 'calculator_use', 'enquiry', 'film_watch',
  'chapter_enter', 'concierge_question', 'interest_signal'
]);
const src = [app,
  fs.readFileSync(path.join(__dirname, '..', 'analytics.js'), 'utf8'),
  ...fs.readdirSync(path.join(__dirname, '..', 'modules')).map(f =>
    fs.readFileSync(path.join(__dirname, '..', 'modules', f), 'utf8'))
].join('\n');
const literals = [...src.matchAll(/\.track\(\s*['"]([\w-]+)['"]/g)].map(m => m[1]);
assert.ok(literals.length > 0, 'expected track literals to inspect');
for (const name of literals) {
  assert.ok(KNOWN_EVENTS.has(name), `unexpected event name: ${name}`);
}

/* ── 10. no scoring field ── */
fresh();
A.init('madrid', 'en', { family: 'urban-apartment' });
A.grantConsent();
A.track('calculator_use', { total: 100 });
A.flush();
for (const e of [...captured.events, ...captured.sessions]) {
  for (const k of Object.keys(e)) {
    assert.ok(!/score|predict|rank/i.test(k), `scoring field leaked: ${k}`);
  }
}

console.log('LPE-10 analytics tests: PASS');
