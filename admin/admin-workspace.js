/* ── Larum Admin · Property Workspace ──────────────────────────
   The central multi-tab view for a single property. Lazy-loads
   the full property payload (content, knowledge, assets) on
   entry and caches it for instant switching.
   ───────────────────────────────────────────────────────────── */

import { esc } from './admin-core.js';
import { tabs, emptyState, badge, toast } from './admin-ui.js';
import { loadProperty, getCached, getPropertyLabel } from './admin-property-store.js';

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
}

function switchTab(tabId) {
  activeTab = tabId;
  draw();
}

function renderTab(id) {
  switch (id) {
    case 'overview':
      return renderOverviewPlaceholder();
    case 'audit':
      return emptyState('Audit & Readiness',
        'Strategic evaluation, completeness check, and audit history. Coming in M5.6.');
    case 'content':
      return emptyState('Content',
        'Core and advanced property data, managed through the operational editor. Coming in M5.3.');
    case 'assets':
      return emptyState('Assets',
        'Media management: photos, videos, plans, documents. Coming in M5.4.');
    case 'experience':
      return emptyState('Experience',
        'Preview and configure the visitor-facing property experience. Coming in M5.5.');
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

function renderOverviewPlaceholder() {
  if (!currentProperty) {
    return emptyState('Property Overview', 'Loading...');
  }

  const c = currentProperty.content || {};
  const a = currentProperty.assets || {};
  const k = currentProperty.knowledge || {};
  const status = currentProperty.status || 'draft';

  const facts = [];
  if (c.label) facts.push(['Location', c.label]);
  if (c.referencePrice) facts.push(['Reference price', formatPrice(c.referencePrice)]);
  if (c.defaultPropertyType) facts.push(['Type', c.defaultPropertyType]);
  if (c.sequences) facts.push(['Sequences', String(c.sequences.length)]);
  if (c.spatial) facts.push(['Spatial zones', String(c.spatial.length)]);
  if (k.intents) facts.push(['Concierge intents', String(k.intents.length)]);
  if (k.property?.spaces) facts.push(['Spaces described', String(Object.keys(k.property.spaces).length)]);

  let html = '<div class="overview-grid">';

  html += '<div class="card">' +
    '<div class="card-head"><h3>Property summary</h3></div>' +
    '<dl class="kv">' +
      '<dt>Status</dt><dd>' + badge(status) + '</dd>' +
      '<dt>Slug</dt><dd class="mono">' + esc(currentSlug) + '</dd>' +
      facts.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') +
      '<dt>Source</dt><dd>Database</dd>' +
    '</dl>' +
  '</div>';

  html += '<div class="card">' +
    '<div class="card-head"><h3>Data completeness</h3></div>' +
    '<dl class="kv">' +
      '<dt>Content</dt><dd>' + (Object.keys(c).length ? Object.keys(c).length + ' fields' : 'Empty') + '</dd>' +
      '<dt>Knowledge</dt><dd>' + (Object.keys(k).length ? Object.keys(k).length + ' sections' : 'Empty') + '</dd>' +
      '<dt>Assets</dt><dd>' + (Object.keys(a).length ? Object.keys(a).length + ' entries' : 'Empty') + '</dd>' +
    '</dl>' +
  '</div>';

  html += '</div>';

  html += '<div class="mono" style="margin-top:16px;font-size:9px">Full overview coming in M5.2. ' +
    'Data loaded from Supabase and cached in memory.</div>';

  return html;
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

export function teardown() {
  delete window.__workspaceTab;
  containerRef = null;
}
