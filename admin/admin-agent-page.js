/* ── Larum Admin · Agent Page Configuration ────────────────────
   Renders inside the agent detail view (subtab "Página").
   Lets the admin select a preset, toggle/reorder modules,
   choose variants, and preview the public agent page.

   mount(container, agent) → renders the UI
   unmount()               → cleans up globals
   ───────────────────────────────────────────────────────────── */

import { esc, cap } from './admin-core.js';
import { toast, statCard, card } from './admin-ui.js';
import { loadAgentPageConfig, saveAgentPageConfig, loadAgentAnalytics, loadAgentWeeklyReport } from './admin-property-store.js';

const PRESETS = ['signature', 'essential'];

const MODULE_DEFS = [
  { type: 'hero',         label: 'Hero',                    required: true,  variants: ['portrait-split', 'quiet-monogram'] },
  { type: 'story',        label: 'Enfoque',                 required: false, variants: ['editorial-split', 'compact'] },
  { type: 'properties',   label: 'Propiedades',             required: true,  variants: ['asymmetric-grid', 'single-feature'] },
  { type: 'stats',        label: 'Cifras de trayectoria',   required: false, variants: ['inline'] },
  { type: 'testimonials', label: 'Testimonios',             required: false, variants: ['grid'] },
  { type: 'credentials',  label: 'Credenciales',            required: false, variants: ['list'] },
  { type: 'areas',        label: 'Zonas de servicio',       required: false, variants: ['list'] },
  { type: 'process',      label: 'Proceso / metodología',   required: false, variants: ['steps'] },
  { type: 'faq',          label: 'FAQ',                     required: false, variants: ['list'] },
  { type: 'contact',      label: 'Contacto',                required: false, variants: ['editorial-split', 'compact'] },
  { type: 'footer',       label: 'Footer',                  required: true,  variants: ['minimal'] }
];

let containerRef = null;
let currentAgent = null;
let config = null;
let modules = [];
let preset = 'essential';
let saving = false;
let loading = true;
let analytics = null;
let report = null;

export async function mount(container, agent) {
  containerRef = container;
  currentAgent = agent;
  loading = true;
  saving = false;
  draw();

  try {
    config = await loadAgentPageConfig(agent.id);
    if (config) {
      preset = config.preset || 'essential';
      modules = Array.isArray(config.modules) ? JSON.parse(JSON.stringify(config.modules)) : [];
    } else {
      preset = 'essential';
      modules = [];
    }
    ensureAllModules();
  } catch (e) {
    toast('Could not load page config: ' + e.message, 'error');
    preset = 'essential';
    modules = [];
    ensureAllModules();
  }

  loading = false;
  draw();

  if (agent.slug) {
    loadAgentAnalytics(agent.slug).then(a => { analytics = a; draw(); }).catch(() => {});
    loadAgentWeeklyReport(agent.slug).then(r => { report = r; draw(); }).catch(() => {});
  }
}

export function unmount() {
  containerRef = null;
  currentAgent = null;
  config = null;
  modules = [];
  preset = 'essential';
  saving = false;
  loading = true;
  analytics = null;
  report = null;
  delete window.__apPreset;
  delete window.__apToggle;
  delete window.__apVariant;
  delete window.__apMove;
  delete window.__apSave;
  delete window.__apExport;
}

function ensureAllModules() {
  const existing = new Set(modules.map(m => m.type));
  for (const def of MODULE_DEFS) {
    if (!existing.has(def.type)) {
      /* A module type introduced after this agent's config was saved
         (e.g. testimonials/stats/credentials, added post-launch) has no
         opinion recorded yet — default it the same way its own preset
         would if set fresh today, not to "off" regardless of preset. */
      modules.push({
        type: def.type,
        enabled: def.required || preset === 'signature',
        variant: def.variants[0],
        order: modules.length
      });
    }
  }
  reindex();
}

function reindex() {
  modules.forEach((m, i) => { m.order = i; });
}

function draw() {
  if (!containerRef) return;

  if (loading) {
    containerRef.innerHTML = '<div class="property-list-loading">Loading page configuration...</div>';
    return;
  }

  const a = currentAgent;
  let html = '';

  html += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">' +
    '<a class="btn btn-outline" href="/agent.html?agent=' + esc(a.slug || '') + '&lang=es" target="_blank" ' +
      'onclick="event.stopPropagation()" style="font-size:12px">' +
      '↗ Preview page' +
    '</a>' +
    (!a.slug ? '<span class="mono" style="font-size:11px;color:var(--muted)">Set a slug first to preview</span>' : '') +
  '</div>';

  html += '<div class="card">' +
    '<div class="card-head"><h3>Preset</h3></div>' +
    '<div style="display:flex;gap:8px;padding:0 0 12px">' +
      PRESETS.map(p =>
        '<button class="btn ' + (p === preset ? 'btn-primary' : 'btn-outline') + '" ' +
          'onclick="__apPreset(\'' + p + '\')" style="font-size:12px">' +
          cap(p) +
        '</button>'
      ).join('') +
    '</div>' +
    '<div class="mono" style="font-size:11px;color:var(--muted)">' +
      (preset === 'signature'
        ? 'Signature: all modules active, full editorial presentation.'
        : 'Essential: only required modules, minimal and clean.') +
    '</div>' +
  '</div>';

  html += '<div class="card" style="margin-top:16px">' +
    '<div class="card-head"><h3>Modules</h3></div>' +
    '<div class="table-wrap"><table><thead><tr>' +
      '<th>Module</th><th>Enabled</th><th>Variant</th><th>Order</th>' +
    '</tr></thead><tbody>';

  const sorted = [...modules].sort((a, b) => a.order - b.order);
  sorted.forEach((m, i) => {
    const def = MODULE_DEFS.find(d => d.type === m.type);
    if (!def) return;

    html += '<tr>' +
      '<td>' + esc(def.label) +
        (def.required ? ' <span class="badge badge-muted" style="font-size:9px">required</span>' : '') +
      '</td>' +
      '<td>' +
        (def.required
          ? '<span class="mono" style="font-size:11px;color:var(--muted)">always</span>'
          : '<button class="btn btn-outline" style="font-size:11px;padding:2px 8px" ' +
            'onclick="__apToggle(\'' + m.type + '\')">' +
            (m.enabled ? '✓ On' : '○ Off') +
          '</button>') +
      '</td>' +
      '<td>' +
        (def.variants.length > 1
          ? '<select class="ce-input" style="font-size:11px;padding:2px 6px;width:auto" ' +
            'onchange="__apVariant(\'' + m.type + '\',this.value)">' +
            def.variants.map(v =>
              '<option value="' + v + '"' + (v === m.variant ? ' selected' : '') + '>' +
                esc(v) +
              '</option>'
            ).join('') +
          '</select>'
          : '<span class="mono" style="font-size:11px">' + esc(m.variant) + '</span>') +
      '</td>' +
      '<td style="white-space:nowrap">' +
        (i > 0
          ? '<button class="btn btn-outline" style="font-size:11px;padding:1px 6px" onclick="__apMove(\'' + m.type + '\',-1)">↑</button> '
          : '') +
        (i < sorted.length - 1
          ? '<button class="btn btn-outline" style="font-size:11px;padding:1px 6px" onclick="__apMove(\'' + m.type + '\',1)">↓</button>'
          : '') +
      '</td>' +
    '</tr>';
  });

  html += '</tbody></table></div></div>';

  html += '<div style="margin-top:16px">' +
    '<button class="btn btn-primary" onclick="__apSave()"' +
      (saving ? ' disabled' : '') + '>' +
      (saving ? 'Saving...' : 'Save page configuration') +
    '</button>' +
  '</div>';

  if (analytics) {
    html += '<div style="margin-top:24px">' +
      card('Page Analytics', '<div class="stat-row">' +
        statCard('Total visits', analytics.totalVisits) +
        statCard('Last 7 days', analytics.visits7d) +
        statCard('Last 30 days', analytics.visits30d) +
        statCard('Property clicks', analytics.propertyClicks) +
        statCard('Contact clicks', analytics.contactClicks) +
      '</div>') +
    '</div>';
  }

  if (report && report.weeks.length) {
    html += '<div style="margin-top:24px">' +
      card('Weekly Report', renderWeeklyReport(), {
        headerRight: '<button class="btn btn-outline" style="font-size:11px;padding:2px 10px" onclick="__apExport()">Export CSV</button>'
      }) +
    '</div>';
  }

  containerRef.innerHTML = html;
  bindGlobals();
}

function setPreset(p) {
  preset = p;
  const defs = new Map(MODULE_DEFS.map(d => [d.type, d]));
  modules.forEach(m => {
    const def = defs.get(m.type);
    if (p === 'signature') {
      m.enabled = true;
    } else {
      m.enabled = def ? def.required : false;
    }
  });
  draw();
}

function toggleModule(type) {
  const m = modules.find(x => x.type === type);
  if (!m) return;
  const def = MODULE_DEFS.find(d => d.type === type);
  if (def && def.required) return;
  m.enabled = !m.enabled;
  draw();
}

function setVariant(type, variant) {
  const m = modules.find(x => x.type === type);
  if (m) m.variant = variant;
}

function moveModule(type, direction) {
  const sorted = [...modules].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(m => m.type === type);
  if (idx < 0) return;
  const target = idx + direction;
  if (target < 0 || target >= sorted.length) return;

  const temp = sorted[idx].order;
  sorted[idx].order = sorted[target].order;
  sorted[target].order = temp;
  modules.sort((a, b) => a.order - b.order);
  reindex();
  draw();
}

async function save() {
  if (saving || !currentAgent) return;
  saving = true;
  draw();

  try {
    const cleanModules = modules.map(m => ({
      type: m.type,
      enabled: m.enabled,
      variant: m.variant,
      order: m.order
    }));

    config = await saveAgentPageConfig(currentAgent.id, {
      preset,
      modules: cleanModules
    });

    toast('Page configuration saved', 'success');
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  } finally {
    saving = false;
    draw();
  }
}

function renderWeeklyReport() {
  if (!report || !report.weeks.length) return '';

  let html = '<div class="table-wrap"><table><thead><tr>' +
    '<th>Week</th><th>Visits</th><th>Property clicks</th><th>Contact clicks</th><th>Section views</th>' +
  '</tr></thead><tbody>';

  report.weeks.forEach(w => {
    html += '<tr>' +
      '<td class="mono" style="font-size:11px">' + esc(w.start) + ' — ' + esc(w.end) + '</td>' +
      '<td>' + w.visits + '</td>' +
      '<td>' + w.propertyClicks + '</td>' +
      '<td>' + w.contactClicks + '</td>' +
      '<td>' + w.sectionViews + '</td>' +
    '</tr>';
  });

  html += '</tbody></table></div>';

  if (report.daily.length) {
    html += '<div style="margin-top:16px">' +
      '<div class="mono" style="font-size:11px;color:var(--muted);margin-bottom:8px">Daily breakdown</div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Date</th><th>Visits</th><th>Prop. clicks</th><th>Contact</th><th>Sections</th>' +
      '</tr></thead><tbody>';

    report.daily.forEach(d => {
      html += '<tr>' +
        '<td class="mono" style="font-size:11px">' + esc(d.date) + '</td>' +
        '<td>' + d.page_view + '</td>' +
        '<td>' + d.property_click + '</td>' +
        '<td>' + d.contact_click + '</td>' +
        '<td>' + d.section_view + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div></div>';
  }

  return html;
}

function exportCsv() {
  if (!report || !report.daily.length) { toast('No data to export', 'error'); return; }

  const slug = currentAgent ? currentAgent.slug || 'agent' : 'agent';
  const cols = ['date', 'page_view', 'property_click', 'contact_click', 'section_view'];
  const header = ['Date', 'Visits', 'Property clicks', 'Contact clicks', 'Section views'];

  const csv = [header.join(',')].concat(
    report.daily.map(d => cols.map(c => '"' + String(d[c] == null ? '' : d[c]).replace(/"/g, '""') + '"').join(','))
  ).join('\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'larum-agent-' + slug + '-weekly-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported', 'success');
}

function bindGlobals() {
  window.__apPreset = setPreset;
  window.__apToggle = toggleModule;
  window.__apVariant = setVariant;
  window.__apMove = moveModule;
  window.__apSave = save;
  window.__apExport = exportCsv;
}
