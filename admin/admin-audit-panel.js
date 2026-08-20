/* ── Larum Admin · Audit Panel (M5.6) ──────────────────────────
   Workspace Audit tab: Larum Score (computed property readiness)
   plus CRUD for the audits table. Renders inside the property
   workspace when the Audit tab is active.

   Zero writes to visitor runtime / API / RLS / schema.
   ───────────────────────────────────────────────────────────── */

import { esc, fullDate } from './admin-core.js';
import { badge, toast, emptyState } from './admin-ui.js';
import { loadAudits, createAudit, updateAudit, deleteAudit } from './admin-property-store.js';
import { resolveCapabilities } from './admin-auth-context.js';

const STATUSES = ['requested', 'in_progress', 'completed', 'cancelled'];

let containerRef = null;
let clickHandler = null;
let currentSlug = null;
let currentProperty = null;
let caps = null; // resolved once per render() — see admin-auth-context.js

const state = {
  audits: [],
  loading: false,
  error: null,
  expandedId: null,
  editingId: null,
  editDraft: null,
  creating: false,
  createDraft: null,
  saving: false
};

/* ── Module contract ─────────────────────────────────────── */

export async function render(container, property) {
  const sameSlug = currentSlug === property.slug;
  if (containerRef && containerRef !== container) unbind(containerRef);
  containerRef = container;
  currentSlug = property.slug;
  currentProperty = property;
  caps = await resolveCapabilities();

  if (!sameSlug) {
    state.audits = [];
    state.loading = true;
    state.error = null;
    state.expandedId = null;
    state.editingId = null;
    state.editDraft = null;
    state.creating = false;
    state.createDraft = null;
    state.saving = false;
  }

  bind(container);
  draw();
  if (!sameSlug) loadAuditData();
}

export function teardown() {
  if (containerRef) unbind(containerRef);
  containerRef = null;
  currentSlug = null;
  currentProperty = null;
  state.audits = [];
  state.loading = false;
  state.error = null;
  state.expandedId = null;
  state.editingId = null;
  state.editDraft = null;
  state.creating = false;
  state.createDraft = null;
  state.saving = false;
  caps = null;
}

/* ── Event delegation ────────────────────────────────────── */

function bind(container) {
  if (clickHandler) container.removeEventListener('click', clickHandler);
  clickHandler = (e) => {
    const el = e.target.closest('[data-au-action]');
    if (!el || !container.contains(el)) return;
    const action = el.getAttribute('data-au-action');

    if (action === 'toggle') toggleExpand(el.getAttribute('data-au-id'));
    else if (action === 'edit') startEdit(el.getAttribute('data-au-id'));
    else if (action === 'cancel-edit') cancelEdit();
    else if (action === 'save-edit') saveEdit();
    else if (action === 'delete') confirmDelete(el.getAttribute('data-au-id'));
    else if (action === 'new') startCreate();
    else if (action === 'cancel-create') cancelCreate();
    else if (action === 'save-create') saveCreate();
  };
  container.addEventListener('click', clickHandler);
}

function unbind(container) {
  if (clickHandler) container.removeEventListener('click', clickHandler);
  clickHandler = null;
}

/* ── Data loading ────────────────────────────────────────── */

async function loadAuditData() {
  if (!currentProperty || !currentProperty.id) {
    state.loading = false;
    state.error = 'Property has no ID.';
    draw();
    return;
  }

  try {
    const data = await loadAudits(currentProperty.id);
    state.audits = data;
    state.loading = false;
    state.error = null;
  } catch (e) {
    state.loading = false;
    state.error = e.message || 'Failed to load audits.';
  }
  draw();
}

/* ── CRUD actions ────────────────────────────────────────── */

function toggleExpand(id) {
  if (state.expandedId === id) {
    state.expandedId = null;
    state.editingId = null;
    state.editDraft = null;
  } else {
    state.expandedId = id;
    state.editingId = null;
    state.editDraft = null;
  }
  draw();
}

function startEdit(id) {
  if (!caps || !caps['audits.write']) return; // defense in depth — RLS has no agent write policy on audits either
  const audit = state.audits.find(a => a.id === id);
  if (!audit) return;
  state.editingId = id;
  state.editDraft = {
    status: audit.status || 'requested',
    performed_by: audit.performed_by || '',
    document_url: audit.document_url || '',
    summary_en: (audit.summary && audit.summary.en) || '',
    summary_es: (audit.summary && audit.summary.es) || ''
  };
  draw();
}

function cancelEdit() {
  state.editingId = null;
  state.editDraft = null;
  draw();
}

async function saveEdit() {
  if (!state.editingId || !state.editDraft || state.saving) return;
  readEditInputs();
  state.saving = true;
  draw();

  const patch = {
    status: state.editDraft.status,
    performed_by: state.editDraft.performed_by || null,
    document_url: state.editDraft.document_url || null,
    summary: { en: state.editDraft.summary_en, es: state.editDraft.summary_es }
  };

  if (patch.status === 'completed') {
    const existing = state.audits.find(a => a.id === state.editingId);
    if (!existing || !existing.completed_at) patch.completed_at = new Date().toISOString();
  }

  try {
    await updateAudit(state.editingId, patch);
    const audit = state.audits.find(a => a.id === state.editingId);
    if (audit) Object.assign(audit, patch);
    state.editingId = null;
    state.editDraft = null;
    state.saving = false;
    toast('Audit updated', 'success');
  } catch (e) {
    state.saving = false;
    toast('Error: ' + e.message, 'error');
  }
  draw();
}

async function confirmDelete(id) {
  if (!caps || !caps['audits.write']) return;
  if (!confirm('Delete this audit permanently?')) return;
  try {
    await deleteAudit(id);
    state.audits = state.audits.filter(a => a.id !== id);
    if (state.expandedId === id) state.expandedId = null;
    if (state.editingId === id) { state.editingId = null; state.editDraft = null; }
    toast('Audit deleted', 'info');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
  draw();
}

function startCreate() {
  if (!caps || !caps['audits.write']) return;
  state.creating = true;
  state.createDraft = {
    status: 'requested',
    performed_by: '',
    document_url: '',
    summary_en: '',
    summary_es: ''
  };
  draw();
}

function cancelCreate() {
  state.creating = false;
  state.createDraft = null;
  draw();
}

async function saveCreate() {
  if (!state.createDraft || state.saving || !currentProperty) return;
  readCreateInputs();
  state.saving = true;
  draw();

  const row = {
    property_id: currentProperty.id,
    status: state.createDraft.status,
    performed_by: state.createDraft.performed_by || null,
    document_url: state.createDraft.document_url || null,
    summary: { en: state.createDraft.summary_en, es: state.createDraft.summary_es }
  };

  try {
    const created = await createAudit(row);
    state.audits.unshift(created);
    state.creating = false;
    state.createDraft = null;
    state.saving = false;
    toast('Audit created', 'success');
  } catch (e) {
    state.saving = false;
    toast('Error: ' + e.message, 'error');
  }
  draw();
}

function readEditInputs() {
  if (!containerRef || !state.editDraft) return;
  const c = containerRef;
  const s = (sel) => { const el = c.querySelector(sel); return el ? el.value : undefined; };
  const v = s('#auEditStatus');    if (v !== undefined) state.editDraft.status = v;
  const p = s('#auEditPerformed'); if (p !== undefined) state.editDraft.performed_by = p;
  const u = s('#auEditUrl');       if (u !== undefined) state.editDraft.document_url = u;
  const en = s('#auEditSumEn');    if (en !== undefined) state.editDraft.summary_en = en;
  const es = s('#auEditSumEs');    if (es !== undefined) state.editDraft.summary_es = es;
}

function readCreateInputs() {
  if (!containerRef || !state.createDraft) return;
  const c = containerRef;
  const s = (sel) => { const el = c.querySelector(sel); return el ? el.value : undefined; };
  const v = s('#auNewStatus');    if (v !== undefined) state.createDraft.status = v;
  const p = s('#auNewPerformed'); if (p !== undefined) state.createDraft.performed_by = p;
  const u = s('#auNewUrl');       if (u !== undefined) state.createDraft.document_url = u;
  const en = s('#auNewSumEn');    if (en !== undefined) state.createDraft.summary_en = en;
  const es = s('#auNewSumEs');    if (es !== undefined) state.createDraft.summary_es = es;
}

/* ── Larum Score computation ─────────────────────────────── */

function computeScore(property) {
  const c = property.content || {};
  const k = property.knowledge || {};
  const a = property.assets || {};

  const dimensions = [
    scoreContent(c),
    scoreKnowledge(k),
    scoreAssets(a),
    scoreConcierge(c, k),
    scoreExperience(c)
  ];

  const total = dimensions.reduce((s, d) => s + d.score, 0);
  const overall = Math.round(total / dimensions.length);

  return { overall, dimensions };
}

function scoreContent(c) {
  const checks = [];
  const identityFields = ['label', 'brand', 'title', 'subtitle', 'intro', 'shortRef', 'referencePrice', 'defaultRegion', 'defaultPropertyType', 'conciergeIntro'];
  const identityFilled = identityFields.filter(k => filled(c[k])).length;
  checks.push({ weight: 25, value: identityFilled / identityFields.length });

  const copyKeys = ['identityNote', 'bandLabel', 'sequenceTitle', 'sequenceIntro', 'filmLabel', 'spatialTitle', 'spatialIntro', 'spatialDetail', 'detailsTitle', 'detailsIntro'];
  const copyPairs = c.copy ? copyKeys.filter(k => filled(c.copy[k]?.en) && filled(c.copy[k]?.es)).length : 0;
  checks.push({ weight: 20, value: copyPairs / copyKeys.length });

  const seqs = (c.sequences || []).length;
  checks.push({ weight: 15, value: Math.min(1, seqs / 3) });

  const dims = c.dna?.dimensions || [];
  const dimsComplete = dims.filter(d => filled(d?.note?.en) && filled(d?.note?.es)).length;
  checks.push({ weight: 20, value: dims.length ? dimsComplete / dims.length : 0 });

  const facts = (c.facts || []).length;
  checks.push({ weight: 10, value: Math.min(1, facts / 5) });

  const cards = (c.setting?.cards || []).length;
  checks.push({ weight: 10, value: Math.min(1, cards / 3) });

  const score = weighted(checks);
  const missing = [];
  if (identityFilled < identityFields.length) missing.push((identityFields.length - identityFilled) + ' identity fields');
  if (copyPairs < copyKeys.length) missing.push((copyKeys.length - copyPairs) + ' copy pairs');
  if (dims.length && dimsComplete < dims.length) missing.push((dims.length - dimsComplete) + ' DNA notes');

  return { label: 'Content', score, hint: missing.length ? missing.slice(0, 2).join(', ') : 'Complete' };
}

function scoreKnowledge(k) {
  const checks = [];
  const hasFallback = filled(k.fallback?.en) && filled(k.fallback?.es);
  checks.push({ weight: 15, value: hasFallback ? 1 : 0 });

  const prop = k.property || {};
  const facts = prop.facts ? Object.keys(prop.facts).length : 0;
  checks.push({ weight: 20, value: Math.min(1, facts / 10) });

  const spaces = prop.spaces ? Object.keys(prop.spaces).length : 0;
  checks.push({ weight: 20, value: Math.min(1, spaces / 5) });

  const intents = (k.intents || []).length;
  checks.push({ weight: 15, value: Math.min(1, intents / 6) });

  const signals = k.interestSignals ? Object.keys(k.interestSignals).length : 0;
  checks.push({ weight: 15, value: Math.min(1, signals / 3) });

  const quals = (k.qualification || []).length;
  checks.push({ weight: 15, value: Math.min(1, quals / 1) });

  const score = weighted(checks);
  const missing = [];
  if (!hasFallback) missing.push('fallback texts');
  if (facts < 10) missing.push('facts (' + facts + '/10)');
  if (spaces < 5) missing.push('spaces (' + spaces + '/5)');

  return { label: 'Knowledge', score, hint: missing.length ? missing.slice(0, 2).join(', ') : 'Complete' };
}

function scoreAssets(a) {
  const checks = [];
  const hasHero = filled(a.hero?.video) || filled(a.hero?.poster) || filled(a.hero?.fallbackImage);
  checks.push({ weight: 30, value: hasHero ? 1 : 0 });

  checks.push({ weight: 20, value: filled(a.bandImage) ? 1 : 0 });
  checks.push({ weight: 20, value: filled(a.propertyFilm) ? 1 : 0 });

  const spaceEntries = a.spaces || {};
  const spaceCount = Object.keys(spaceEntries).length;
  const spacesWithMedia = Object.values(spaceEntries).filter(s => filled(s?.image) || filled(s?.video)).length;
  checks.push({ weight: 30, value: spaceCount ? spacesWithMedia / spaceCount : 0 });

  const score = weighted(checks);
  const missing = [];
  if (!hasHero) missing.push('hero media');
  if (!filled(a.bandImage)) missing.push('band image');
  if (!filled(a.propertyFilm)) missing.push('film');
  if (spaceCount && spacesWithMedia < spaceCount) missing.push((spaceCount - spacesWithMedia) + ' spaces without media');

  return { label: 'Assets', score, hint: missing.length ? missing.slice(0, 2).join(', ') : 'Complete' };
}

function scoreConcierge(c, k) {
  const checks = [];
  checks.push({ weight: 20, value: filled(c.conciergeIntro) ? 1 : 0 });

  const prop = k.property || {};
  const facts = prop.facts ? Object.keys(prop.facts).length : 0;
  checks.push({ weight: 30, value: Math.min(1, facts / 5) });

  const intents = (k.intents || []).length;
  checks.push({ weight: 25, value: Math.min(1, intents / 3) });

  const signals = k.interestSignals ? Object.keys(k.interestSignals).length : 0;
  checks.push({ weight: 25, value: Math.min(1, signals / 1) });

  const score = weighted(checks);
  const missing = [];
  if (!filled(c.conciergeIntro)) missing.push('concierge intro');
  if (facts < 5) missing.push('knowledge facts (' + facts + '/5)');
  if (intents < 3) missing.push('intents (' + intents + '/3)');

  return { label: 'Concierge', score, hint: missing.length ? missing.slice(0, 2).join(', ') : 'Complete' };
}

function scoreExperience(c) {
  const checks = [];
  const seqs = (c.sequences || []).length;
  const seqsWithScenes = (c.sceneSpaces || []).filter(s => Array.isArray(s?.[1]) && s[1].length).length;
  checks.push({ weight: 25, value: seqs ? seqsWithScenes / seqs : 0 });

  const arrivalEn = (c.arrival?.en || []).filter(ch => Array.isArray(ch) && ch.length >= 3 && ch.every(filled)).length;
  const arrivalEs = (c.arrival?.es || []).filter(ch => Array.isArray(ch) && ch.length >= 3 && ch.every(filled)).length;
  checks.push({ weight: 25, value: Math.min(1, arrivalEn / 3) });
  checks.push({ weight: 25, value: Math.min(1, arrivalEs / 3) });

  const zones = (c.spatial || []).length;
  checks.push({ weight: 25, value: Math.min(1, zones / 3) });

  const score = weighted(checks);
  const missing = [];
  if (seqs && seqsWithScenes < seqs) missing.push((seqs - seqsWithScenes) + ' sequences without scenes');
  if (arrivalEn < 3) missing.push('arrival EN (' + arrivalEn + '/3)');
  if (arrivalEs < 3) missing.push('arrival ES (' + arrivalEs + '/3)');

  return { label: 'Experience', score, hint: missing.length ? missing.slice(0, 2).join(', ') : 'Complete' };
}

function weighted(checks) {
  let totalWeight = 0, totalValue = 0;
  for (const ch of checks) {
    totalWeight += ch.weight;
    totalValue += ch.weight * ch.value;
  }
  return totalWeight ? Math.round((totalValue / totalWeight) * 100) : 0;
}

function filled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/* ── Rendering ───────────────────────────────────────────── */

function draw() {
  if (!containerRef || !currentProperty) return;
  containerRef.innerHTML =
    '<div class="au">' +
      scoreHtml() +
      auditListHtml() +
    '</div>';
}

function scoreHtml() {
  const { overall, dimensions } = computeScore(currentProperty);

  const overallColor = overall >= 80 ? 'var(--gold)' : overall >= 50 ? '#c9a96a' : '#e0846b';

  let html = '<div class="au-score-section">';
  html += '<div class="au-score-header">';
  html += '<div class="au-score-overall">';
  html += '<div class="au-score-number" style="color:' + overallColor + '">' + overall + '</div>';
  html += '<div class="au-score-label">Larum Score</div>';
  html += '</div>';
  html += '<div class="au-score-dims">';

  for (const d of dimensions) {
    const barColor = d.score >= 80 ? 'var(--gold)' : d.score >= 50 ? '#c9a96a' : '#e0846b';
    html += '<div class="au-dim">';
    html += '<div class="au-dim-head">';
    html += '<span class="au-dim-label">' + esc(d.label) + '</span>';
    html += '<span class="au-dim-pct">' + d.score + '%</span>';
    html += '</div>';
    html += '<div class="au-dim-track"><div class="au-dim-fill" style="width:' + d.score + '%;background:' + barColor + '"></div></div>';
    html += '<div class="au-dim-hint">' + esc(d.hint) + '</div>';
    html += '</div>';
  }

  html += '</div></div></div>';
  return html;
}

function auditListHtml() {
  const canWrite = !!(caps && caps['audits.write']);

  let html = '<div class="au-history-section">';
  html += '<div class="au-history-head">';
  html += '<h3>Audit history</h3>';
  if (canWrite) {
    html += '<button class="btn btn-outline" data-au-action="new"' + (state.creating ? ' disabled' : '') + '>+ New audit</button>';
  }
  html += '</div>';

  if (state.creating) html += createFormHtml();

  if (state.loading) {
    html += '<div class="au-status">Loading audits…</div>';
    html += '</div>';
    return html;
  }
  if (state.error) {
    html += '<div class="au-error">' + esc(state.error) + '</div>';
    html += '</div>';
    return html;
  }
  if (!state.audits.length && !state.creating) {
    html += '<div class="au-empty">No audits yet for this property.</div>';
    html += '</div>';
    return html;
  }

  html += '<div class="au-list">' + state.audits.map(auditRowHtml).join('') + '</div>';
  html += '</div>';
  return html;
}

function auditRowHtml(audit) {
  const isOpen = state.expandedId === audit.id;
  const statusLabel = (audit.status || 'requested').replace(/_/g, ' ');

  const head =
    '<button class="au-row-head" type="button" data-au-action="toggle" data-au-id="' + esc(audit.id) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
      '<span class="au-chevron' + (isOpen ? ' au-chevron-open' : '') + '">▸</span>' +
      '<span class="au-row-date">' + esc(formatShortDate(audit.created_at)) + '</span>' +
      auditBadge(audit.status) +
      (audit.performed_by ? '<span class="au-row-by">' + esc(audit.performed_by) + '</span>' : '') +
      summarySnippet(audit.summary) +
    '</button>';

  const body = isOpen ? expandedAuditHtml(audit) : '';

  return '<div class="au-row">' + head + body + '</div>';
}

function expandedAuditHtml(audit) {
  if (state.editingId === audit.id) return editFormHtml(audit);

  let html = '<div class="au-expanded">';
  html += '<dl class="au-detail-kv">';
  html += '<dt>Status</dt><dd>' + auditBadge(audit.status) + '</dd>';
  if (audit.performed_by) html += '<dt>Performed by</dt><dd>' + esc(audit.performed_by) + '</dd>';
  if (audit.completed_at) html += '<dt>Completed</dt><dd>' + esc(fullDate(audit.completed_at)) + '</dd>';
  html += '<dt>Created</dt><dd>' + esc(fullDate(audit.created_at)) + '</dd>';
  if (audit.updated_at) html += '<dt>Updated</dt><dd>' + esc(fullDate(audit.updated_at)) + '</dd>';
  if (audit.document_url) html += '<dt>Document</dt><dd><a href="' + esc(audit.document_url) + '" target="_blank" rel="noopener">' + esc(truncUrl(audit.document_url)) + '</a></dd>';
  html += '</dl>';

  const sum = audit.summary || {};
  if (sum.en || sum.es) {
    html += '<div class="au-summary-block">';
    if (sum.en) html += '<div class="au-summary-lang"><span class="au-lang-tag">EN</span> ' + esc(sum.en) + '</div>';
    if (sum.es) html += '<div class="au-summary-lang"><span class="au-lang-tag">ES</span> ' + esc(sum.es) + '</div>';
    html += '</div>';
  }

  if (caps && caps['audits.write']) {
    html += '<div class="au-actions">';
    html += '<button class="au-btn" data-au-action="edit" data-au-id="' + esc(audit.id) + '">Edit</button>';
    html += '<button class="au-btn au-btn-danger" data-au-action="delete" data-au-id="' + esc(audit.id) + '">Delete</button>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function editFormHtml() {
  const d = state.editDraft;
  if (!d) return '';

  let html = '<div class="au-expanded au-form">';
  html += formRow('Status', '<select id="auEditStatus" class="au-input">' + statusOptions(d.status) + '</select>');
  html += formRow('Performed by', '<input id="auEditPerformed" class="au-input" value="' + esc(d.performed_by) + '" placeholder="Name or team" />');
  html += formRow('Document URL', '<input id="auEditUrl" class="au-input" value="' + esc(d.document_url) + '" placeholder="https://..." />');
  html += formRow('Summary (EN)', '<textarea id="auEditSumEn" class="au-textarea" rows="2" placeholder="English summary">' + esc(d.summary_en) + '</textarea>');
  html += formRow('Summary (ES)', '<textarea id="auEditSumEs" class="au-textarea" rows="2" placeholder="Resumen en español">' + esc(d.summary_es) + '</textarea>');
  html += '<div class="au-actions">';
  html += '<button class="btn btn-gold" data-au-action="save-edit"' + (state.saving ? ' disabled' : '') + '>' + (state.saving ? 'Saving…' : 'Save') + '</button>';
  html += '<button class="au-btn" data-au-action="cancel-edit">Cancel</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

function createFormHtml() {
  const d = state.createDraft;
  if (!d) return '';

  let html = '<div class="au-create-form">';
  html += '<h4>New audit</h4>';
  html += formRow('Status', '<select id="auNewStatus" class="au-input">' + statusOptions(d.status) + '</select>');
  html += formRow('Performed by', '<input id="auNewPerformed" class="au-input" value="' + esc(d.performed_by) + '" placeholder="Name or team" />');
  html += formRow('Document URL', '<input id="auNewUrl" class="au-input" value="' + esc(d.document_url) + '" placeholder="https://..." />');
  html += formRow('Summary (EN)', '<textarea id="auNewSumEn" class="au-textarea" rows="2" placeholder="English summary">' + esc(d.summary_en) + '</textarea>');
  html += formRow('Summary (ES)', '<textarea id="auNewSumEs" class="au-textarea" rows="2" placeholder="Resumen en español">' + esc(d.summary_es) + '</textarea>');
  html += '<div class="au-actions">';
  html += '<button class="btn btn-gold" data-au-action="save-create"' + (state.saving ? ' disabled' : '') + '>' + (state.saving ? 'Saving…' : 'Create') + '</button>';
  html += '<button class="au-btn" data-au-action="cancel-create">Cancel</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

/* ── Helpers ─────────────────────────────────────────────── */

function formRow(label, inputHtml) {
  return '<div class="au-form-row"><label>' + esc(label) + '</label>' + inputHtml + '</div>';
}

function statusOptions(selected) {
  return STATUSES.map(s =>
    '<option value="' + esc(s) + '"' + (s === selected ? ' selected' : '') + '>' +
      esc(s.replace(/_/g, ' ')) +
    '</option>'
  ).join('');
}

function auditBadge(status) {
  const map = {
    requested: 'au-badge-requested',
    in_progress: 'au-badge-progress',
    completed: 'au-badge-completed',
    cancelled: 'au-badge-cancelled'
  };
  const cls = map[status] || 'au-badge-requested';
  const label = esc((status || 'requested').replace(/_/g, ' '));
  return '<span class="au-badge ' + cls + '">' + label + '</span>';
}

function summarySnippet(summary) {
  if (!summary) return '';
  const text = summary.en || summary.es || '';
  if (!text) return '';
  const snip = text.length > 60 ? text.slice(0, 57) + '…' : text;
  return '<span class="au-row-summary">' + esc(snip) + '</span>';
}

function truncUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30 ? u.pathname.slice(0, 27) + '…' : u.pathname;
    return u.hostname + path;
  } catch (e) {
    return url.length > 50 ? url.slice(0, 47) + '…' : url;
  }
}

function formatShortDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}
