/* ── Larum Admin · Property Workspace ──────────────────────────
   The central multi-tab view for a single property. Lazy-loads
   the full property payload (content, knowledge, assets) on
   entry and caches it for instant switching.
   ───────────────────────────────────────────────────────────── */

import { esc } from './admin-core.js';
import { tabs, emptyState, badge, toast } from './admin-ui.js';
import { loadProperty, getCached, getPropertyLabel } from './admin-property-store.js';
import * as contentEditor from './admin-content-editor.js';
import * as assetsEditor from './admin-assets-editor.js';
import * as experiencePreview from './admin-experience-preview.js';

export const title = 'Property';

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'audit',      label: 'Audit' },
  { id: 'content',    label: 'Content' },
  { id: 'assets',     label: 'Assets' },
  { id: 'experience', label: 'Experience' },
  { id: 'concierge',  label: 'Concierge' },
  { id: 'analytics',  label: 'Analytics' },
  { id: 'leads',      label: 'Leads' }
];

let activeTab = 'overview';
let currentSlug = null;
let currentProperty = null;
let containerRef = null;

export async function render(container, params) {
  containerRef = container;
  currentSlug = params || null;
  activeTab = 'overview';
  currentProperty = null;

  if (!currentSlug) {
    container.innerHTML = emptyState('No property selected', 'Navigate to Propiedades and select a property.');
    return;
  }

  const cached = getCached(currentSlug);
  if (cached) {
    currentProperty = cached;
    draw();
    return;
  }

  container.innerHTML =
    '<div class="page-header">' +
      '<h2>' + esc(slugToName(currentSlug)) + '</h2>' +
      '<span class="mono">' + esc(currentSlug) + '</span>' +
    '</div>' +
    '<div class="property-list-loading">Loading property data...</div>';

  try {
    currentProperty = await loadProperty(currentSlug);
    if (!currentProperty) {
      container.innerHTML =
        '<div class="page-header"><h2>' + esc(slugToName(currentSlug)) + '</h2></div>' +
        emptyState('Property not found', 'The property "' + currentSlug + '" does not exist in the database.');
      return;
    }
    draw();
  } catch (e) {
    container.innerHTML =
      '<div class="page-header"><h2>' + esc(slugToName(currentSlug)) + '</h2></div>' +
      emptyState('Could not load property', e.message);
  }
}

function draw() {
  if (!containerRef || !currentProperty) return;

  const label = getPropertyLabel(currentProperty);
  const status = currentProperty.status || 'draft';

  containerRef.innerHTML =
    '<div class="page-header">' +
      '<h2>' + esc(label) + '</h2>' +
      '<span class="mono">' + esc(currentSlug) + '</span>' +
      ' ' + badge(status) +
    '</div>' +
    tabs(TABS, activeTab, 'onclick="__workspaceTab(this.dataset.tab)"') +
    '<div id="workspaceContent" class="workspace-content">' +
      renderTab(activeTab) +
    '</div>';

  window.__workspaceTab = switchTab;

  if (activeTab === 'content' && currentProperty) {
    const mount = document.getElementById('contentEditorMount');
    if (mount) contentEditor.render(mount, currentProperty);
  }

  if (activeTab === 'assets' && currentProperty) {
    const mount = document.getElementById('assetsEditorMount');
    if (mount) assetsEditor.render(mount, currentProperty);
  }

  if (activeTab === 'experience' && currentProperty) {
    const mount = document.getElementById('experiencePreviewMount');
    if (mount) experiencePreview.render(mount, currentProperty);
  }
}

function switchTab(tabId) {
  activeTab = tabId;
  draw();
}

function renderTab(id) {
  switch (id) {
    case 'overview':
      return renderOverview();
    case 'audit':
      return emptyState('Audit & Readiness',
        'Strategic evaluation, completeness check, and audit history. Coming in M5.6.');
    case 'content':
      return '<div id="contentEditorMount"></div>';
    case 'assets':
      return '<div id="assetsEditorMount"></div>';
    case 'experience':
      return '<div id="experiencePreviewMount"></div>';
    case 'concierge':
      return emptyState('Concierge',
        'AI concierge configuration and conversation history. Coming in M5.5.');
    case 'analytics':
      return emptyState('Analytics',
        'Property-specific metrics built from verified data sources. Coming in M5.7.');
    case 'leads':
      return emptyState('Leads',
        'Enquiries and visitor signals specific to this property. Coming in M5.7.');
    default:
      return emptyState('Unknown tab', '');
  }
}

function renderOverview() {
  if (!currentProperty) {
    return emptyState('Property Overview', 'Loading...');
  }

  const p = currentProperty;
  const c = p.content || {};
  const status = p.status || 'draft';
  const label = getPropertyLabel(p);
  const cover = p.cover_image;
  const completeness = computeCompleteness(c);

  let html = '<div class="overview-grid">';

  html += '<div class="card">' +
    '<div class="card-head"><h3>Property summary</h3></div>' +
    '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
      '<div class="property-card-cover" style="width:140px;height:96px;border-radius:var(--radius-sm);flex-shrink:0">' +
        (cover
          ? '<img src="' + esc(cover) + '" alt="' + esc(label) + '" loading="lazy" />'
          : '<div class="property-card-noimg">◇</div>') +
      '</div>' +
      '<dl class="kv" style="flex:1;min-width:220px;margin:0">' +
        '<dt>Label</dt><dd>' + esc(label) + '</dd>' +
        '<dt>Slug</dt><dd class="mono">' + esc(currentSlug) + '</dd>' +
        '<dt>Status</dt><dd>' + badge(status) + '</dd>' +
        (p.reference ? '<dt>Reference</dt><dd class="mono">' + esc(p.reference) + '</dd>' : '') +
        (c.brand ? '<dt>Brand</dt><dd>' + esc(c.brand) + '</dd>' : '') +
        (c.shortRef ? '<dt>Short ref</dt><dd class="mono">' + esc(c.shortRef) + '</dd>' : '') +
        (c.referencePrice ? '<dt>Reference price</dt><dd>' + esc(formatPrice(c.referencePrice)) + '</dd>' : '') +
        (c.defaultRegion ? '<dt>Region</dt><dd>' + esc(c.defaultRegion) + '</dd>' : '') +
        (c.defaultPropertyType ? '<dt>Type</dt><dd>' + esc(c.defaultPropertyType) + '</dd>' : '') +
      '</dl>' +
    '</div>' +
  '</div>';

  html += '<div class="card">' +
    '<div class="card-head"><h3>Data completeness</h3></div>' +
    '<dl class="kv">' +
      completeness.map(row =>
        '<dt>' + esc(row.label) + '</dt>' +
        '<dd>' + esc(row.value) +
          (row.hint ? ' <span class="mono" style="color:var(--muted);font-size:11px"> · ' + esc(row.hint) + '</span>' : '') +
        '</dd>'
      ).join('') +
    '</dl>' +
  '</div>';

  html += '</div>';

  html += '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
    '<button class="btn btn-outline" onclick="__workspaceTab(\'content\')">Edit content →</button>' +
    '<button class="btn btn-outline" onclick="__workspaceTab(\'assets\')">Assets →</button>' +
    '<button class="btn btn-outline" onclick="__workspaceTab(\'concierge\')">Concierge →</button>' +
  '</div>';

  html += '<div class="mono" style="display:flex;gap:20px;flex-wrap:wrap;margin-top:16px;padding-top:12px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)">' +
    (p.created_at   ? '<span>Created ' + esc(formatDate(p.created_at)) + '</span>' : '') +
    (p.updated_at   ? '<span>Updated ' + esc(formatDate(p.updated_at)) + '</span>' : '') +
    (p.published_at ? '<span>Published ' + esc(formatDate(p.published_at)) + '</span>' : '<span>Not published</span>') +
  '</div>';

  return html;
}

function computeCompleteness(c) {
  const rows = [];

  const identityFields = ['label','brand','title','subtitle','intro','shortRef','referencePrice','defaultRegion','defaultPropertyType','conciergeIntro'];
  const identityFilled = identityFields.filter(k => isFilled(c[k])).length;
  rows.push({
    label: 'Identity',
    value: identityFilled + '/' + identityFields.length + ' primitives',
    hint: countCopyPairs(c.copy) + '/10 copy pairs'
  });

  const seqs = (c.sequences || []).length;
  const seqsWithScenes = (c.sceneSpaces || []).filter(s => Array.isArray(s?.[1]) && s[1].length).length;
  rows.push({
    label: 'Narrative',
    value: seqs + ' ' + pluralize(seqs, 'sequence'),
    hint: seqsWithScenes + ' with scene spaces'
  });

  const zones = (c.spatial || []).length;
  const details = c.spatialNodeDetails || { en: [], es: [] };
  const detailsBoth = Array.from({ length: zones }, (_, i) =>
    isFilled((details.en || [])[i]) && isFilled((details.es || [])[i])
  ).filter(Boolean).length;
  rows.push({
    label: 'Spaces',
    value: zones + ' ' + pluralize(zones, 'zone'),
    hint: detailsBoth + ' with EN+ES details'
  });

  const dims = (c.dna?.dimensions || []).length;
  const dimsBoth = (c.dna?.dimensions || []).filter(d =>
    isFilled(d?.note?.en) && isFilled(d?.note?.es)
  ).length;
  rows.push({
    label: 'DNA',
    value: c.dna ? dims + ' ' + pluralize(dims, 'dimension') : 'Missing',
    hint: c.dna ? dimsBoth + ' with EN+ES notes' : ''
  });

  const facts = (c.facts || []).length;
  const exps = (c.experiences || []).length;
  rows.push({
    label: 'Information',
    value: facts + ' ' + pluralize(facts, 'fact'),
    hint: exps + ' ' + pluralize(exps, 'experience')
  });

  const cards = (c.setting?.cards || []).length;
  rows.push({
    label: 'Surroundings',
    value: c.setting ? cards + ' ' + pluralize(cards, 'card') : 'Missing',
    hint: isFilled(c.setting?.title) ? 'Setting titled' : 'No setting title'
  });

  const arrivalEn = (c.arrival?.en || []).filter(ch =>
    Array.isArray(ch) && ch.length >= 3 && ch.every(isFilled)
  ).length;
  const arrivalEs = (c.arrival?.es || []).filter(ch =>
    Array.isArray(ch) && ch.length >= 3 && ch.every(isFilled)
  ).length;
  rows.push({
    label: 'Arrival',
    value: arrivalEn + '/3 EN chapters',
    hint: arrivalEs + '/3 ES chapters'
  });

  return rows;
}

function isFilled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

function countCopyPairs(copy) {
  if (!copy) return 0;
  const keys = ['identityNote','bandLabel','sequenceTitle','sequenceIntro','filmLabel','spatialTitle','spatialIntro','spatialDetail','detailsTitle','detailsIntro'];
  return keys.filter(k => isFilled(copy[k]?.en) && isFilled(copy[k]?.es)).length;
}

function pluralize(n, word) {
  return n === 1 ? word : word + 's';
}

function slugToName(slug) {
  return (slug || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatPrice(amount) {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
  } catch (e) {
    return String(amount);
  }
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(iso));
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}

export function teardown() {
  contentEditor.teardown();
  assetsEditor.teardown();
  experiencePreview.teardown();
  delete window.__workspaceTab;
  containerRef = null;
}
