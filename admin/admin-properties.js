/* ── Larum Admin · Propiedades ─────────────────────────────────
   Property list view. Fetches a lightweight index from Supabase
   (generated columns only — no content/knowledge/assets) and
   renders a card grid. Clicking a property navigates to its
   workspace (#workspace/slug).

   Admin-M5.X: Added Create Property form.
   ───────────────────────────────────────────────────────────── */

import { esc, cap } from './admin-core.js';
import { badge, emptyState, toast } from './admin-ui.js';
import { loadIndex, getIndex, getPropertyLabel, createProperty, loadAgents } from './admin-property-store.js';
import { navigate } from './admin-router.js';
import { resolveCapabilities } from './admin-auth-context.js';

export const title = 'Propiedades';

let containerRef = null;
let showingCreate = false;
let creating = false;
let agents = [];
let caps = null; // resolved once per render() — see admin-auth-context.js

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PROPERTY_TYPES = ['resale', 'new'];

export async function render(container) {
  containerRef = container;
  showingCreate = false;
  creating = false;
  caps = await resolveCapabilities();

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

  const canCreate = !!(caps && caps['properties.create']);

  let html = '<div class="page-header">' +
    '<h2>Propiedades</h2>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
      '<span class="mono">' + rows.length + ' properties</span>' +
      (canCreate ? '<button class="btn btn-primary" onclick="__propCreateToggle()">+ Create property</button>' : '') +
    '</div>' +
  '</div>';

  if (showingCreate && canCreate) {
    html += renderCreateForm();
  }

  if (!rows.length && !(showingCreate && canCreate)) {
    html += emptyState('No properties yet', canCreate
      ? 'Click "+ Create property" to add your first property.'
      : 'No properties are assigned to you yet.');
  } else if (rows.length) {
    html += '<div class="property-grid">' + rows.map(renderCard).join('') + '</div>';
  }

  containerRef.innerHTML = html;

  window.__openProperty = (slug) => navigate('workspace', slug);
  window.__propCreateToggle = toggleCreate;
  window.__propCreateSubmit = handleCreateSubmit;
  window.__propCreateCancel = cancelCreate;
  window.__propSlugify = slugify;
}

function toggleCreate() {
  if (!caps || !caps['properties.create']) return; // defense in depth — RLS has no agent INSERT policy either
  showingCreate = !showingCreate;
  if (showingCreate && !agents.length) {
    loadAgents().then(a => { agents = a; draw(); }).catch(() => {});
  }
  draw();
}

function cancelCreate() {
  showingCreate = false;
  draw();
}

function renderCreateForm() {
  const agentOpts = agents.map(a =>
    '<option value="' + esc(a.id) + '">' + esc(a.name) + (a.agency ? ' (' + esc(a.agency) + ')' : '') + '</option>'
  ).join('');

  return (
    '<div class="card" style="margin-bottom:16px">' +
      '<div class="card-head"><h3>Create new property</h3></div>' +
      '<div class="ce" style="padding:0">' +
        '<div class="ce-field">' +
          '<label class="ce-label" for="cp_slug">Slug *</label>' +
          '<input type="text" class="ce-input" id="cp_slug" placeholder="nueva-andalucia" ' +
            'oninput="__propSlugify(this)" pattern="[a-z0-9]+(-[a-z0-9]+)*" />' +
          '<div class="mono" style="font-size:10px;color:var(--muted);margin-top:2px">' +
            'Lowercase letters, numbers and hyphens only. Cannot be changed later.</div>' +
        '</div>' +
        '<div class="ce-field">' +
          '<label class="ce-label" for="cp_label">Location label *</label>' +
          '<input type="text" class="ce-input" id="cp_label" placeholder="Nueva Andalucía · Marbella" />' +
        '</div>' +
        '<div class="ce-field">' +
          '<label class="ce-label" for="cp_brand">Brand / Agency</label>' +
          '<input type="text" class="ce-input" id="cp_brand" placeholder="NVOGA" />' +
        '</div>' +
        '<div class="ce-field">' +
          '<label class="ce-label" for="cp_subtitle">Subtitle</label>' +
          '<input type="text" class="ce-input" id="cp_subtitle" placeholder="A residence designed for..." />' +
        '</div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
          '<div class="ce-field" style="flex:1;min-width:140px">' +
            '<label class="ce-label" for="cp_region">Default region</label>' +
            '<input type="text" class="ce-input" id="cp_region" placeholder="Andalucía" />' +
          '</div>' +
          '<div class="ce-field" style="flex:1;min-width:140px">' +
            '<label class="ce-label" for="cp_type">Property type</label>' +
            '<select class="ce-input" id="cp_type">' +
              PROPERTY_TYPES.map(t => '<option value="' + t + '">' + cap(t) + '</option>').join('') +
            '</select>' +
          '</div>' +
          '<div class="ce-field" style="flex:1;min-width:140px">' +
            '<label class="ce-label" for="cp_price">Reference price</label>' +
            '<input type="number" class="ce-input" id="cp_price" placeholder="0" min="0" step="1000" />' +
          '</div>' +
        '</div>' +
        (agents.length
          ? '<div class="ce-field">' +
              '<label class="ce-label" for="cp_agent">Agent</label>' +
              '<select class="ce-input" id="cp_agent">' +
                '<option value="">— None —</option>' +
                agentOpts +
              '</select>' +
            '</div>'
          : '') +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button class="btn btn-primary" id="cp_submit" onclick="__propCreateSubmit()"' +
            (creating ? ' disabled' : '') + '>' +
            (creating ? 'Creating...' : 'Create property') +
          '</button>' +
          '<button class="btn btn-outline" onclick="__propCreateCancel()">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function slugify(input) {
  const raw = input.value;
  input.value = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-');
}

async function handleCreateSubmit() {
  if (creating) return;

  const slug = (document.getElementById('cp_slug')?.value || '').trim();
  const label = (document.getElementById('cp_label')?.value || '').trim();

  if (!slug) { toast('Slug is required', 'error'); return; }
  if (!SLUG_RE.test(slug)) { toast('Invalid slug: lowercase letters, numbers and hyphens only', 'error'); return; }
  if (!label) { toast('Location label is required', 'error'); return; }

  const existing = getIndex();
  if (existing.find(r => r.slug === slug)) { toast('A property with slug "' + slug + '" already exists', 'error'); return; }

  creating = true;
  const btn = document.getElementById('cp_submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

  try {
    const data = await createProperty({
      slug,
      label,
      brand: (document.getElementById('cp_brand')?.value || '').trim(),
      subtitle: (document.getElementById('cp_subtitle')?.value || '').trim(),
      referencePrice: Number(document.getElementById('cp_price')?.value) || 0,
      defaultRegion: (document.getElementById('cp_region')?.value || '').trim(),
      defaultPropertyType: document.getElementById('cp_type')?.value || 'resale',
      agentId: document.getElementById('cp_agent')?.value || null
    });

    toast('Property "' + slug + '" created', 'success');
    showingCreate = false;
    creating = false;
    navigate('workspace', slug);
  } catch (e) {
    creating = false;
    toast('Create failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Create property'; }
  }
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
  delete window.__propCreateToggle;
  delete window.__propCreateSubmit;
  delete window.__propCreateCancel;
  delete window.__propSlugify;
  containerRef = null;
  showingCreate = false;
  creating = false;
  caps = null;
}
