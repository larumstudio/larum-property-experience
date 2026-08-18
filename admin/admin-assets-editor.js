/* ── Larum Admin · Assets Editor ──────────────────────────────
   Section-based editor for properties.assets JSONB.
   Renders inside the workspace Assets tab. Edits media URLs and
   provenance objects in memory; saveAssets() writes the entire
   column back to Supabase. Never touches content or knowledge.

   URL-only in M5.4: no file uploads, no Supabase Storage.
   Preserves unknown keys via full-object deep clone.
   ───────────────────────────────────────────────────────────── */

import { esc } from './admin-core.js';
import { toast } from './admin-ui.js';
import { saveAssets } from './admin-property-store.js';

let draft = null;
let slug = null;
let referenceSpaces = [];
let containerRef = null;
let openSections = { meta: true };
let saving = false;

const SECTIONS = [
  { id: 'meta',   label: 'Meta' },
  { id: 'hero',   label: 'Hero' },
  { id: 'band',   label: 'Band' },
  { id: 'film',   label: 'Film' },
  { id: 'spaces', label: 'Spaces' }
];

export function render(container, property) {
  containerRef = container;
  slug = property.slug;
  draft = JSON.parse(JSON.stringify(property.assets || {}));
  const scenes = property?.content?.sceneSpaces || [];
  referenceSpaces = Array.from(new Set(
    scenes.flatMap(s => Array.isArray(s?.[1]) ? s[1] : [])
  ));
  openSections = { meta: true };
  draw();
}

export function teardown() {
  containerRef = null;
  draft = null;
  slug = null;
  referenceSpaces = [];
  delete window.__aeToggle;
  delete window.__aeInput;
  delete window.__aeInputBool;
  delete window.__aeUrl;
  delete window.__aeSave;
  delete window.__aeAddSpace;
  delete window.__aeRemoveSpace;
}

function draw() {
  if (!containerRef || !draft) return;

  const authorised = draft.authorised === true;
  let html = '<div class="ce">';

  html += '<div class="ce-toolbar">' +
    '<button class="btn btn-primary" onclick="__aeSave()" id="aeSaveBtn"' +
    (saving ? ' disabled' : '') + '>' +
    (saving ? 'Saving...' : 'Save assets') + '</button>' +
    '<span class="ce-status mono" id="aeStatus"></span>' +
  '</div>';

  if (!authorised) {
    html += '<div class="ae-warn">Stand-in photography — not authorised by the agency. Provenance required.</div>';
  }

  for (const sec of SECTIONS) {
    const open = !!openSections[sec.id];
    html += '<div class="ce-section' + (open ? ' ce-open' : '') + '">' +
      '<button class="ce-section-head" onclick="__aeToggle(\'' + sec.id + '\')">' +
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

  window.__aeToggle = toggleSection;
  window.__aeInput = handleInput;
  window.__aeInputBool = handleInputBool;
  window.__aeUrl = handleUrlInput;
  window.__aeSave = handleSave;
  window.__aeAddSpace = addSpace;
  window.__aeRemoveSpace = removeSpace;
}

function toggleSection(id) {
  openSections[id] = !openSections[id];
  draw();
}

function handleInput(path, value) {
  setPath(draft, path, value);
}

function handleInputBool(path, value) {
  setPath(draft, path, !!value);
  if (path === 'authorised') draw();
}

function handleUrlInput(path, value, previewId) {
  setPath(draft, path, value);
  const pv = previewId ? document.getElementById(previewId) : null;
  if (pv) {
    if (value) {
      pv.style.display = 'block';
      pv.src = value;
    } else {
      pv.style.display = 'none';
      pv.removeAttribute('src');
    }
  }
}

async function handleSave() {
  if (saving || !slug || !draft) return;
  saving = true;
  const btn = document.getElementById('aeSaveBtn');
  const status = document.getElementById('aeStatus');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  if (status) status.textContent = '';

  try {
    await saveAssets(slug, draft);
    toast('Assets saved', 'success');
    if (status) status.textContent = 'Saved';
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
    if (status) status.textContent = 'Error';
  } finally {
    saving = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Save assets'; }
  }
}

/* ── Section renderers ────────────────────────────────────── */

function renderSection(id) {
  switch (id) {
    case 'meta':   return renderMeta();
    case 'hero':   return renderHero();
    case 'band':   return renderBand();
    case 'film':   return renderFilm();
    case 'spaces': return renderSpaces();
    default:       return '';
  }
}

function renderMeta() {
  let h = '';
  h += fieldReadOnly('Property ID', draft.propertyId || '');
  h += fieldText('status', 'Status', draft.status || '', 'prototype-reference');
  h += fieldCheckbox('authorised', 'Authorised by agency', draft.authorised === true);
  h += fieldTextarea('comment', 'Internal note', draft.comment || '');
  return h;
}

function renderHero() {
  const hero = draft.hero || {};
  const prov = hero.provenance || {};
  let h = '';
  h += fieldUrl('hero.fallbackImage', 'Fallback image (required)', hero.fallbackImage || '');
  h += fieldUrl('hero.poster', 'Poster', hero.poster || '');
  h += fieldUrl('hero.video', 'Video', hero.video || '');

  h += '<div class="ce-subsec"><div class="ce-subsec-label mono">Hero provenance</div></div>';
  h += fieldText('hero.provenance.source', 'Source', prov.source || '');
  h += fieldText('hero.provenance.licence', 'Licence', prov.licence || '');
  h += fieldText('hero.provenance.author', 'Author', prov.author || '');
  h += fieldText('hero.provenance.url', 'URL', prov.url || '');
  h += fieldText('hero.provenance.expiry', 'Rights expiry (optional, YYYY-MM-DD)', prov.expiry || '');
  h += fieldTextarea('hero.provenance.delivery', 'Delivery (optional)', prov.delivery || '');
  h += fieldTextarea('hero.provenance.edit', 'Edit note (optional)', prov.edit || '');
  return h;
}

function renderBand() {
  const prov = draft.bandProvenance || {};
  let h = '';
  h += fieldUrl('bandImage', 'Band image (required)', draft.bandImage || '');

  h += '<div class="ce-subsec"><div class="ce-subsec-label mono">Band provenance</div></div>';
  h += fieldText('bandProvenance.source', 'Source', prov.source || '');
  h += fieldText('bandProvenance.licence', 'Licence', prov.licence || '');
  h += fieldText('bandProvenance.author', 'Author', prov.author || '');
  h += fieldText('bandProvenance.url', 'URL', prov.url || '');
  h += fieldText('bandProvenance.expiry', 'Rights expiry (optional, YYYY-MM-DD)', prov.expiry || '');
  h += fieldTextarea('bandProvenance.delivery', 'Delivery (optional)', prov.delivery || '');
  h += fieldTextarea('bandProvenance.edit', 'Edit note (optional)', prov.edit || '');
  return h;
}

function renderFilm() {
  let h = '';
  h += fieldUrlPlain('propertyFilm', 'Property film', draft.propertyFilm || '', 'Direct MP4 URL or YouTube embed URL');
  if (draft.propertyFilm) {
    h += '<div class="ce-field"><a href="' + esc(draft.propertyFilm) + '" target="_blank" rel="noopener" class="mono" style="color:var(--gold);text-decoration:none;font-size:12px">Open film ↗</a></div>';
  }
  return h;
}

function renderSpaces() {
  const spaces = (draft.spaces && typeof draft.spaces === 'object') ? draft.spaces : {};
  const spaceKeys = Object.keys(spaces);
  let h = '';

  h += fieldTextarea('comment_spaces', 'Internal note', draft.comment_spaces || '');

  h += '<div class="ce-subsec"><div class="ce-subsec-label mono">Reference (from content.sceneSpaces)</div></div>';
  if (!referenceSpaces.length) {
    h += '<div class="mono" style="color:var(--muted);font-size:11px">No sceneSpaces defined in content.</div>';
  } else {
    h += '<div class="ae-reference">' +
      referenceSpaces.map(name => {
        const filled = !!spaces[name]?.image;
        return '<span class="ae-chip' + (filled ? ' ae-chip-filled' : '') + '">' + esc(name) + '</span>';
      }).join('') +
    '</div>';
  }

  const available = referenceSpaces.filter(n => !spaces[n]);
  h += '<div class="ce-subsec">' +
    '<div class="ce-subsec-label mono">Per-space media</div>' +
    (available.length
      ? '<select class="ce-input" style="max-width:220px;font-size:11px" onchange="__aeAddSpace(this.value); this.value=\'\'">' +
          '<option value="">+ Add space...</option>' +
          available.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('') +
        '</select>'
      : '') +
  '</div>';

  if (!spaceKeys.length) {
    h += '<div class="mono" style="color:var(--muted);font-size:11px">No per-space media yet. Band image will stand in for every space.</div>';
    return h;
  }

  for (const name of spaceKeys) {
    const entry = (spaces[name] && typeof spaces[name] === 'object') ? spaces[name] : {};
    /* Admin Hardening Pass — provenance used to be a single free-text
       note here, unlike hero/band's structured {source,licence,author,
       url}. Structured the same way now, for the same reason it matters
       for hero/band: rights tracking. A legacy string value (if any
       property already has one) is preserved as `.note` on first edit
       — never silently dropped. */
    const provRaw = entry.provenance;
    const prov = (provRaw && typeof provRaw === 'object')
      ? provRaw
      : { note: (typeof provRaw === 'string' ? provRaw : '') };

    h += '<div class="ce-repeat-item">' +
      '<div class="ce-repeat-head">' +
        '<span class="ce-repeat-num">' + esc(name) + '</span>' +
        '<button class="ce-icon-btn ce-icon-del" onclick="__aeRemoveSpace(\'' + escAttr(name) + '\')" title="Remove">×</button>' +
      '</div>' +
      fieldUrl('spaces.' + name + '.image', 'Image (URL)', entry.image || '') +
      '<div class="ce-subsec"><div class="ce-subsec-label mono">Provenance</div></div>' +
      fieldText('spaces.' + name + '.provenance.source', 'Source', prov.source || '') +
      fieldText('spaces.' + name + '.provenance.licence', 'Licence', prov.licence || '') +
      fieldText('spaces.' + name + '.provenance.author', 'Author', prov.author || '') +
      fieldText('spaces.' + name + '.provenance.url', 'URL', prov.url || '') +
      fieldText('spaces.' + name + '.provenance.expiry', 'Rights expiry (optional, YYYY-MM-DD)', prov.expiry || '') +
      (prov.note ? fieldTextarea('spaces.' + name + '.provenance.note', 'Legacy note', prov.note) : '') +
    '</div>';
  }

  return h;
}

/* ── Space actions ───────────────────────────────────────── */

function addSpace(name) {
  if (!name) return;
  if (!draft.spaces || typeof draft.spaces !== 'object') draft.spaces = {};
  if (draft.spaces[name]) return;
  draft.spaces[name] = { image: '', provenance: '' };
  draw();
}

function removeSpace(name) {
  if (!draft.spaces) return;
  delete draft.spaces[name];
  draw();
}

/* ── Field renderers ─────────────────────────────────────── */

function fieldReadOnly(label, value) {
  return '<div class="ce-field">' +
    '<label class="ce-label">' + esc(label) + '</label>' +
    '<div class="ce-readonly mono">' + esc(value) + '</div>' +
  '</div>';
}

function fieldText(path, label, value, placeholder) {
  const id = fieldId(path);
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<input type="text" class="ce-input" id="' + id + '" value="' + esc(value) + '"' +
    (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') +
    ' oninput="__aeInput(\'' + escAttr(path) + '\',this.value)" />' +
  '</div>';
}

function fieldTextarea(path, label, value) {
  const id = fieldId(path);
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<textarea class="ce-textarea" id="' + id + '"' +
    ' oninput="__aeInput(\'' + escAttr(path) + '\',this.value)">' + esc(value) + '</textarea>' +
  '</div>';
}

function fieldUrl(path, label, value) {
  const id = fieldId(path);
  const previewId = id + '_pv';
  const hasValue = !!value;
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<input type="url" class="ce-input" id="' + id + '" value="' + esc(value) + '"' +
    ' oninput="__aeUrl(\'' + escAttr(path) + '\',this.value,\'' + previewId + '\')" />' +
    '<img class="ae-preview" id="' + previewId + '"' +
    (hasValue ? ' src="' + esc(value) + '"' : '') +
    ' alt=""' +
    (hasValue ? '' : ' style="display:none"') +
    ' onerror="this.style.display=\'none\'" />' +
  '</div>';
}

function fieldUrlPlain(path, label, value, placeholder) {
  const id = fieldId(path);
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<input type="url" class="ce-input" id="' + id + '" value="' + esc(value) + '"' +
    (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') +
    ' oninput="__aeInput(\'' + escAttr(path) + '\',this.value)" />' +
  '</div>';
}

function fieldCheckbox(path, label, checked) {
  const id = fieldId(path);
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '" style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
      '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') +
      ' onchange="__aeInputBool(\'' + escAttr(path) + '\',this.checked)" />' +
      '<span>' + esc(label) + '</span>' +
    '</label>' +
  '</div>';
}

/* ── Helpers ─────────────────────────────────────────────── */

function fieldId(path) {
  return 'ae_' + String(path).replace(/[^a-zA-Z0-9_]/g, '_');
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const nextKey = parts[i + 1];
    const existing = cur[k];
    /* A legacy scalar (e.g. provenance used to be a plain string) must
       not be walked into — assigning a property on a string throws in
       strict mode (all ES modules are strict). Replace it with the
       expected object/array, but keep the old value as `.note` instead
       of silently discarding it. */
    if (existing === undefined || existing === null || typeof existing !== 'object') {
      const legacy = (typeof existing === 'string' && existing) ? existing : null;
      cur[k] = isArrayIndex(nextKey) ? [] : {};
      if (legacy) cur[k].note = legacy;
    }
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function isArrayIndex(key) {
  return /^\d+$/.test(key);
}

function escAttr(s) {
  return String(s).replace(/'/g, "\\'");
}
