/* ── Larum Admin · Content Editor ─────────────────────────────
   Section-based editor for properties.content JSONB.
   Renders inside the workspace Content tab. Each section maps
   to a conceptual area of the property experience.

   Edits the content object in memory; saveContent() writes the
   entire column back to Supabase. Never touches knowledge or
   assets.
   ───────────────────────────────────────────────────────────── */

import { esc } from './admin-core.js';
import { toast } from './admin-ui.js';
import { saveContent, ConflictError } from './admin-property-store.js';

let draft = null;
let slug = null;
let containerRef = null;
let openSections = { identity: true };
let saving = false;

/* Live reference to the property object passed into render() — refreshed
   on every call, NOT gated by sameSlug (unlike `draft`, which must
   survive a tab switch untouched). Since this is the same object as
   admin-property-store.js's cache entry, its `updated_at` is always
   current at the moment handleSave() reads it, even if another tab
   saved in between without this editor re-rendering (M6.5a). */
let propertyRef = null;

/* Admin Hardening Pass — read-only cross-refs into knowledge/assets.
   Never written back by this editor (it only ever saves `content`);
   used solely to show space/source status next to the fields that
   name them, so an operator doesn't have to jump editors blind. */
let knowledgeRef = {};
let assetsRef = {};

const SECTIONS = [
  { id: 'identity',     label: 'Identity' },
  { id: 'narrative',    label: 'Narrative' },
  { id: 'spaces',       label: 'Spatial Zones' },
  { id: 'dna',          label: 'DNA' },
  { id: 'information',  label: 'Information' },
  { id: 'surroundings', label: 'Surroundings' },
  { id: 'arrival',      label: 'Arrival' }
];

const PROPERTY_TYPES = ['resale', 'new'];

const COPY_KEYS = [
  'identityNote', 'bandLabel', 'sequenceTitle', 'sequenceIntro', 'filmLabel',
  'spatialTitle', 'spatialIntro', 'spatialDetail', 'detailsTitle', 'detailsIntro'
];

export function render(container, property) {
  /* admin-workspace.js re-invokes render() on every tab switch, not
     just on navigating to a different property — without this guard,
     switching to another Workspace tab and back silently discarded
     any unsaved edit (M6.4 finding). knowledgeRef/assetsRef are
     read-only cross-refs, not part of the editable draft, so they
     always refresh regardless — the other editors' own saves should
     be visible immediately here. */
  const sameSlug = slug === property.slug && draft;
  containerRef = container;
  knowledgeRef = property.knowledge || {};
  assetsRef = property.assets || {};
  propertyRef = property;
  if (!sameSlug) {
    slug = property.slug;
    draft = JSON.parse(JSON.stringify(property.content || {}));
    openSections = { identity: true };
  }
  draw();
}

export function teardown() {
  containerRef = null;
  draft = null;
  slug = null;
  knowledgeRef = {};
  assetsRef = {};
  propertyRef = null;
  delete window.__ceToggle;
  delete window.__ceInput;
  delete window.__ceSave;
  delete window.__ceAddRepeat;
  delete window.__ceRemoveRepeat;
  delete window.__ceMoveRepeat;
}

function draw() {
  if (!containerRef || !draft) return;

  let html = '<div class="ce">';
  html += '<div class="ce-toolbar">' +
    '<button class="btn btn-primary" onclick="__ceSave()" id="ceSaveBtn"' +
    (saving ? ' disabled' : '') + '>' +
    (saving ? 'Saving...' : 'Save content') + '</button>' +
    '<span class="ce-status mono" id="ceStatus"></span>' +
  '</div>';

  for (const sec of SECTIONS) {
    const open = !!openSections[sec.id];
    html += '<div class="ce-section' + (open ? ' ce-open' : '') + '">' +
      '<button class="ce-section-head" onclick="__ceToggle(\'' + sec.id + '\')">' +
        '<span class="ce-section-arrow">' + (open ? '▾' : '▸') + '</span>' +
        '<span>' + esc(sec.label) + '</span>' +
      '</button>';
    if (open) {
      html += '<div class="ce-section-body">' + renderSection(sec.id) + '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  containerRef.innerHTML = html;

  window.__ceToggle = toggleSection;
  window.__ceInput = handleInput;
  window.__ceSave = handleSave;
  window.__ceAddRepeat = addRepeaterItem;
  window.__ceRemoveRepeat = removeRepeaterItem;
  window.__ceMoveRepeat = moveRepeaterItem;
}

function toggleSection(id) {
  openSections[id] = !openSections[id];
  draw();
}

function handleInput(path, value) {
  setPath(draft, path, value);
}

/* sceneSpaces[i][0] names the scene for lived-sequence's own bookkeeping,
   but no consumer (app.js, modules/lived-sequence.js) ever reads it by
   name — both always index by position, keeping it in lockstep with
   sequences[i][0]. There is no independent field for it in the editor
   (Admin Hardening Pass) specifically to avoid a second place that can
   drift from the sequence title — it is derived on save instead. */
function syncSceneNames() {
  if (!Array.isArray(draft.sequences)) return;
  if (!Array.isArray(draft.sceneSpaces)) draft.sceneSpaces = [];
  for (let i = 0; i < draft.sequences.length; i++) {
    if (!draft.sceneSpaces[i]) draft.sceneSpaces[i] = ['', []];
    draft.sceneSpaces[i][0] = draft.sequences[i][0] || '';
  }
}

async function handleSave() {
  if (saving || !slug || !draft) return;
  saving = true;
  const btn = document.getElementById('ceSaveBtn');
  const status = document.getElementById('ceStatus');
  if (btn) btn.disabled = true;
  if (btn) btn.textContent = 'Saving...';
  if (status) status.textContent = '';

  syncSceneNames();

  try {
    await saveContent(slug, draft, propertyRef?.updated_at);
    toast('Content saved', 'success');
    if (status) status.textContent = 'Saved';
  } catch (e) {
    toast(e instanceof ConflictError ? e.message : 'Save failed: ' + e.message, 'error');
    if (status) status.textContent = 'Error';
  } finally {
    saving = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Save content'; }
  }
}

/* ── Section renderers ────────────────────────────────────── */

function renderSection(id) {
  switch (id) {
    case 'identity':     return renderIdentity();
    case 'narrative':    return renderNarrative();
    case 'spaces':       return renderSpaces();
    case 'dna':          return renderDna();
    case 'information':  return renderInformation();
    case 'surroundings': return renderSurroundings();
    case 'arrival':      return renderArrival();
    default:             return '';
  }
}

/* ── Identity ────────────────────────────────────────────── */

function renderIdentity() {
  let h = '';
  h += fieldReadOnly('Slug', draft.slug || '');
  h += fieldText('label', 'Location label', draft.label || '', 'Madrid · Goya');
  h += fieldText('brand', 'Brand / Agency', draft.brand || '', "Christie's");
  h += fieldBilingual('title', 'Title', draft.title || {}, { multiline: true });
  h += fieldBilingual('subtitle', 'Subtitle', draft.subtitle || {});
  h += fieldBilingual('intro', 'Introduction', draft.intro || {}, { multiline: true });
  h += fieldText('shortRef', 'Short reference', draft.shortRef || '', 'M1558 · Goya');
  h += fieldNumber('referencePrice', 'Reference price (€)', draft.referencePrice || 0);
  h += fieldText('defaultRegion', 'Default region', draft.defaultRegion || '', 'Comunidad de Madrid');
  h += fieldSelect('defaultPropertyType', 'Property type', draft.defaultPropertyType || 'resale', PROPERTY_TYPES);
  h += fieldBilingual('conciergeIntro', 'Concierge intro', draft.conciergeIntro || {}, { multiline: true });

  h += '<div class="ce-subsec"><div class="ce-subsec-label mono">Bilingual copy</div></div>';
  for (const key of COPY_KEYS) {
    h += fieldBilingual('copy.' + key, copyLabel(key), getPath(draft, 'copy.' + key) || {});
  }

  return h;
}

/* ── Narrative ───────────────────────────────────────────── */

function renderNarrative() {
  let h = '';
  h += fieldBilingual('copy.sequenceTitle', 'Section title', getPath(draft, 'copy.sequenceTitle') || {});
  h += fieldBilingual('copy.sequenceIntro', 'Section intro', getPath(draft, 'copy.sequenceIntro') || {});
  h += fieldBilingual('copy.filmLabel', 'Film label', getPath(draft, 'copy.filmLabel') || {});

  const seqs = draft.sequences || [];
  const scenes = draft.sceneSpaces || [];

  h += '<div class="ce-subsec">' +
    '<div class="ce-subsec-label mono">Sequences + Scene spaces</div>' +
    '<button class="btn btn-outline ce-add-btn" onclick="__ceAddRepeat(\'sequence\')">+ Add sequence</button>' +
  '</div>';

  for (let i = 0; i < seqs.length; i++) {
    const s = seqs[i] || [];
    const sc = scenes[i] || [];
    const scSpaces = (sc[1] || []).join(', ');

    h += '<div class="ce-repeat-item">' +
      '<div class="ce-repeat-head">' +
        '<span class="ce-repeat-num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="ce-repeat-actions">' +
          (i > 0 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'sequence\',' + i + ',-1)" title="Move up">↑</button>' : '') +
          (i < seqs.length - 1 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'sequence\',' + i + ',1)" title="Move down">↓</button>' : '') +
          '<button class="ce-icon-btn ce-icon-del" onclick="__ceRemoveRepeat(\'sequence\',' + i + ')" title="Remove">×</button>' +
        '</div>' +
      '</div>' +
      fieldText('sequences.' + i + '.0', 'Title', s[0] || '') +
      fieldText('sequences.' + i + '.1', 'Time', s[1] || '', '09:12') +
      fieldBilingual('sequences.' + i + '.2', 'Description', s[2] || {}, { multiline: true }) +
      fieldText('sceneSpaces.' + i + '.1', 'Spaces (comma-separated)', scSpaces, 'Master suite, Interior patios, Living room') +
      renderSpaceStatus(sc[1] || []) +
    '</div>';
  }

  return h;
}

/* Admin Hardening Pass — read-only status per named space, computed
   from knowledge.property.spaces (description EN/ES) and assets.spaces
   (image). This is the one place an operator sees, while naming a
   space here, whether its content elsewhere is actually filled in —
   without merging the three JSONB columns or duplicating their data. */
function renderSpaceStatus(names) {
  if (!names.length) return '';
  const known = knowledgeRef.property?.spaces || {};
  const media = assetsRef.spaces || {};
  const chips = names.map(name => {
    const k = known[name];
    const hasEn = !!k?.description;
    const hasEs = !!k?.descriptionEs;
    const hasImg = !!media[name]?.image;
    const complete = hasEn && hasEs && hasImg;
    const title = 'Description EN: ' + (hasEn ? 'yes' : 'missing') +
      ' · ES: ' + (hasEs ? 'yes' : 'missing') +
      ' · Image: ' + (hasImg ? 'yes' : 'missing');
    return '<span class="ae-chip' + (complete ? ' ae-chip-filled' : '') + '" title="' + esc(title) + '">' +
      esc(name) + (complete ? ' ✓' : '') +
    '</span>';
  }).join('');
  return '<div class="ce-subsec-label mono" style="margin-top:8px">Space status</div>' +
    '<div class="ae-reference" style="margin-top:4px">' + chips + '</div>' +
    '<div class="mono" style="font-size:10px;color:var(--muted);margin-top:4px">' +
      'Descriptions: Concierge → Knowledge. Images: Assets → Spaces.' +
    '</div>';
}

/* ── Spaces ──────────────────────────────────────────────── */

function renderSpaces() {
  let h = '';
  h += fieldBilingual('copy.spatialTitle', 'Section title', getPath(draft, 'copy.spatialTitle') || {});
  h += fieldBilingual('copy.spatialIntro', 'Section intro', getPath(draft, 'copy.spatialIntro') || {});
  h += fieldBilingual('copy.spatialDetail', 'Spatial detail', getPath(draft, 'copy.spatialDetail') || {});

  const zones = draft.spatial || [];
  const details = draft.spatialNodeDetails || { en: [], es: [] };

  h += '<div class="ce-subsec">' +
    '<div class="ce-subsec-label mono">Spatial zones</div>' +
    '<button class="btn btn-outline ce-add-btn" onclick="__ceAddRepeat(\'spatial\')">+ Add zone</button>' +
  '</div>';

  for (let i = 0; i < zones.length; i++) {
    const z = zones[i] || [];
    h += '<div class="ce-repeat-item">' +
      '<div class="ce-repeat-head">' +
        '<span class="ce-repeat-num">' + esc(z[0] || String(i + 1).padStart(2, '0')) + '</span>' +
        '<div class="ce-repeat-actions">' +
          (i > 0 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'spatial\',' + i + ',-1)" title="Move up">↑</button>' : '') +
          (i < zones.length - 1 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'spatial\',' + i + ',1)" title="Move down">↓</button>' : '') +
          '<button class="ce-icon-btn ce-icon-del" onclick="__ceRemoveRepeat(\'spatial\',' + i + ')" title="Remove">×</button>' +
        '</div>' +
      '</div>' +
      fieldText('spatial.' + i + '.0', 'Number', z[0] || '') +
      fieldBilingual('spatial.' + i + '.1', 'Zone name', z[1] || {}) +
      fieldText('spatial.' + i + '.2', 'Spaces', z[2] || '') +
      fieldTextarea('spatialNodeDetails.en.' + i, 'Detail (EN)', (details.en || [])[i] || '') +
      fieldTextarea('spatialNodeDetails.es.' + i, 'Detail (ES)', (details.es || [])[i] || '') +
    '</div>';
  }

  return h;
}

/* ── DNA ─────────────────────────────────────────────────── */

function renderDna() {
  const dna = draft.dna || {};
  let h = '';
  h += fieldBilingual('dna.title', 'DNA title', dna.title || {});
  h += fieldBilingual('dna.intro', 'DNA intro', dna.intro || {}, { multiline: true });

  const dims = dna.dimensions || [];

  h += '<div class="ce-subsec">' +
    '<div class="ce-subsec-label mono">Dimensions</div>' +
    '<button class="btn btn-outline ce-add-btn" onclick="__ceAddRepeat(\'dna\')">+ Add dimension</button>' +
  '</div>';

  for (let i = 0; i < dims.length; i++) {
    const d = dims[i] || {};
    h += '<div class="ce-repeat-item">' +
      '<div class="ce-repeat-head">' +
        '<span class="ce-repeat-num">' + esc(d.label || '?') + '</span>' +
        '<div class="ce-repeat-actions">' +
          (i > 0 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'dna\',' + i + ',-1)" title="Move up">↑</button>' : '') +
          (i < dims.length - 1 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'dna\',' + i + ',1)" title="Move down">↓</button>' : '') +
          '<button class="ce-icon-btn ce-icon-del" onclick="__ceRemoveRepeat(\'dna\',' + i + ')" title="Remove">×</button>' +
        '</div>' +
      '</div>' +
      fieldText('dna.dimensions.' + i + '.label', 'Label', d.label || '') +
      fieldText('dna.dimensions.' + i + '.score', 'Score', d.score || '') +
      fieldTextarea('dna.dimensions.' + i + '.note.en', 'Note (EN)', (d.note || {}).en || '') +
      fieldTextarea('dna.dimensions.' + i + '.note.es', 'Note (ES)', (d.note || {}).es || '') +
    '</div>';
  }

  return h;
}

/* ── Information ─────────────────────────────────────────── */

function renderInformation() {
  let h = '';
  h += fieldBilingual('copy.detailsTitle', 'Section title', getPath(draft, 'copy.detailsTitle') || {});
  h += fieldBilingual('copy.detailsIntro', 'Section intro', getPath(draft, 'copy.detailsIntro') || {});
  h += fieldBilingual('copy.identityNote', 'Identity note', getPath(draft, 'copy.identityNote') || {});
  h += fieldBilingual('copy.bandLabel', 'Band label', getPath(draft, 'copy.bandLabel') || {});

  const facts = draft.facts || [];
  h += '<div class="ce-subsec">' +
    '<div class="ce-subsec-label mono">Facts</div>' +
    '<button class="btn btn-outline ce-add-btn" onclick="__ceAddRepeat(\'fact\')">+ Add fact</button>' +
  '</div>';

  for (let i = 0; i < facts.length; i++) {
    const f = facts[i] || [];
    h += '<div class="ce-repeat-item ce-repeat-inline">' +
      fieldText('facts.' + i + '.0', 'Value', f[0] || '') +
      fieldBilingual('facts.' + i + '.1', 'Label', f[1] || {}) +
      '<div class="ce-repeat-actions">' +
        (i > 0 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'fact\',' + i + ',-1)" title="Move up">↑</button>' : '') +
        (i < facts.length - 1 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'fact\',' + i + ',1)" title="Move down">↓</button>' : '') +
        '<button class="ce-icon-btn ce-icon-del" onclick="__ceRemoveRepeat(\'fact\',' + i + ')" title="Remove">×</button>' +
      '</div>' +
    '</div>';
  }

  const exps = draft.experiences || [];
  h += '<div class="ce-subsec">' +
    '<div class="ce-subsec-label mono">Experiences</div>' +
    '<button class="btn btn-outline ce-add-btn" onclick="__ceAddRepeat(\'experience\')">+ Add experience</button>' +
  '</div>';

  for (let i = 0; i < exps.length; i++) {
    const e = exps[i] || [];
    h += '<div class="ce-repeat-item">' +
      '<div class="ce-repeat-head">' +
        '<span class="ce-repeat-num">' + esc(e[0] || String(i + 1).padStart(2, '0')) + '</span>' +
        '<div class="ce-repeat-actions">' +
          (i > 0 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'experience\',' + i + ',-1)" title="Move up">↑</button>' : '') +
          (i < exps.length - 1 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'experience\',' + i + ',1)" title="Move down">↓</button>' : '') +
          '<button class="ce-icon-btn ce-icon-del" onclick="__ceRemoveRepeat(\'experience\',' + i + ')" title="Remove">×</button>' +
        '</div>' +
      '</div>' +
      fieldText('experiences.' + i + '.0', 'Number', e[0] || '') +
      fieldBilingual('experiences.' + i + '.1', 'Title', e[1] || {}) +
      fieldBilingual('experiences.' + i + '.2', 'Description', e[2] || {}, { multiline: true }) +
    '</div>';
  }

  return h;
}

/* ── Surroundings ────────────────────────────────────────── */

function renderSurroundings() {
  const setting = draft.setting || {};
  let h = '';
  h += fieldBilingual('setting.title', 'Setting title', setting.title || {});
  h += fieldBilingual('setting.intro', 'Setting intro', setting.intro || {}, { multiline: true });

  const cards = setting.cards || [];
  h += '<div class="ce-subsec">' +
    '<div class="ce-subsec-label mono">Setting cards</div>' +
    '<button class="btn btn-outline ce-add-btn" onclick="__ceAddRepeat(\'setting\')">+ Add card</button>' +
  '</div>';

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i] || {};
    h += '<div class="ce-repeat-item">' +
      '<div class="ce-repeat-head">' +
        '<span class="ce-repeat-num">' + esc((c.title && c.title.en) || c.title || '?') + '</span>' +
        '<div class="ce-repeat-actions">' +
          (i > 0 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'setting\',' + i + ',-1)" title="Move up">↑</button>' : '') +
          (i < cards.length - 1 ? '<button class="ce-icon-btn" onclick="__ceMoveRepeat(\'setting\',' + i + ',1)" title="Move down">↓</button>' : '') +
          '<button class="ce-icon-btn ce-icon-del" onclick="__ceRemoveRepeat(\'setting\',' + i + ')" title="Remove">×</button>' +
        '</div>' +
      '</div>' +
      fieldBilingual('setting.cards.' + i + '.title', 'Title', c.title || {}) +
      fieldBilingual('setting.cards.' + i + '.line', 'Line', c.line || {}) +
      fieldSourceSelect('setting.cards.' + i + '.source', 'Source key', c.source || '') +
    '</div>';
  }

  return h;
}

/* Admin Hardening Pass — `source` must reference a real key of
   knowledge.surroundings (that's what the visitor's setting overlay
   opens), so once that knowledge exists it's offered as a picker
   instead of free text an operator could mistype. Falls back to a
   plain text field while knowledge.surroundings is still empty (e.g.
   drafting a brand-new property before Knowledge has been filled in),
   and always allows the existing value even if it's not in the list. */
function fieldSourceSelect(path, label, value) {
  const keys = Object.keys(knowledgeRef.surroundings || {});
  if (!keys.length) return fieldText(path, label, value, 'parks, restaurants, distances...');

  const id = 'ce_' + path.replace(/\./g, '_');
  const custom = (value && !keys.includes(value))
    ? '<option value="' + esc(value) + '" selected>' + esc(value) + ' (not in Knowledge)</option>'
    : '';
  const opts = keys.map(k =>
    '<option value="' + esc(k) + '"' + (k === value ? ' selected' : '') + '>' + esc(k) + '</option>'
  ).join('');

  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<select class="ce-input" id="' + id + '" onchange="__ceInput(\'' + escAttr(path) + '\',this.value)">' +
      '<option value="">— none —</option>' + custom + opts +
    '</select>' +
  '</div>';
}

/* ── Arrival ─────────────────────────────────────────────── */

function renderArrival() {
  const arrival = draft.arrival || { en: [], es: [] };
  let h = '';

  for (let i = 0; i < 3; i++) {
    const en = (arrival.en || [])[i] || ['', '', ''];
    const es = (arrival.es || [])[i] || ['', '', ''];

    h += '<div class="ce-repeat-item">' +
      '<div class="ce-repeat-head"><span class="ce-repeat-num">Chapter ' + (i + 1) + '</span></div>' +
      '<div class="ce-bilingual-group">' +
        '<div class="ce-bi-col">' +
          '<div class="ce-bi-lang mono">EN</div>' +
          fieldText('arrival.en.' + i + '.0', 'Eyebrow', en[0] || '') +
          fieldText('arrival.en.' + i + '.1', 'Title', en[1] || '') +
          fieldTextarea('arrival.en.' + i + '.2', 'Text', en[2] || '') +
        '</div>' +
        '<div class="ce-bi-col">' +
          '<div class="ce-bi-lang mono">ES</div>' +
          fieldText('arrival.es.' + i + '.0', 'Eyebrow', es[0] || '') +
          fieldText('arrival.es.' + i + '.1', 'Title', es[1] || '') +
          fieldTextarea('arrival.es.' + i + '.2', 'Text', es[2] || '') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  return h;
}

/* ── Repeater actions ────────────────────────────────────── */

function addRepeaterItem(type) {
  switch (type) {
    case 'sequence':
      if (!draft.sequences) draft.sequences = [];
      if (!draft.sceneSpaces) draft.sceneSpaces = [];
      draft.sequences.push(['', '', { en: '', es: '' }]);
      draft.sceneSpaces.push(['', []]);
      break;
    case 'spatial':
      if (!draft.spatial) draft.spatial = [];
      if (!draft.spatialNodeDetails) draft.spatialNodeDetails = { en: [], es: [] };
      const num = String(draft.spatial.length + 1).padStart(2, '0');
      draft.spatial.push([num, { en: '', es: '' }, '']);
      draft.spatialNodeDetails.en.push('');
      draft.spatialNodeDetails.es.push('');
      break;
    case 'dna':
      if (!draft.dna) draft.dna = { title: { en: '', es: '' }, intro: { en: '', es: '' }, dimensions: [] };
      if (!draft.dna.dimensions) draft.dna.dimensions = [];
      draft.dna.dimensions.push({ label: '', score: '', note: { en: '', es: '' } });
      break;
    case 'fact':
      if (!draft.facts) draft.facts = [];
      draft.facts.push(['', { en: '', es: '' }]);
      break;
    case 'experience':
      if (!draft.experiences) draft.experiences = [];
      const n = String(draft.experiences.length + 1).padStart(2, '0');
      draft.experiences.push([n, { en: '', es: '' }, { en: '', es: '' }]);
      break;
    case 'setting':
      if (!draft.setting) draft.setting = { title: { en: '', es: '' }, intro: { en: '', es: '' }, cards: [] };
      if (!draft.setting.cards) draft.setting.cards = [];
      draft.setting.cards.push({ title: { en: '', es: '' }, line: { en: '', es: '' }, source: '' });
      break;
  }
  draw();
}

function removeRepeaterItem(type, index) {
  switch (type) {
    case 'sequence':
      if (draft.sequences) draft.sequences.splice(index, 1);
      if (draft.sceneSpaces) draft.sceneSpaces.splice(index, 1);
      break;
    case 'spatial':
      if (draft.spatial) draft.spatial.splice(index, 1);
      if (draft.spatialNodeDetails?.en) draft.spatialNodeDetails.en.splice(index, 1);
      if (draft.spatialNodeDetails?.es) draft.spatialNodeDetails.es.splice(index, 1);
      break;
    case 'dna':
      if (draft.dna?.dimensions) draft.dna.dimensions.splice(index, 1);
      break;
    case 'fact':
      if (draft.facts) draft.facts.splice(index, 1);
      break;
    case 'experience':
      if (draft.experiences) draft.experiences.splice(index, 1);
      break;
    case 'setting':
      if (draft.setting?.cards) draft.setting.cards.splice(index, 1);
      break;
  }
  draw();
}

function moveRepeaterItem(type, index, dir) {
  const swap = index + dir;
  switch (type) {
    case 'sequence':
      arrSwap(draft.sequences, index, swap);
      arrSwap(draft.sceneSpaces, index, swap);
      break;
    case 'spatial':
      arrSwap(draft.spatial, index, swap);
      arrSwap(draft.spatialNodeDetails?.en, index, swap);
      arrSwap(draft.spatialNodeDetails?.es, index, swap);
      break;
    case 'dna':
      arrSwap(draft.dna?.dimensions, index, swap);
      break;
    case 'setting':
      arrSwap(draft.setting?.cards, index, swap);
      break;
    case 'fact':
      arrSwap(draft.facts, index, swap);
      break;
    case 'experience':
      arrSwap(draft.experiences, index, swap);
      break;
  }
  draw();
}

function arrSwap(arr, a, b) {
  if (!arr || a < 0 || b < 0 || a >= arr.length || b >= arr.length) return;
  const tmp = arr[a];
  arr[a] = arr[b];
  arr[b] = tmp;
}

/* ── Field renderers ─────────────────────────────────────── */

function fieldReadOnly(label, value) {
  return '<div class="ce-field">' +
    '<label class="ce-label">' + esc(label) + '</label>' +
    '<div class="ce-readonly mono">' + esc(value) + '</div>' +
  '</div>';
}

function fieldText(path, label, value, placeholder) {
  const id = 'ce_' + path.replace(/\./g, '_');
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<input type="text" class="ce-input" id="' + id + '" value="' + esc(value) + '"' +
    (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') +
    ' oninput="__ceInput(\'' + escAttr(path) + '\',this.value)" />' +
  '</div>';
}

function fieldTextarea(path, label, value, placeholder) {
  const id = 'ce_' + path.replace(/\./g, '_');
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<textarea class="ce-textarea" id="' + id + '"' +
    (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') +
    ' oninput="__ceInput(\'' + escAttr(path) + '\',this.value)">' + esc(value) + '</textarea>' +
  '</div>';
}

function fieldNumber(path, label, value) {
  const id = 'ce_' + path.replace(/\./g, '_');
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<input type="number" class="ce-input" id="' + id + '" value="' + esc(String(value)) + '"' +
    ' oninput="__ceInput(\'' + escAttr(path) + '\',Number(this.value))" />' +
  '</div>';
}

function fieldSelect(path, label, value, options) {
  const id = 'ce_' + path.replace(/\./g, '_');
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<select class="ce-input" id="' + id + '" onchange="__ceInput(\'' + escAttr(path) + '\',this.value)">' +
    options.map(o =>
      '<option value="' + esc(o) + '"' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>'
    ).join('') +
    '</select>' +
  '</div>';
}

/* opts.multiline renders a <textarea> instead of a single-line <input> —
   used for the M6.8 fields promoted from fieldTextarea (title, intro,
   conciergeIntro) so they keep the same multi-line editing they had
   before, just doubled for EN/ES. Every existing caller (copy.*)
   passes no 4th argument, so it keeps rendering exactly as before. */
function fieldBilingual(path, label, obj, opts) {
  // Tolerates a legacy plain-string value (pre-migration content, or a
  // property row that was never migrated) by treating it as the EN
  // value — matching the t()/textOf() convention used everywhere else
  // in the M6.8 migration. Without this, a bare string is truthy but
  // has no .en/.es, so both columns would silently render blank and
  // an operator could overwrite the real (invisible) legacy text.
  const isObj = obj && typeof obj === 'object';
  const en = (isObj ? obj.en : obj) || '';
  const es = (isObj ? obj.es : '') || '';
  const multiline = !!(opts && opts.multiline);
  const field = (value, langPath) => multiline
    ? '<textarea class="ce-textarea" oninput="__ceInput(\'' + escAttr(langPath) + '\',this.value)">' + esc(value) + '</textarea>'
    : '<input type="text" class="ce-input" value="' + esc(value) + '"' +
      ' oninput="__ceInput(\'' + escAttr(langPath) + '\',this.value)" />';
  return '<div class="ce-field ce-field-bi">' +
    '<label class="ce-label">' + esc(label) + '</label>' +
    '<div class="ce-bilingual">' +
      '<div class="ce-bi-col">' +
        '<span class="ce-bi-tag mono">EN</span>' +
        field(en, path + '.en') +
      '</div>' +
      '<div class="ce-bi-col">' +
        '<span class="ce-bi-tag mono">ES</span>' +
        field(es, path + '.es') +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ── Path helpers ────────────────────────────────────────── */

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const nextKey = parts[i + 1];
    if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== 'object') {
      cur[k] = isArrayIndex(nextKey) ? [] : {};
    }
    cur = cur[k];
  }
  const last = parts[parts.length - 1];

  if (path.startsWith('sceneSpaces.') && last === '1') {
    cur[last] = value.split(',').map(s => s.trim()).filter(Boolean);
    return;
  }

  cur[last] = value;
}

function isArrayIndex(key) {
  return /^\d+$/.test(key);
}

function escAttr(s) {
  return s.replace(/'/g, "\\'");
}

function copyLabel(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}
