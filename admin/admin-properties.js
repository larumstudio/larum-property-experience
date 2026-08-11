/* ── Larum Admin · Propiedades ─────────────────────────────────
   Property list view. Fetches a lightweight index from Supabase
   (generated columns only — no content/knowledge/assets) and
   renders a card grid. Clicking a property navigates to its
   workspace (#workspace/slug).
   ───────────────────────────────────────────────────────────── */

import { esc, cap } from './admin-core.js';
import { badge, emptyState, toast } from './admin-ui.js';
import { loadIndex, getIndex, getPropertyLabel } from './admin-property-store.js';
import { navigate } from './admin-router.js';

export const title = 'Propiedades';

let containerRef = null;

export async function render(container) {
  containerRef = container;

  container.innerHTML =
    '<div class="page-header">' +
      '<h2>Propiedades</h2>' +
    '</div>' +
    '<div class="property-list-loading">Loading properties...</div>';

  try {
    await loadIndex();
    draw();
  } catch (e) {
    container.innerHTML =
      '<div class="page-header"><h2>Propiedades</h2></div>' +
      emptyState('Could not load properties', e.message);
  }
}

function draw() {
  if (!containerRef) return;
  const rows = getIndex();

  if (!rows.length) {
    containerRef.innerHTML =
      '<div class="page-header"><h2>Propiedades</h2></div>' +
      emptyState('No properties yet', 'Properties will appear here once they are created in Supabase.');
    return;
  }

  containerRef.innerHTML =
    '<div class="page-header">' +
      '<h2>Propiedades</h2>' +
      '<span class="mono">' + rows.length + ' properties</span>' +
    '</div>' +
    '<div class="property-grid">' +
      rows.map(renderCard).join('') +
    '</div>';

  window.__openProperty = (slug) => navigate('workspace', slug);
}

function renderCard(row) {
  const label = getPropertyLabel(row);
  const status = row.status || 'draft';
  const cover = row.cover_image;
  const location = row.location || '';
  const ref = row.reference || '';
  const type = row.property_type ? cap(row.property_type) : '';
  const price = row.price ? formatPrice(row.price, row.currency) : '';

  return (
    '<div class="property-card" onclick="__openProperty(\'' + esc(row.slug) + '\')">' +
      '<div class="property-card-cover">' +
        (cover
          ? '<img src="' + esc(cover) + '" alt="' + esc(label) + '" loading="lazy" />'
          : '<div class="property-card-noimg">◇</div>') +
      '</div>' +
      '<div class="property-card-body">' +
        '<div class="property-card-top">' +
          badge(status) +
          (row.is_default ? ' <span class="badge badge-accent">Default</span>' : '') +
        '</div>' +
        '<div class="property-card-title">' + esc(label) + '</div>' +
        (location ? '<div class="property-card-location">' + esc(location) + '</div>' : '') +
        '<div class="property-card-meta">' +
          (type ? '<span>' + esc(type) + '</span>' : '') +
          (ref ? '<span>' + esc(ref) + '</span>' : '') +
          (price ? '<span>' + esc(price) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function formatPrice(amount, currency) {
  const cur = currency || 'EUR';
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(amount);
  } catch (e) {
    return amount.toLocaleString() + ' ' + cur;
  }
}

export function teardown() {
  delete window.__openProperty;
  containerRef = null;
}
