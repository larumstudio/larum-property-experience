/* ── Larum Admin · Readiness Panel (LPE-07) ─────────────────────
   Workspace Readiness tab. Read-only report: calls
   LarumReadiness.readiness(slug, parts) and renders the result.
   No DB interaction. No writes. No publish. No save.
   ───────────────────────────────────────────────────────────── */

import { esc } from './admin-core.js';
import { emptyState } from './admin-ui.js';

let containerRef  = null;
let clickHandler  = null;
let currentSlug   = null;
let currentReport = null;
let expandedModules = new Set();

/* ── Module contract ─────────────────────────────────────── */

export function render(container, property) {
  if (containerRef && containerRef !== container) unbind(containerRef);
  containerRef = container;
  currentSlug = property.slug;
  expandedModules = new Set();

  if (!window.LarumReadiness) {
    container.innerHTML = emptyState('Readiness unavailable', 'LarumReadiness global not found — check script loading order in admin.html.');
    return;
  }

  const parts = {
    content:  property.content  || null,
    knowledge: property.knowledge || null,
    assets:   property.assets   || null
  };

  try {
    currentReport = window.LarumReadiness.readiness(currentSlug, parts);
  } catch (e) {
    container.innerHTML = emptyState('Readiness error', esc(e.message));
    return;
  }

  bind(container);
  draw();
}

export function teardown() {
  if (containerRef) unbind(containerRef);
  containerRef     = null;
  currentSlug      = null;
  currentReport    = null;
  expandedModules  = new Set();
}

/* ── Event delegation ──────────────────────────────────── */

function bind(el) {
  clickHandler = e => onClick(e);
  el.addEventListener('click', clickHandler);
}

function unbind(el) {
  if (clickHandler) el.removeEventListener('click', clickHandler);
  clickHandler = null;
}

function onClick(e) {
  const toggle = e.target.closest('[data-toggle-mod]');
  if (!toggle) return;
  const id = toggle.dataset.toggleMod;
  if (expandedModules.has(id)) expandedModules.delete(id);
  else expandedModules.add(id);
  draw();
}

/* ── Draw ────────────────────────────────────────────────── */

function draw() {
  if (!containerRef || !currentReport) return;
  const r = currentReport;
  containerRef.innerHTML =
    renderHeader(r) +
    renderIssueGroups(r) +
    renderModules(r) +
    renderSlots(r);
}

/* ── Header ──────────────────────────────────────────────── */

function renderHeader(r) {
  const ready = r.blockers.length === 0;
  const statusText  = ready ? 'READY' : 'NOT READY';
  const statusColor = ready ? 'var(--green)' : 'var(--red)';
  const statusBg    = ready ? 'var(--green-dim)' : 'var(--red-dim)';
  const bc = r.blockers.length;
  const wc = r.warnings.length;
  const ic = r.infos.length;
  const uc = r.unclassified.length;

  const counts =
    bc + ' blocker' + (bc !== 1 ? 's' : '') + ' · ' +
    wc + ' warning' + (wc !== 1 ? 's' : '') + ' · ' +
    ic + ' info' + (ic !== 1 ? 's' : '') +
    (uc ? ' · ' + uc + ' unclassified' : '');

  return (
    '<div class="card" style="margin-bottom:16px">' +
      '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        '<span style="' +
          'font-family:var(--font-mono);font-size:10px;font-weight:600;letter-spacing:.1em;' +
          'color:' + statusColor + ';background:' + statusBg + ';' +
          'padding:4px 12px;border-radius:var(--radius-badge)">' +
          statusText +
        '</span>' +
        '<span style="color:var(--text);font-size:13px">' + counts + '</span>' +
        '<span style="color:var(--muted);font-size:12px;margin-left:auto">family: ' + esc(r.family) + '</span>' +
      '</div>' +
    '</div>'
  );
}

/* ── Issue groups ─────────────────────────────────────────── */

function renderIssueGroups(r) {
  let html = '';
  if (r.blockers.length)     html += renderGroup('Blockers',     r.blockers,     'var(--red)',    'var(--red-dim)');
  if (r.warnings.length)     html += renderGroup('Warnings',     r.warnings,     'var(--orange)', 'var(--orange-dim)');
  if (r.infos.length)        html += renderGroup('Infos',        r.infos,        'var(--text)',   'var(--surface-2)');
  if (r.unclassified.length) html += renderGroup('Unclassified', r.unclassified, 'var(--muted)',  'var(--surface-2)');
  return html;
}

function renderGroup(title, items, color, bgColor) {
  return (
    '<div class="card" style="margin-bottom:12px">' +
      '<div class="card-head">' +
        '<h3 style="color:' + color + '">' + title + ' (' + items.length + ')</h3>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column">' +
        items.map(item =>
          '<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--line-soft)">' +
            '<span class="mono" style="flex-shrink:0;min-width:68px;color:var(--muted)">' + esc(item.source) + '</span>' +
            '<span style="color:var(--ink);font-size:13px;word-break:break-word">' + esc(item.origin) + '</span>' +
            (item.moduleId
              ? '<span class="mono" style="flex-shrink:0;margin-left:auto;color:var(--accent)">' + esc(item.moduleId) + '</span>'
              : '') +
          '</div>'
        ).join('') +
      '</div>' +
    '</div>'
  );
}

/* ── Module axis (14 rows) ───────────────────────────────── */

function renderModules(r) {
  let rows = '';
  for (const mod of r.modules) {
    const bc = mod.blockers.length;
    const wc = mod.warnings.length;
    const ic = mod.infos.length;
    const total = bc + wc + ic;
    const expanded = expandedModules.has(mod.id);

    let badgeColor = 'var(--green)';
    let badgeBg    = 'var(--green-dim)';
    let badgeLabel = 'ok';
    if (bc > 0) {
      badgeColor = 'var(--red)'; badgeBg = 'var(--red-dim)';
      badgeLabel = bc + ' blocker' + (bc !== 1 ? 's' : '');
    } else if (wc > 0) {
      badgeColor = 'var(--orange)'; badgeBg = 'var(--orange-dim)';
      badgeLabel = wc + ' warning' + (wc !== 1 ? 's' : '');
    } else if (ic > 0) {
      badgeColor = 'var(--text)'; badgeBg = 'var(--surface-2)';
      badgeLabel = ic + ' info' + (ic !== 1 ? 's' : '');
    }

    const allItems = mod.blockers.concat(mod.warnings).concat(mod.infos);

    rows += (
      '<div style="border-bottom:1px solid var(--line-soft)">' +
        '<div data-toggle-mod="' + esc(mod.id) + '" style="' +
          'display:flex;align-items:center;gap:10px;padding:9px 0;' +
          (total ? 'cursor:pointer' : '') + '">' +
          '<span style="flex:1;font-size:13px;color:var(--ink)">' + esc(mod.id) + '</span>' +
          '<span style="' +
            'font-family:var(--font-mono);font-size:10px;letter-spacing:.05em;' +
            'color:' + badgeColor + ';background:' + badgeBg + ';' +
            'padding:2px 8px;border-radius:var(--radius-badge)">' +
            badgeLabel +
          '</span>' +
          (total ? '<span style="color:var(--muted);font-size:11px;width:10px">' + (expanded ? '▾' : '▸') + '</span>' : '<span style="width:10px"></span>') +
        '</div>' +
        (expanded && allItems.length
          ? '<div style="padding:4px 0 8px 16px;display:flex;flex-direction:column;gap:5px">' +
              allItems.map(item =>
                '<div style="display:flex;gap:8px;font-size:12px">' +
                  '<span class="mono" style="flex-shrink:0;min-width:60px;color:var(--muted)">' + esc(item.source) + '</span>' +
                  '<span style="color:' +
                    (item.severity === 'blocker' ? 'var(--red)' :
                     item.severity === 'warning' ? 'var(--orange)' :
                     'var(--text)') + ';word-break:break-word">' +
                    esc(item.origin) +
                  '</span>' +
                '</div>'
              ).join('') +
            '</div>'
          : '') +
      '</div>'
    );
  }

  return (
    '<div class="card" style="margin-bottom:12px">' +
      '<div class="card-head"><h3>Module Axis</h3></div>' +
      '<div>' + rows + '</div>' +
    '</div>'
  );
}

/* ── Slot table ───────────────────────────────────────────── */

function renderSlots(r) {
  if (!r.slots.length) return '';

  const rows = r.slots.map(slot => {
    const stateColor = slot.state === 'approved'    ? 'var(--green)'
                     : slot.state === 'placeholder' ? 'var(--orange)'
                     :                                'var(--muted)';
    const rightsColor = slot.rights.clear ? 'var(--green)' : 'var(--red)';
    const issueCount  = slot.blockers.length + slot.warnings.length + slot.infos.length;

    return (
      '<tr style="border-bottom:1px solid var(--line-soft)">' +
        '<td style="padding:6px 8px;font-family:var(--font-mono);font-size:10px;color:var(--ink)">' + esc(slot.slotId) + '</td>' +
        '<td style="padding:6px 8px;font-family:var(--font-mono);font-size:10px;color:var(--muted)">' + esc(slot.moduleId || '—') + '</td>' +
        '<td style="padding:6px 8px;font-size:12px;color:' + (slot.required ? 'var(--ink)' : 'var(--muted)') + '">' + (slot.required ? 'yes' : 'no') + '</td>' +
        '<td style="padding:6px 8px;font-size:12px;color:' + stateColor + '">' + esc(slot.state) + '</td>' +
        '<td style="padding:6px 8px;font-size:12px;color:' + rightsColor + '">' + (slot.rights.clear ? 'clear' : esc(slot.rights.reason || 'blocked')) + '</td>' +
        '<td style="padding:6px 8px;font-size:12px;color:' + (issueCount ? 'var(--orange)' : 'var(--muted)') + '">' + (issueCount || '—') + '</td>' +
      '</tr>'
    );
  }).join('');

  return (
    '<div class="card">' +
      '<div class="card-head"><h3>Asset Slots</h3></div>' +
      '<div style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="text-align:left">' +
            '<th style="padding:6px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-weight:400" class="mono">slot</th>' +
            '<th style="padding:6px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-weight:400" class="mono">module</th>' +
            '<th style="padding:6px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-weight:400" class="mono">required</th>' +
            '<th style="padding:6px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-weight:400" class="mono">state</th>' +
            '<th style="padding:6px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-weight:400" class="mono">rights</th>' +
            '<th style="padding:6px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-weight:400" class="mono">issues</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>'
  );
}
