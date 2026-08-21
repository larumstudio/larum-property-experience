/* ── Larum Admin · Knowledge Editor (M5.5c) ───────────────────
   Section-based editor for properties.knowledge JSONB.
   Renders inside the Concierge → Knowledge subtab.

   Shape reality (verified in discovery, Madrid + Marbella):
   knowledge = { fallback{en,es}, property{facts,systems,spaces},
                 surroundings{...heterogeneous...},
                 intents[], interestSignals{}, qualification[] }

   Design constraints (per user, in order of severity):
   1. Unknown surroundings shapes → READ-ONLY JSON (no edit, no normalize).
      Only shapes matching known patterns get a structured editor.
   2. property.spaces: rename requires explicit confirm + warning of
      cross-references in content.sceneSpaces. Remove is BLOCKED for
      referenced spaces. Never modifies content — that lives elsewhere.
   3. facts[key].value type-preserved: string | number | null. UI
      picks the type explicitly; save writes the real JS type.

   Zero writes to visitor runtime / API / RLS / schema.
   ───────────────────────────────────────────────────────────── */

import { esc } from './admin-core.js';
import { toast } from './admin-ui.js';
import { saveKnowledge, ConflictError } from './admin-property-store.js';

/* Analytics fires only these three trigger strings. Others are legal
   in the pack but never dispatch — surface as warning, not error. */
const QUAL_TRIGGERS = ['after_3_questions', 'interest_detected', 'high_intent'];

/* Visitor concierge (api/concierge.mjs RESPONSE_SCHEMA) constrains
   interest names emitted by the LLM to these nine. Extras exist in
   real packs (e.g. Marbella's "golf") — allowed, warned, not blocked. */
const INTEREST_ENUM = ['privacy', 'family', 'architecture', 'city_life',
                       'investment', 'technology', 'outdoor_living',
                       'entertaining', 'wellness'];

const DOC_ENUM = ['calculator', 'energy', 'plans', 'brochure'];
const CONFIDENCE_ENUM = ['confirmed', 'requires-advisor', 'pending'];
const STATUS_ENUM = ['confirmed', 'pending', 'requires-advisor'];
const SPACE_TYPES = ['private', 'social', 'outdoor', 'view', 'system',
                     'transition', 'wellness', 'entertainment', 'other'];

const SECTIONS = [
  { id: 'fallback',        label: 'Fallback (bilingual)' },
  { id: 'facts',           label: 'Facts' },
  { id: 'systems',         label: 'Systems' },
  { id: 'spaces',          label: 'Spaces' },
  { id: 'surroundings',    label: 'Surroundings' },
  { id: 'intents',         label: 'Intents' },
  { id: 'interestSignals', label: 'Interest Signals' },
  { id: 'qualification',   label: 'Qualification' }
];

let containerRef = null;
let currentSlug = null;
let currentProperty = null;      // full row — for content.sceneSpaces cross-check
let draft = null;
let baseline = null;             // deep-cloned snapshot to compute dirty
let openSections = { fallback: true };
let openItems = {};              // { section: { key: true } }
let saving = false;
let clickHandler = null;
let inputHandler = null;
let changeHandler = null;
let tagCommitHandler = null;

export function render(container, property) {
  const sameSlug = currentSlug === property.slug && draft;
  if (containerRef && containerRef !== container) unbind(containerRef);
  containerRef = container;
  currentProperty = property;

  if (!sameSlug) {
    currentSlug = property.slug;
    draft = deepClone(property.knowledge || {});
    baseline = deepClone(draft);
    openSections = { fallback: true };
    openItems = {};
  }
  bind(container);
  draw();
}

export function teardown() {
  if (containerRef) unbind(containerRef);
  containerRef = null;
  currentSlug = null;
  currentProperty = null;
  draft = null;
  baseline = null;
  openSections = {};
  openItems = {};
  saving = false;
}

/* ── Event delegation (no window globals) ─────────────────── */

function bind(container) {
  unbind(container);
  clickHandler     = (e) => onClick(e, container);
  inputHandler     = (e) => onFieldInput(e);
  changeHandler    = (e) => onFieldChange(e);
  tagCommitHandler = (e) => { const d = e.detail || {}; if (d.path && d.value) addTag(d.path, d.value); };
  container.addEventListener('click', clickHandler);
  container.addEventListener('input', inputHandler);
  container.addEventListener('change', changeHandler);
  container.addEventListener('ke-tag-commit', tagCommitHandler);
}

function unbind(container) {
  if (clickHandler)     container.removeEventListener('click', clickHandler);
  if (inputHandler)     container.removeEventListener('input', inputHandler);
  if (changeHandler)    container.removeEventListener('change', changeHandler);
  if (tagCommitHandler) container.removeEventListener('ke-tag-commit', tagCommitHandler);
  clickHandler = inputHandler = changeHandler = tagCommitHandler = null;
}

function onClick(e, container) {
  const el = e.target.closest('[data-ke-action]');
  if (!el || !container.contains(el)) return;
  const action = el.getAttribute('data-ke-action');
  const path   = el.getAttribute('data-ke-path') || '';
  const key    = el.getAttribute('data-ke-key') || '';
  switch (action) {
    case 'toggle-section': toggleSection(key); return;
    case 'toggle-item':    toggleItem(path, key); return;
    case 'save':           handleSave(); return;
    case 'facts-add':      addFact(); return;
    case 'facts-remove':   removeFact(key); return;
    case 'facts-rename':   renameFact(key); return;
    case 'facts-type':     changeFactType(key, el.getAttribute('data-ke-type')); return;
    case 'systems-add':    addSystem(); return;
    case 'systems-remove': removeSystem(key); return;
    case 'systems-rename': renameSystem(key); return;
    case 'spaces-add':     addSpace(); return;
    case 'spaces-remove':  removeSpace(key); return;
    case 'spaces-rename':  renameSpace(key); return;
    case 'intents-add':    addIntent(); return;
    case 'intents-remove': removeIntent(Number(key)); return;
    case 'intents-move':   moveIntent(Number(key), Number(el.getAttribute('data-ke-delta'))); return;
    case 'intents-tag-add':    addTag(path, key); return;
    case 'intents-tag-remove': removeTag(path, key); return;
    case 'interest-add':    addInterest(); return;
    case 'interest-remove': removeInterest(key); return;
    case 'interest-rename': renameInterest(key); return;
    case 'distances-add':    addDistance(); return;
    case 'distances-remove': removeDistance(Number(key)); return;
    case 'distances-move':   moveDistance(Number(key), Number(el.getAttribute('data-ke-delta'))); return;
    case 'qual-add':    addQualification(); return;
    case 'qual-remove': removeQualification(Number(key)); return;
    case 'qual-move':   moveQualification(Number(key), Number(el.getAttribute('data-ke-delta'))); return;
    case 'lifestyle-add':    addLifestyleSlot(); return;
    case 'lifestyle-remove': removeLifestyleSlot(key); return;
    case 'lifestyle-rename': renameLifestyleSlot(key); return;
    case 'surr-remove':      removeSurrKey(key); return;
    case 'surr-add':         addSurrKey(); return;
    case 'transport-child-add':    addTransportChild(); return;
    case 'transport-child-remove': removeTransportChild(key); return;
    case 'transport-child-rename': renameTransportChild(key); return;
  }
}

function onFieldInput(e) {
  const el = e.target.closest('[data-ke-input]');
  if (!el || !containerRef.contains(el)) return;
  applyValue(el);
}

function onFieldChange(e) {
  const el = e.target.closest('[data-ke-input]');
  if (!el || !containerRef.contains(el)) return;
  applyValue(el);
}

function applyValue(el) {
  const path = el.getAttribute('data-ke-input');
  const cast = el.getAttribute('data-ke-cast');
  let value = (el.type === 'checkbox') ? el.checked : el.value;
  if (cast === 'number') {
    if (value === '' || value == null) value = null;
    else { const n = Number(value); value = isFinite(n) ? n : value; }
  } else if (cast === 'lines') {
    value = String(value).split('\n').map(s => s.trim()).filter(Boolean);
  }
  setPath(draft, path, value);
  /* No redraw on every keystroke: keep focus + caret. Redraw when
     structure changes or the operator commits an action. */
  updateToolbar();
}

/* ── Path utilities ───────────────────────────────────────── */

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

function parsePath(path) {
  /* dot + bracket path, e.g. property.spaces["Master suite"].description
     or intents[0].followUp.en */
  const parts = [];
  const rx = /([^.\[\]]+)|\["((?:[^"\\]|\\.)*)"\]|\[(\d+)\]/g;
  let m;
  while ((m = rx.exec(path)) !== null) {
    if (m[1] !== undefined) parts.push(m[1]);
    else if (m[2] !== undefined) parts.push(m[2].replace(/\\"/g, '"'));
    else parts.push(Number(m[3]));
  }
  return parts;
}

function getPath(obj, path) {
  const parts = parsePath(path);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setPath(obj, path, value) {
  const parts = parsePath(path);
  if (!parts.length) return;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = parts[i + 1];
    if (cur[p] == null) cur[p] = (typeof next === 'number') ? [] : {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function encodeKey(k) { return String(k).replace(/"/g, '\\"'); }

/* ── Dirty tracking ───────────────────────────────────────── */

function isDirty() {
  return JSON.stringify(draft) !== JSON.stringify(baseline);
}

/* ── Cross-refs into content ──────────────────────────────── */

function referencedSpaces() {
  const c = currentProperty?.content || {};
  const set = new Set();
  for (const pair of (c.sceneSpaces || [])) {
    const list = Array.isArray(pair) ? pair[1] : null;
    if (Array.isArray(list)) for (const n of list) if (n) set.add(n);
  }
  return set;
}

function referencesForSpace(name) {
  const c = currentProperty?.content || {};
  const hits = [];
  for (const pair of (c.sceneSpaces || [])) {
    if (!Array.isArray(pair)) continue;
    const sceneName = pair[0];
    const list = pair[1] || [];
    if (list.includes(name)) hits.push(sceneName);
  }
  return hits;
}

/* ── Toggle state ─────────────────────────────────────────── */

function toggleSection(id) { openSections[id] = !openSections[id]; draw(); }
function toggleItem(section, key) {
  if (!openItems[section]) openItems[section] = {};
  openItems[section][key] = !openItems[section][key];
  draw();
}

/* ── Save flow ────────────────────────────────────────────── */

function updateToolbar() {
  const btn = containerRef?.querySelector('[data-ke-save-btn]');
  const status = containerRef?.querySelector('[data-ke-status]');
  const dirty = isDirty();
  if (btn) btn.disabled = saving || !dirty || !canSave().ok;
  if (status) status.textContent = saving
    ? 'saving…'
    : dirty ? 'unsaved changes' : 'saved';
}

function canSave() {
  if (!draft) return { ok: false, reason: 'no draft' };
  const k = draft;
  if (!k.fallback?.en || !k.fallback?.es) return { ok: false, reason: 'fallback bilingual required' };
  if (!k.property?.facts || !Object.keys(k.property.facts).length) return { ok: false, reason: 'facts required' };
  if (!k.property?.spaces || Object.keys(k.property.spaces).length < 5) return { ok: false, reason: 'need ≥5 spaces' };
  if (!Array.isArray(k.intents) || k.intents.length < 6) return { ok: false, reason: 'need ≥6 intents' };
  if (!k.interestSignals || !Object.keys(k.interestSignals).length) return { ok: false, reason: 'interestSignals required' };
  if (!Array.isArray(k.qualification) || !k.qualification.length) return { ok: false, reason: 'qualification required' };
  if (!k.surroundings || !Object.keys(k.surroundings).length) return { ok: false, reason: 'surroundings required' };
  return { ok: true };
}

async function handleSave() {
  const gate = canSave();
  if (!gate.ok) { toast(gate.reason, 'error'); return; }
  if (!isDirty()) return;
  saving = true;
  updateToolbar();
  try {
    await saveKnowledge(currentSlug, deepClone(draft), currentProperty?.updated_at);
    baseline = deepClone(draft);
    toast('Knowledge saved', 'success');
  } catch (e) {
    toast(e instanceof ConflictError ? e.message : 'Save failed: ' + (e.message || 'unknown'), 'error');
  } finally {
    saving = false;
    updateToolbar();
    draw();
  }
}

/* ── Draw ─────────────────────────────────────────────────── */

function draw() {
  if (!containerRef || !draft) return;
  const dirty = isDirty();
  const gate = canSave();

  let html = '<div class="ke">';
  html += '<div class="ke-toolbar">' +
    '<button class="btn btn-primary" data-ke-action="save" data-ke-save-btn' +
      (saving || !dirty || !gate.ok ? ' disabled' : '') + '>' +
      (saving ? 'Saving…' : 'Save knowledge') + '</button>' +
    '<span class="ke-status mono" data-ke-status>' +
      (saving ? 'saving…' : dirty ? 'unsaved changes' : 'saved') +
    '</span>' +
    (!gate.ok ? '<span class="ke-warn mono">blocked: ' + esc(gate.reason) + '</span>' : '') +
  '</div>';

  for (const sec of SECTIONS) {
    const open = !!openSections[sec.id];
    html += '<div class="ke-section' + (open ? ' ke-open' : '') + '">' +
      '<button class="ke-section-head" data-ke-action="toggle-section" data-ke-key="' + esc(sec.id) + '">' +
        '<span class="ke-section-arrow">' + (open ? '▾' : '▸') + '</span>' +
        '<span>' + esc(sec.label) + '</span>' +
        '<span class="ke-section-count mono">' + esc(sectionCount(sec.id)) + '</span>' +
      '</button>';
    if (open) html += '<div class="ke-section-body">' + renderSection(sec.id) + '</div>';
    html += '</div>';
  }
  html += '</div>';
  containerRef.innerHTML = html;
}

function sectionCount(id) {
  const k = draft;
  switch (id) {
    case 'fallback': return (k.fallback?.en ? '✓ en' : '· en') + '  ' + (k.fallback?.es ? '✓ es' : '· es');
    case 'facts': {
      const f = k.property?.facts || {};
      const conf = Object.values(f).filter(v => v?.status === 'confirmed').length;
      return Object.keys(f).length + ' · ' + conf + ' confirmed';
    }
    case 'systems': return Object.keys(k.property?.systems || {}).length + '';
    case 'spaces': {
      const s = k.property?.spaces || {};
      const withEs = Object.values(s).filter(v => v?.descriptionEs).length;
      return Object.keys(s).length + ' · ' + withEs + ' with ES';
    }
    case 'surroundings': return Object.keys(k.surroundings || {}).length + '';
    case 'intents': return (k.intents?.length || 0) + '';
    case 'interestSignals': return Object.keys(k.interestSignals || {}).length + '';
    case 'qualification': return (k.qualification?.length || 0) + '';
  }
  return '';
}

function renderSection(id) {
  switch (id) {
    case 'fallback':        return renderFallback();
    case 'facts':           return renderFacts();
    case 'systems':         return renderSystems();
    case 'spaces':          return renderSpaces();
    case 'surroundings':    return renderSurroundings();
    case 'intents':         return renderIntents();
    case 'interestSignals': return renderInterestSignals();
    case 'qualification':   return renderQualification();
  }
  return '';
}

/* ── Fallback ─────────────────────────────────────────────── */

function renderFallback() {
  const f = draft.fallback || {};
  return field('fallback.en', 'English', f.en || '', 'textarea') +
         field('fallback.es', 'Español', f.es || '', 'textarea');
}

/* ── Facts ────────────────────────────────────────────────── */

function renderFacts() {
  const facts = draft.property?.facts || {};
  const keys = Object.keys(facts);
  let html = '<div class="ke-repeater">';
  for (const key of keys) html += renderFactRow(key, facts[key]);
  html += '</div>';
  html += '<div class="ke-add"><button class="btn btn-outline" data-ke-action="facts-add">+ Add fact</button></div>';
  return html;
}

function renderFactRow(key, fact) {
  const path = 'property.facts["' + encodeKey(key) + '"]';
  const open = !!openItems.facts?.[key];
  const valType = fact?.value === null ? 'null' : typeof fact?.value === 'number' ? 'number' : 'string';
  const summary = '<span class="ke-item-key mono">' + esc(key) + '</span>' +
                  '<span class="ke-item-val">' + esc(formatFactSummary(fact)) + '</span>' +
                  '<span class="ke-pill ke-pill-' + esc(fact?.status || 'pending') + '">' + esc(fact?.status || 'pending') + '</span>';
  let html = '<div class="ke-item' + (open ? ' ke-item-open' : '') + '">' +
    '<button class="ke-item-head" data-ke-action="toggle-item" data-ke-path="facts" data-ke-key="' + esc(key) + '">' +
      '<span class="ke-chev">' + (open ? '▾' : '▸') + '</span>' + summary +
    '</button>';
  if (open) {
    html += '<div class="ke-item-body">' +
      '<div class="ke-row"><label>Key</label><span class="mono">' + esc(key) + '</span> ' +
        '<button class="ke-btn-sm" data-ke-action="facts-rename" data-ke-key="' + esc(key) + '">rename</button></div>' +
      '<div class="ke-row"><label>Value type</label>' +
        typeSelector(key, valType) + '</div>' +
      (valType === 'null'
        ? '<div class="ke-row"><label>Value</label><span class="ke-muted">null</span></div>'
        : field(path + '.value', 'Value', fact?.value ?? '', valType === 'number' ? 'number' : 'text')) +
      selectField(path + '.status', 'Status', fact?.status || 'pending', STATUS_ENUM) +
      field(path + '.source', 'Source', fact?.source ?? '', 'text') +
      '<div class="ke-row-actions"><button class="btn btn-outline ke-btn-danger" data-ke-action="facts-remove" data-ke-key="' + esc(key) + '">Remove fact</button></div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function typeSelector(key, current) {
  const opts = ['string', 'number', 'null'];
  return '<span class="ke-type-toggle">' + opts.map(t =>
    '<button class="ke-type' + (t === current ? ' ke-type-active' : '') + '"' +
      ' data-ke-action="facts-type" data-ke-key="' + esc(key) + '" data-ke-type="' + t + '">' + t + '</button>'
  ).join('') + '</span>';
}

function formatFactSummary(fact) {
  if (!fact) return '';
  if (fact.value === null) return '(null)';
  const s = String(fact.value);
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

function addFact() {
  if (!draft.property) draft.property = {};
  if (!draft.property.facts) draft.property.facts = {};
  const key = window.prompt('New fact key (e.g. plotArea)');
  if (!key || !key.trim()) return;
  const k = key.trim();
  if (draft.property.facts[k]) { toast('Key already exists', 'error'); return; }
  draft.property.facts[k] = { value: '', status: 'pending' };
  openItems.facts = openItems.facts || {}; openItems.facts[k] = true;
  draw();
}

function removeFact(key) {
  if (!window.confirm('Remove fact "' + key + '"? This cannot be undone in the editor.')) return;
  delete draft.property.facts[key];
  draw();
}

function renameFact(key) {
  const newKey = window.prompt('Rename fact "' + key + '" to:', key);
  if (!newKey || newKey === key || !newKey.trim()) return;
  const nk = newKey.trim();
  if (draft.property.facts[nk]) { toast('Key already exists', 'error'); return; }
  const val = draft.property.facts[key];
  const rebuilt = {};
  for (const [k, v] of Object.entries(draft.property.facts)) rebuilt[k === key ? nk : k] = v;
  draft.property.facts = rebuilt;
  if (openItems.facts?.[key]) { openItems.facts[nk] = true; delete openItems.facts[key]; }
  draw();
}

function changeFactType(key, type) {
  const fact = draft.property.facts[key];
  if (!fact) return;
  const cur = fact.value;
  if (type === 'null')   fact.value = null;
  else if (type === 'number') {
    const n = Number(cur);
    fact.value = isFinite(n) ? n : 0;
  } else {
    fact.value = cur == null ? '' : String(cur);
  }
  draw();
}

/* ── Systems ──────────────────────────────────────────────── */

function renderSystems() {
  const sys = draft.property?.systems || {};
  let html = '<div class="ke-repeater">';
  for (const key of Object.keys(sys)) html += renderSystemRow(key, sys[key]);
  html += '</div>';
  html += '<div class="ke-add"><button class="btn btn-outline" data-ke-action="systems-add">+ Add system</button></div>';
  return html;
}

function renderSystemRow(key, s) {
  const path = 'property.systems["' + encodeKey(key) + '"]';
  const open = !!openItems.systems?.[key];
  const summary = '<span class="ke-item-key mono">' + esc(key) + '</span>' +
                  '<span class="ke-item-val">' + esc(truncate(s?.description || '', 80)) + '</span>' +
                  '<span class="ke-pill ke-pill-' + esc(s?.status || 'pending') + '">' + esc(s?.status || 'pending') + '</span>';
  let html = '<div class="ke-item' + (open ? ' ke-item-open' : '') + '">' +
    '<button class="ke-item-head" data-ke-action="toggle-item" data-ke-path="systems" data-ke-key="' + esc(key) + '">' +
      '<span class="ke-chev">' + (open ? '▾' : '▸') + '</span>' + summary +
    '</button>';
  if (open) {
    html += '<div class="ke-item-body">' +
      '<div class="ke-row"><label>Key</label><span class="mono">' + esc(key) + '</span> ' +
        '<button class="ke-btn-sm" data-ke-action="systems-rename" data-ke-key="' + esc(key) + '">rename</button></div>' +
      field(path + '.description', 'Description', s?.description ?? '', 'textarea') +
      selectField(path + '.status', 'Status', s?.status || 'pending', STATUS_ENUM) +
      field(path + '.sceneLink', 'Scene link (optional)', s?.sceneLink ?? '', 'text') +
      field(path + '.note', 'Note (optional)', s?.note ?? '', 'textarea') +
      '<div class="ke-row-actions"><button class="btn btn-outline ke-btn-danger" data-ke-action="systems-remove" data-ke-key="' + esc(key) + '">Remove system</button></div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function addSystem() {
  if (!draft.property) draft.property = {};
  if (!draft.property.systems) draft.property.systems = {};
  const key = window.prompt('New system key (e.g. pool)');
  if (!key || !key.trim()) return;
  const k = key.trim();
  if (draft.property.systems[k]) { toast('Key already exists', 'error'); return; }
  draft.property.systems[k] = { description: '', status: 'pending' };
  openItems.systems = openItems.systems || {}; openItems.systems[k] = true;
  draw();
}

function removeSystem(key) {
  if (!window.confirm('Remove system "' + key + '"?')) return;
  delete draft.property.systems[key];
  draw();
}

function renameSystem(key) {
  const nk = (window.prompt('Rename system "' + key + '" to:', key) || '').trim();
  if (!nk || nk === key) return;
  if (draft.property.systems[nk]) { toast('Key already exists', 'error'); return; }
  const rebuilt = {};
  for (const [k, v] of Object.entries(draft.property.systems)) rebuilt[k === key ? nk : k] = v;
  draft.property.systems = rebuilt;
  if (openItems.systems?.[key]) { openItems.systems[nk] = true; delete openItems.systems[key]; }
  draw();
}

/* ── Spaces (with cross-ref safety) ───────────────────────── */

function renderSpaces() {
  const spaces = draft.property?.spaces || {};
  const refs = referencedSpaces();
  let html = '<div class="ke-repeater">';
  for (const key of Object.keys(spaces)) html += renderSpaceRow(key, spaces[key], refs);
  html += '</div>';
  html += '<div class="ke-add"><button class="btn btn-outline" data-ke-action="spaces-add">+ Add space</button></div>';
  return html;
}

function renderSpaceRow(key, sp, refs) {
  const path = 'property.spaces["' + encodeKey(key) + '"]';
  const open = !!openItems.spaces?.[key];
  const isRef = refs.has(key);
  const hasEs = !!sp?.descriptionEs;
  const summary = '<span class="ke-item-key mono">' + esc(key) + '</span>' +
                  '<span class="ke-item-val">' + esc(truncate(sp?.description || '', 60)) + '</span>' +
                  (sp?.type ? '<span class="ke-pill">' + esc(sp.type) + '</span>' : '') +
                  (isRef ? '<span class="ke-pill ke-pill-ref" title="Referenced by content.sceneSpaces">ref</span>' : '') +
                  (hasEs ? '<span class="ke-pill ke-pill-ok">es</span>' : '<span class="ke-pill ke-pill-warn">no es</span>');
  let html = '<div class="ke-item' + (open ? ' ke-item-open' : '') + '">' +
    '<button class="ke-item-head" data-ke-action="toggle-item" data-ke-path="spaces" data-ke-key="' + esc(key) + '">' +
      '<span class="ke-chev">' + (open ? '▾' : '▸') + '</span>' + summary +
    '</button>';
  if (open) {
    const scenes = referencesForSpace(key);
    html += '<div class="ke-item-body">' +
      '<div class="ke-row"><label>Name</label><span class="mono">' + esc(key) + '</span> ' +
        '<button class="ke-btn-sm" data-ke-action="spaces-rename" data-ke-key="' + esc(key) + '">rename</button></div>' +
      (isRef
        ? '<div class="ke-warn-box">Referenced by content.sceneSpaces in scene(s): ' +
          scenes.map(esc).join(', ') + '. Rename or remove will break the visitor experience until content is updated.</div>'
        : '') +
      selectField(path + '.type', 'Type', sp?.type || 'other', SPACE_TYPES) +
      field(path + '.sequence', 'Sequence', sp?.sequence ?? '', 'text') +
      field(path + '.zone', 'Zone', sp?.zone ?? '', 'text') +
      field(path + '.description', 'Description (en)', sp?.description ?? '', 'textarea') +
      field(path + '.descriptionEs', 'Descripción (es)', sp?.descriptionEs ?? '', 'textarea') +
      '<div class="ke-row-actions">' +
        (isRef
          ? '<button class="btn btn-outline ke-btn-danger" disabled title="Blocked: referenced by content.sceneSpaces">Remove space (blocked)</button>'
          : '<button class="btn btn-outline ke-btn-danger" data-ke-action="spaces-remove" data-ke-key="' + esc(key) + '">Remove space</button>') +
      '</div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function addSpace() {
  if (!draft.property) draft.property = {};
  if (!draft.property.spaces) draft.property.spaces = {};
  const key = window.prompt('New space name');
  if (!key || !key.trim()) return;
  const k = key.trim();
  if (draft.property.spaces[k]) { toast('Space already exists', 'error'); return; }
  draft.property.spaces[k] = { description: '', descriptionEs: '', type: 'other', sequence: '', zone: '' };
  openItems.spaces = openItems.spaces || {}; openItems.spaces[k] = true;
  draw();
}

function removeSpace(key) {
  if (referencedSpaces().has(key)) { toast('Blocked: space is referenced by content.sceneSpaces', 'error'); return; }
  if (!window.confirm('Remove space "' + key + '"?')) return;
  delete draft.property.spaces[key];
  draw();
}

function renameSpace(key) {
  const refs = referencesForSpace(key);
  const refMsg = refs.length
    ? '\n\n⚠ Warning: this space is referenced by content.sceneSpaces in scene(s): ' +
      refs.join(', ') + '.\nRenaming here will break those references until content is updated separately.'
    : '';
  const confirmMsg = 'Rename space "' + key + '"?' + refMsg + '\n\nType the new name below.';
  const nk = (window.prompt(confirmMsg, key) || '').trim();
  if (!nk || nk === key) return;
  if (draft.property.spaces[nk]) { toast('A space with that name exists', 'error'); return; }
  if (refs.length && !window.confirm('Final confirmation: rename "' + key + '" → "' + nk + '"? This WILL break scene references.')) return;
  const rebuilt = {};
  for (const [k, v] of Object.entries(draft.property.spaces)) rebuilt[k === key ? nk : k] = v;
  draft.property.spaces = rebuilt;
  if (openItems.spaces?.[key]) { openItems.spaces[nk] = true; delete openItems.spaces[key]; }
  draw();
}

/* ── Intents (ordered) ────────────────────────────────────── */

function renderIntents() {
  const intents = draft.intents || [];
  let html = '<div class="ke-repeater">';
  for (let i = 0; i < intents.length; i++) html += renderIntentRow(i, intents[i]);
  html += '</div>';
  html += '<div class="ke-add"><button class="btn btn-outline" data-ke-action="intents-add">+ Add intent</button></div>';
  return html;
}

function renderIntentRow(i, it) {
  const path = 'intents[' + i + ']';
  const open = !!openItems.intents?.[i];
  const kwCount = (it?.keywords || []).length;
  const summary = '<span class="ke-item-key mono">' + esc(it?.id || '(no id)') + '</span>' +
                  '<span class="ke-item-val">' + kwCount + ' kw</span>' +
                  '<span class="ke-pill">' + esc(it?.confidence || 'confirmed') + '</span>';
  let html = '<div class="ke-item' + (open ? ' ke-item-open' : '') + '">' +
    '<div class="ke-item-head-row">' +
      '<button class="ke-item-head" data-ke-action="toggle-item" data-ke-path="intents" data-ke-key="' + i + '">' +
        '<span class="ke-chev">' + (open ? '▾' : '▸') + '</span>' + summary +
      '</button>' +
      '<span class="ke-move">' +
        '<button class="ke-btn-sm" data-ke-action="intents-move" data-ke-key="' + i + '" data-ke-delta="-1"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="ke-btn-sm" data-ke-action="intents-move" data-ke-key="' + i + '" data-ke-delta="1"' + (i === (draft.intents.length - 1) ? ' disabled' : '') + '>↓</button>' +
      '</span>' +
    '</div>';
  if (open) {
    html += '<div class="ke-item-body">' +
      field(path + '.id', 'Id', it?.id ?? '', 'text') +
      selectField(path + '.confidence', 'Confidence', it?.confidence || 'confirmed', CONFIDENCE_ENUM) +
      tagsField(path + '.keywords', 'Keywords', it?.keywords || []) +
      field(path + '.en', 'Answer (en)', it?.en ?? '', 'textarea') +
      field(path + '.es', 'Answer (es)', it?.es ?? '', 'textarea') +
      tagsField(path + '.sceneLinks', 'Scene links', it?.sceneLinks || []) +
      tagsField(path + '.spaceLinks', 'Space links', it?.spaceLinks || []) +
      tagsField(path + '.docLinks', 'Doc links (' + DOC_ENUM.join('|') + ')', it?.docLinks || []) +
      field(path + '.followUp.en', 'Follow-up (en)', it?.followUp?.en ?? '', 'text') +
      field(path + '.followUp.es', 'Follow-up (es)', it?.followUp?.es ?? '', 'text') +
      '<div class="ke-row-actions"><button class="btn btn-outline ke-btn-danger" data-ke-action="intents-remove" data-ke-key="' + i + '">Remove intent</button></div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function addIntent() {
  if (!Array.isArray(draft.intents)) draft.intents = [];
  draft.intents.push({ id: '', keywords: [], en: '', es: '', confidence: 'confirmed', sceneLinks: [], spaceLinks: [], docLinks: [], followUp: { en: '', es: '' } });
  openItems.intents = openItems.intents || {}; openItems.intents[draft.intents.length - 1] = true;
  draw();
}

function removeIntent(i) {
  if (!window.confirm('Remove intent #' + (i + 1) + '?')) return;
  draft.intents.splice(i, 1);
  openItems.intents = {};
  draw();
}

function moveIntent(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= draft.intents.length) return;
  const [row] = draft.intents.splice(i, 1);
  draft.intents.splice(j, 0, row);
  openItems.intents = {};
  draw();
}

/* Generic tag utilities (for keywords/scene/space/doc/interest keywords) */

function tagsField(path, label, arr) {
  return '<div class="ke-row ke-row-tags"><label>' + esc(label) + '</label>' +
    '<div class="ke-tags">' +
      arr.map((t, idx) =>
        '<span class="ke-tag">' + esc(t) +
          '<button class="ke-tag-x" data-ke-action="intents-tag-remove" data-ke-path="' + esc(path) + '" data-ke-key="' + idx + '" title="Remove">×</button>' +
        '</span>'
      ).join('') +
      '<input class="ke-tag-input" placeholder="+ add & press Enter"' +
        ' data-ke-tag-input="' + esc(path) + '"' +
        ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();const v=this.value.trim();if(v){this.dispatchEvent(new CustomEvent(\'ke-tag-commit\',{bubbles:true,detail:{path:this.dataset.keTagInput,value:v}}));this.value=\'\';}}"' +
      ' />' +
    '</div>' +
  '</div>';
}

function addTag(path, value) {
  const cur = getPath(draft, path) || [];
  if (!Array.isArray(cur)) return;
  cur.push(value);
  setPath(draft, path, cur);
  draw();
}
function removeTag(path, idx) {
  const cur = getPath(draft, path) || [];
  if (!Array.isArray(cur)) return;
  cur.splice(Number(idx), 1);
  setPath(draft, path, cur);
  draw();
}

/* ── Interest Signals ─────────────────────────────────────── */

function renderInterestSignals() {
  const sig = draft.interestSignals || {};
  let html = '<div class="ke-repeater">';
  for (const key of Object.keys(sig)) html += renderInterestRow(key, sig[key]);
  html += '</div>';
  html += '<div class="ke-add"><button class="btn btn-outline" data-ke-action="interest-add">+ Add interest</button></div>';
  return html;
}

function renderInterestRow(key, kws) {
  const path = 'interestSignals["' + encodeKey(key) + '"]';
  const open = !!openItems.interestSignals?.[key];
  const inEnum = INTEREST_ENUM.includes(key);
  const summary = '<span class="ke-item-key mono">' + esc(key) + '</span>' +
                  '<span class="ke-item-val">' + (Array.isArray(kws) ? kws.length : 0) + ' kw</span>' +
                  (inEnum ? '' : '<span class="ke-pill ke-pill-warn" title="Not in visitor enum — LLM will never emit">warn</span>');
  let html = '<div class="ke-item' + (open ? ' ke-item-open' : '') + '">' +
    '<button class="ke-item-head" data-ke-action="toggle-item" data-ke-path="interestSignals" data-ke-key="' + esc(key) + '">' +
      '<span class="ke-chev">' + (open ? '▾' : '▸') + '</span>' + summary +
    '</button>';
  if (open) {
    html += '<div class="ke-item-body">' +
      '<div class="ke-row"><label>Name</label><span class="mono">' + esc(key) + '</span> ' +
        '<button class="ke-btn-sm" data-ke-action="interest-rename" data-ke-key="' + esc(key) + '">rename</button></div>' +
      (inEnum ? '' :
        '<div class="ke-warn-box">"' + esc(key) + '" is not in the visitor concierge enum (' + INTEREST_ENUM.join(', ') +
        '). The LLM will not emit this interest; the keyword engine will still match it client-side.</div>') +
      field(path, 'Keywords (one per line)', (kws || []).join('\n'), 'textarea', 'lines') +
      '<div class="ke-row-actions"><button class="btn btn-outline ke-btn-danger" data-ke-action="interest-remove" data-ke-key="' + esc(key) + '">Remove interest</button></div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function addInterest() {
  if (!draft.interestSignals) draft.interestSignals = {};
  const key = window.prompt('New interest name (e.g. ' + INTEREST_ENUM.join(' / ') + ')');
  if (!key || !key.trim()) return;
  const k = key.trim();
  if (draft.interestSignals[k]) { toast('Interest already exists', 'error'); return; }
  draft.interestSignals[k] = [];
  openItems.interestSignals = openItems.interestSignals || {}; openItems.interestSignals[k] = true;
  draw();
}
function removeInterest(key) {
  if (!window.confirm('Remove interest "' + key + '"?')) return;
  delete draft.interestSignals[key];
  draw();
}
function renameInterest(key) {
  const nk = (window.prompt('Rename interest "' + key + '" to:', key) || '').trim();
  if (!nk || nk === key) return;
  if (draft.interestSignals[nk]) { toast('Name exists', 'error'); return; }
  const rebuilt = {};
  for (const [k, v] of Object.entries(draft.interestSignals)) rebuilt[k === key ? nk : k] = v;
  draft.interestSignals = rebuilt;
  if (openItems.interestSignals?.[key]) { openItems.interestSignals[nk] = true; delete openItems.interestSignals[key]; }
  draw();
}

/* ── Qualification (ordered) ──────────────────────────────── */

function renderQualification() {
  const arr = draft.qualification || [];
  let html = '<div class="ke-repeater">';
  for (let i = 0; i < arr.length; i++) html += renderQualRow(i, arr[i]);
  html += '</div>';
  html += '<div class="ke-add"><button class="btn btn-outline" data-ke-action="qual-add">+ Add qualification trigger</button></div>';
  return html;
}

function renderQualRow(i, q) {
  const path = 'qualification[' + i + ']';
  const open = !!openItems.qualification?.[i];
  const wired = QUAL_TRIGGERS.includes(q?.trigger);
  const summary = '<span class="ke-item-key mono">' + esc(q?.trigger || '(no trigger)') + '</span>' +
                  (wired ? '<span class="ke-pill ke-pill-ok">wired</span>' : '<span class="ke-pill ke-pill-warn" title="Not dispatched by analytics">warn</span>');
  let html = '<div class="ke-item' + (open ? ' ke-item-open' : '') + '">' +
    '<div class="ke-item-head-row">' +
      '<button class="ke-item-head" data-ke-action="toggle-item" data-ke-path="qualification" data-ke-key="' + i + '">' +
        '<span class="ke-chev">' + (open ? '▾' : '▸') + '</span>' + summary +
      '</button>' +
      '<span class="ke-move">' +
        '<button class="ke-btn-sm" data-ke-action="qual-move" data-ke-key="' + i + '" data-ke-delta="-1"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="ke-btn-sm" data-ke-action="qual-move" data-ke-key="' + i + '" data-ke-delta="1"' + (i === arr(draft.qualification).length - 1 ? ' disabled' : '') + '>↓</button>' +
      '</span>' +
    '</div>';
  if (open) {
    html += '<div class="ke-item-body">' +
      selectField(path + '.trigger', 'Trigger', q?.trigger || QUAL_TRIGGERS[0], QUAL_TRIGGERS, true) +
      (wired ? '' :
        '<div class="ke-warn-box">Trigger "' + esc(q?.trigger || '') + '" is not in analytics.shouldQualify — it will never fire. Wired triggers: ' + QUAL_TRIGGERS.join(', ') + '.</div>') +
      field(path + '.en', 'Message (en)', q?.en ?? '', 'textarea') +
      field(path + '.es', 'Message (es)', q?.es ?? '', 'textarea') +
      '<div class="ke-row-actions"><button class="btn btn-outline ke-btn-danger" data-ke-action="qual-remove" data-ke-key="' + i + '">Remove</button></div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function arr(v) { return Array.isArray(v) ? v : []; }

function addQualification() {
  if (!Array.isArray(draft.qualification)) draft.qualification = [];
  draft.qualification.push({ trigger: QUAL_TRIGGERS[0], en: '', es: '' });
  openItems.qualification = openItems.qualification || {}; openItems.qualification[draft.qualification.length - 1] = true;
  draw();
}
function removeQualification(i) {
  if (!window.confirm('Remove qualification #' + (i + 1) + '?')) return;
  draft.qualification.splice(i, 1);
  openItems.qualification = {};
  draw();
}
function moveQualification(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= draft.qualification.length) return;
  const [row] = draft.qualification.splice(i, 1);
  draft.qualification.splice(j, 0, row);
  openItems.qualification = {};
  draw();
}

/* ── Surroundings (shape-aware) ───────────────────────────── */

function detectSurrShape(key, val) {
  if (key === 'neighborhood' && val && typeof val === 'object' && !Array.isArray(val) && 'name' in val) return 'neighborhood';
  if (key === 'distances' && Array.isArray(val)) return 'distances';
  if (key === 'lifestyle' && val && typeof val === 'object' && !Array.isArray(val)) {
    if (Object.values(val).every(v => v && typeof v === 'object' && ('en' in v || 'es' in v))) return 'dict-bilingual';
  }
  if (!val || typeof val !== 'object' || Array.isArray(val)) return 'unknown';
  const keys = Object.keys(val);
  if (keys.includes('en') || keys.includes('es')) {
    /* {en?, es?, status?} — allow only these three; anything else → unknown */
    const allowed = new Set(['en', 'es', 'status']);
    if (keys.every(k => allowed.has(k))) return 'bilingual';
    return 'unknown';
  }
  if (keys.length && keys.every(k => k === 'status' || k === 'note')) return 'status-note';
  /* dict-of-bilingual: every value is a {en/es(/status)} block */
  if (keys.length && Object.values(val).every(v => v && typeof v === 'object' && !Array.isArray(v) && ('en' in v || 'es' in v))) {
    return 'dict-bilingual';
  }
  return 'unknown';
}

function renderSurroundings() {
  const s = draft.surroundings || {};
  const keys = Object.keys(s);
  let html = '<div class="ke-repeater">';
  for (const key of keys) html += renderSurrBlock(key, s[key]);
  html += '</div>';
  html += '<div class="ke-add"><button class="btn btn-outline" data-ke-action="surr-add">+ Add surroundings block</button></div>';
  return html;
}

function renderSurrBlock(key, val) {
  const shape = detectSurrShape(key, val);
  const open = !!openItems.surroundings?.[key];
  const summary = '<span class="ke-item-key mono">' + esc(key) + '</span>' +
                  '<span class="ke-pill ke-pill-shape">' + esc(shape) + '</span>';
  let html = '<div class="ke-item' + (open ? ' ke-item-open' : '') + '">' +
    '<button class="ke-item-head" data-ke-action="toggle-item" data-ke-path="surroundings" data-ke-key="' + esc(key) + '">' +
      '<span class="ke-chev">' + (open ? '▾' : '▸') + '</span>' + summary +
    '</button>';
  if (open) {
    html += '<div class="ke-item-body">';
    if (shape === 'unknown') html += renderSurrUnknown(key, val);
    else if (shape === 'neighborhood')     html += renderSurrNeighborhood(key, val);
    else if (shape === 'distances')        html += renderSurrDistances(key, val);
    else if (shape === 'bilingual')        html += renderSurrBilingual(key, val);
    else if (shape === 'status-note')      html += renderSurrStatusNote(key, val);
    else if (shape === 'dict-bilingual')   html += renderSurrDictBilingual(key, val);
    html += '<div class="ke-row-actions"><button class="btn btn-outline ke-btn-danger" data-ke-action="surr-remove" data-ke-key="' + esc(key) + '">Remove block</button></div>' +
      '</div>';
  }
  html += '</div>';
  return html;
}

function renderSurrUnknown(key, val) {
  const json = JSON.stringify(val, null, 2);
  return '<div class="ke-warn-box">Unknown shape — read-only, preserved exactly on save. Editor cannot modify this block in M5.5c.</div>' +
         '<pre class="ke-json-readonly">' + esc(json) + '</pre>';
}

function renderSurrNeighborhood(key, val) {
  const base = 'surroundings["' + encodeKey(key) + '"]';
  return field(base + '.name', 'Name', val?.name ?? '', 'text') +
         field(base + '.character', 'Character', val?.character ?? '', 'textarea') +
         selectField(base + '.status', 'Status', val?.status || 'pending', STATUS_ENUM);
}

function renderSurrBilingual(key, val) {
  const base = 'surroundings["' + encodeKey(key) + '"]';
  return field(base + '.en', 'English', val?.en ?? '', 'textarea') +
         field(base + '.es', 'Español', val?.es ?? '', 'textarea') +
         selectField(base + '.status', 'Status', val?.status || 'pending', STATUS_ENUM);
}

function renderSurrStatusNote(key, val) {
  const base = 'surroundings["' + encodeKey(key) + '"]';
  return selectField(base + '.status', 'Status', val?.status || 'pending', STATUS_ENUM) +
         field(base + '.note', 'Note (optional)', val?.note ?? '', 'textarea');
}

function renderSurrDistances(key, val) {
  const arr = Array.isArray(val) ? val : [];
  let html = '<div class="ke-subrepeater">';
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i];
    const base = 'surroundings["' + encodeKey(key) + '"][' + i + ']';
    html += '<div class="ke-subrow">' +
      '<span class="ke-subrow-move">' +
        '<button class="ke-btn-sm" data-ke-action="distances-move" data-ke-key="' + i + '" data-ke-delta="-1"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="ke-btn-sm" data-ke-action="distances-move" data-ke-key="' + i + '" data-ke-delta="1"' + (i === arr.length - 1 ? ' disabled' : '') + '>↓</button>' +
      '</span>' +
      field(base + '.place', 'Place', d?.place ?? '', 'text') +
      field(base + '.distance', 'Distance', d?.distance ?? '', 'text') +
      selectField(base + '.status', 'Status', d?.status || 'pending', STATUS_ENUM) +
      '<button class="ke-btn-sm ke-btn-danger" data-ke-action="distances-remove" data-ke-key="' + i + '">Remove</button>' +
    '</div>';
  }
  html += '</div>';
  html += '<div class="ke-add"><button class="btn btn-outline" data-ke-action="distances-add">+ Add distance</button></div>';
  return html;
}

function renderSurrDictBilingual(key, val) {
  const entries = Object.entries(val || {});
  const outerKey = key;
  let html = '<div class="ke-subrepeater">';
  for (const [subKey, sub] of entries) {
    const base = 'surroundings["' + encodeKey(outerKey) + '"]["' + encodeKey(subKey) + '"]';
    const isLifestyle = outerKey === 'lifestyle';
    html += '<div class="ke-subblock">' +
      '<div class="ke-subblock-head"><span class="mono">' + esc(subKey) + '</span> ' +
        '<button class="ke-btn-sm" data-ke-action="' + (isLifestyle ? 'lifestyle-rename' : 'transport-child-rename') + '" data-ke-key="' + esc(subKey) + '">rename</button> ' +
        '<button class="ke-btn-sm ke-btn-danger" data-ke-action="' + (isLifestyle ? 'lifestyle-remove' : 'transport-child-remove') + '" data-ke-key="' + esc(subKey) + '">remove</button>' +
      '</div>' +
      field(base + '.en', 'English', sub?.en ?? '', 'textarea') +
      field(base + '.es', 'Español', sub?.es ?? '', 'textarea') +
      selectField(base + '.status', 'Status', sub?.status || 'pending', STATUS_ENUM) +
    '</div>';
  }
  html += '</div>';
  html += '<div class="ke-add"><button class="btn btn-outline" data-ke-action="' + (key === 'lifestyle' ? 'lifestyle-add' : 'transport-child-add') + '">+ Add slot</button></div>';
  return html;
}

/* Surroundings mutators */

function addSurrKey() {
  if (!draft.surroundings) draft.surroundings = {};
  const key = window.prompt('New surroundings block key (e.g. beaches, gastronomy)');
  if (!key || !key.trim()) return;
  const k = key.trim();
  if (draft.surroundings[k]) { toast('Key exists', 'error'); return; }
  draft.surroundings[k] = { en: '', es: '', status: 'pending' };
  openItems.surroundings = openItems.surroundings || {}; openItems.surroundings[k] = true;
  draw();
}
function removeSurrKey(key) {
  if (!window.confirm('Remove surroundings block "' + key + '"?')) return;
  delete draft.surroundings[key];
  draw();
}

function addDistance() {
  if (!draft.surroundings) draft.surroundings = {};
  if (!Array.isArray(draft.surroundings.distances)) draft.surroundings.distances = [];
  draft.surroundings.distances.push({ place: '', distance: '', status: 'pending' });
  draw();
}
function removeDistance(i) {
  if (!window.confirm('Remove distance #' + (i + 1) + '?')) return;
  draft.surroundings.distances.splice(i, 1);
  draw();
}
function moveDistance(i, delta) {
  const arrRef = draft.surroundings.distances;
  const j = i + delta;
  if (j < 0 || j >= arrRef.length) return;
  const [row] = arrRef.splice(i, 1);
  arrRef.splice(j, 0, row);
  draw();
}

function addLifestyleSlot() {
  if (!draft.surroundings) draft.surroundings = {};
  if (!draft.surroundings.lifestyle) draft.surroundings.lifestyle = {};
  const k = (window.prompt('New lifestyle slot (e.g. morning, afternoon, lunch, evening)') || '').trim();
  if (!k) return;
  if (draft.surroundings.lifestyle[k]) { toast('Slot exists', 'error'); return; }
  draft.surroundings.lifestyle[k] = { en: '', es: '', status: 'pending' };
  draw();
}
function removeLifestyleSlot(k) {
  if (!window.confirm('Remove lifestyle slot "' + k + '"?')) return;
  delete draft.surroundings.lifestyle[k];
  draw();
}
function renameLifestyleSlot(k) {
  const nk = (window.prompt('Rename slot "' + k + '" to:', k) || '').trim();
  if (!nk || nk === k) return;
  if (draft.surroundings.lifestyle[nk]) { toast('Slot exists', 'error'); return; }
  const rebuilt = {};
  for (const [x, v] of Object.entries(draft.surroundings.lifestyle)) rebuilt[x === k ? nk : x] = v;
  draft.surroundings.lifestyle = rebuilt;
  draw();
}

/* Transport dict-of-bilingual (Madrid): add/remove/rename sub-blocks */
function addTransportChild() {
  const target = draft.surroundings?.transport;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return;
  const k = (window.prompt('New transport sub-block (e.g. metro, bus, taxi)') || '').trim();
  if (!k) return;
  if (target[k]) { toast('Exists', 'error'); return; }
  target[k] = { en: '', es: '', status: 'pending' };
  draw();
}
function removeTransportChild(k) {
  if (!window.confirm('Remove sub-block "' + k + '"?')) return;
  delete draft.surroundings.transport[k];
  draw();
}
function renameTransportChild(k) {
  const nk = (window.prompt('Rename "' + k + '" to:', k) || '').trim();
  if (!nk || nk === k) return;
  if (draft.surroundings.transport[nk]) { toast('Exists', 'error'); return; }
  const rebuilt = {};
  for (const [x, v] of Object.entries(draft.surroundings.transport)) rebuilt[x === k ? nk : x] = v;
  draft.surroundings.transport = rebuilt;
  draw();
}

/* ── Field primitives ─────────────────────────────────────── */

function field(path, label, value, kind, cast) {
  const id = 'ke-' + Math.random().toString(36).slice(2, 8);
  const castAttr = cast ? ' data-ke-cast="' + cast + '"' : (kind === 'number' ? ' data-ke-cast="number"' : '');
  const common = 'data-ke-input="' + esc(path) + '"' + castAttr + ' id="' + id + '"';
  let control;
  if (kind === 'textarea') {
    control = '<textarea class="ke-textarea" ' + common + '>' + esc(String(value == null ? '' : value)) + '</textarea>';
  } else if (kind === 'number') {
    control = '<input class="ke-input" type="number" step="any" ' + common + ' value="' + esc(String(value == null ? '' : value)) + '"/>';
  } else {
    control = '<input class="ke-input" type="text" ' + common + ' value="' + esc(String(value == null ? '' : value)) + '"/>';
  }
  return '<div class="ke-row"><label for="' + id + '">' + esc(label) + '</label>' + control + '</div>';
}

function selectField(path, label, value, opts, editable) {
  const id = 'ke-' + Math.random().toString(36).slice(2, 8);
  const options = opts.map(o => '<option value="' + esc(o) + '"' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
  const custom = editable && !opts.includes(value)
    ? '<option value="' + esc(value) + '" selected>' + esc(value) + ' (custom)</option>'
    : '';
  return '<div class="ke-row"><label for="' + id + '">' + esc(label) + '</label>' +
    '<select class="ke-input" data-ke-input="' + esc(path) + '" id="' + id + '">' + custom + options + '</select>' +
  '</div>';
}

function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

