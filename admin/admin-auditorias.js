/* ── Larum Admin · Auditorías (M5.6) ──────────────────────────
   Top-level sidebar view: all audits across properties with
   stats, status filter, and click-through to workspace.

   Zero writes to visitor runtime / API / RLS / schema.
   ───────────────────────────────────────────────────────────── */

import { esc, fullDate } from './admin-core.js';
import { statCard, emptyState, toast } from './admin-ui.js';
import { loadAllAudits, getPropertyLabel } from './admin-property-store.js';
import { navigate } from './admin-router.js';

export const title = 'Auditorías';

let containerRef = null;
let clickHandler = null;

const state = {
  audits: [],
  loading: true,
  error: null,
  filter: 'all'
};

/* ── Module contract ─────────────────────────────────────── */

export async function render(container) {
  if (containerRef && containerRef !== container) unbind(containerRef);
  containerRef = container;
  state.loading = true;
  state.error = null;

  bind(container);
  draw();
  await loadData();
}

export function teardown() {
  if (containerRef) unbind(containerRef);
  containerRef = null;
  state.audits = [];
  state.loading = true;
  state.error = null;
  state.filter = 'all';
}

/* ── Event delegation ────────────────────────────────────── */

function bind(container) {
  if (clickHandler) container.removeEventListener('click', clickHandler);
  clickHandler = (e) => {
    const el = e.target.closest('[data-aud-action]');
    if (!el || !container.contains(el)) return;
    const action = el.getAttribute('data-aud-action');

    if (action === 'filter') {
      const next = el.getAttribute('data-aud-filter');
      if (next !== state.filter) { state.filter = next; draw(); }
    } else if (action === 'goto') {
      const slug = el.getAttribute('data-aud-slug');
      if (slug) navigate('workspace', slug);
    }
  };
  container.addEventListener('click', clickHandler);
}

function unbind(container) {
  if (clickHandler) container.removeEventListener('click', clickHandler);
  clickHandler = null;
}

/* ── Data loading ────────────────────────────────────────── */

async function loadData() {
  try {
    state.audits = await loadAllAudits();
    state.loading = false;
    state.error = null;
  } catch (e) {
    state.loading = false;
    state.error = e.message || 'Failed to load audits.';
  }
  draw();
}

/* ── Rendering ───────────────────────────────────────────── */

function draw() {
  if (!containerRef) return;

  if (state.loading) {
    containerRef.innerHTML =
      '<div class="page-header"><h2>Auditorías</h2></div>' +
      '<div class="property-list-loading">Loading audits…</div>';
    return;
  }

  if (state.error) {
    containerRef.innerHTML =
      '<div class="page-header"><h2>Auditorías</h2></div>' +
      emptyState('Could not load audits', state.error);
    return;
  }

  containerRef.innerHTML =
    '<div class="page-header"><h2>Auditorías</h2></div>' +
    statsHtml() +
    filterBarHtml() +
    listHtml();
}

function statsHtml() {
  const all = state.audits;
  const counts = { requested: 0, in_progress: 0, completed: 0, cancelled: 0 };
  for (const a of all) counts[a.status] = (counts[a.status] || 0) + 1;

  return (
    '<div class="stats-row">' +
      statCard('Total', all.length, '') +
      statCard('Requested', counts.requested, '') +
      statCard('In progress', counts.in_progress, '') +
      statCard('Completed', counts.completed, '') +
      statCard('Cancelled', counts.cancelled, '') +
    '</div>'
  );
}

function filterBarHtml() {
  const filters = ['all', 'requested', 'in_progress', 'completed', 'cancelled'];
  return (
    '<div class="aud-filter-bar">' +
      filters.map(f => {
        const label = f === 'all' ? 'All' : f.replace(/_/g, ' ');
        const active = state.filter === f ? ' aud-filter-active' : '';
        return '<button class="aud-filter' + active + '" data-aud-action="filter" data-aud-filter="' + esc(f) + '">' + esc(label) + '</button>';
      }).join('') +
    '</div>'
  );
}

function listHtml() {
  const filtered = state.filter === 'all'
    ? state.audits
    : state.audits.filter(a => a.status === state.filter);

  if (!filtered.length) {
    return '<div class="aud-empty">' + (state.audits.length
      ? 'No audits match the selected filter.'
      : 'No audits have been created yet.') + '</div>';
  }

  let html = '<div class="aud-table"><div class="aud-table-head">' +
    '<span class="aud-col-prop">Property</span>' +
    '<span class="aud-col-date">Date</span>' +
    '<span class="aud-col-status">Status</span>' +
    '<span class="aud-col-by">Performed by</span>' +
    '<span class="aud-col-summary">Summary</span>' +
  '</div>';

  for (const audit of filtered) {
    const prop = audit.properties;
    const propLabel = prop ? (prop.name_es || prop.name_en || prop.slug) : '—';
    const slug = prop ? prop.slug : '';
    const statusLabel = (audit.status || 'requested').replace(/_/g, ' ');

    const sum = audit.summary || {};
    const snippet = (sum.en || sum.es || '').slice(0, 60);

    html += '<button class="aud-table-row" data-aud-action="goto" data-aud-slug="' + esc(slug) + '">' +
      '<span class="aud-col-prop">' + esc(propLabel) + '</span>' +
      '<span class="aud-col-date">' + esc(formatShortDate(audit.created_at)) + '</span>' +
      '<span class="aud-col-status">' + auditBadge(audit.status) + '</span>' +
      '<span class="aud-col-by">' + esc(audit.performed_by || '—') + '</span>' +
      '<span class="aud-col-summary">' + esc(snippet || '—') + '</span>' +
    '</button>';
  }

  html += '</div>';
  return html;
}

/* ── Helpers ─────────────────────────────────────────────── */

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

function formatShortDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}
