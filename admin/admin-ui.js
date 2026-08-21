/* ── Larum Admin · UI Components ────────────────────────────────
   Reusable rendering functions for the design system. Every
   visual pattern in the admin is composed from these building
   blocks. Modules call them to build their views; the design
   tokens live in admin.html's stylesheet.
   ───────────────────────────────────────────────────────────── */

import { esc, cap, timeAgo, minutes, fullDate, fmtOffset } from './admin-core.js';

/* ── Stat card ────────────────────────────────────────────── */

export function statCard(label, value, note, opts) {
  const delta = opts && opts.delta;
  const deltaClass = delta && delta > 0 ? 'delta-up' : delta && delta < 0 ? 'delta-down' : '';
  return (
    '<div class="stat">' +
      '<div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-value">' + esc(String(value)) + '</div>' +
      (delta !== undefined && delta !== null
        ? '<div class="stat-delta ' + deltaClass + '">' + (delta > 0 ? '+' : '') + delta + '%</div>'
        : '') +
      (note ? '<div class="stat-note">' + esc(note) + '</div>' : '') +
    '</div>'
  );
}

/* ── Status badge ────────────────────────────────────────── */

export function badge(status) {
  const map = {
    published: 'badge-green',
    ready: 'badge-green',
    contacted: 'badge-green',
    in_production: 'badge-orange',
    draft: 'badge-muted',
    archived: 'badge-muted',
    new: 'badge-accent',
    exploring: 'badge-accent',
    qualified: 'badge-red'
  };
  const cls = map[status] || 'badge-muted';
  const label = esc(cap((status || '').replace(/_/g, ' ')));
  return '<span class="badge ' + cls + '">' + label + '</span>';
}

/* ── Tabs ─────────────────────────────────────────────────── */

export function tabs(items, active, onClickAttr) {
  return (
    '<div class="tabs">' +
      items.map(item =>
        '<button class="tab' + (item.id === active ? ' active' : '') + '" ' +
          'data-tab="' + esc(item.id) + '" ' +
          (onClickAttr || '') + '>' +
          esc(item.label) +
        '</button>'
      ).join('') +
    '</div>'
  );
}

/* ── Table ────────────────────────────────────────────────── */

export function table(cols, rows, opts) {
  const onclick = opts && opts.onRowClick;
  let html = '<div class="table-wrap"><table><thead><tr>';
  cols.forEach(c => { html += '<th>' + esc(c.label) + '</th>'; });
  html += '</tr></thead><tbody>';

  if (!rows.length) {
    html += '<tr><td colspan="' + cols.length + '" class="empty">' +
      esc((opts && opts.emptyText) || 'No data.') + '</td></tr>';
  } else {
    rows.forEach((row, i) => {
      html += '<tr' + (onclick ? ' onclick="' + onclick + '(' + i + ')"' : '') + '>';
      cols.forEach(c => { html += '<td>' + (c.render ? c.render(row, i) : esc(row[c.key] || '—')) + '</td>'; });
      html += '</tr>';
    });
  }

  html += '</tbody></table></div>';
  return html;
}

/* ── Activity feed ────────────────────────────────────────── */

export function activityItem(icon, text, time) {
  return (
    '<div class="activity-item">' +
      '<div class="activity-dot" style="color:' + (icon === '●' ? 'var(--gold)' : 'var(--muted)') + '">' + icon + '</div>' +
      '<div class="activity-body">' +
        '<div class="activity-text">' + text + '</div>' +
        '<div class="activity-time">' + esc(time) + '</div>' +
      '</div>' +
    '</div>'
  );
}

/* ── Cards ────────────────────────────────────────────────── */

export function card(title, content, opts) {
  const headerRight = (opts && opts.headerRight) || '';
  return (
    '<div class="card' + ((opts && opts.cls) ? ' ' + opts.cls : '') + '">' +
      (title
        ? '<div class="card-head"><h3>' + esc(title) + '</h3>' + headerRight + '</div>'
        : '') +
      content +
    '</div>'
  );
}

/* ── Bar chart (SVG) ─────────────────────────────────────── */

export function barChart(data, opts) {
  const w = (opts && opts.width) || 600;
  const h = (opts && opts.height) || 130;
  const gap = 4;
  const barW = Math.max(4, (w - gap * (data.length - 1)) / data.length);
  const max = Math.max(1, ...data.map(d => d.value));
  const labelEvery = data.length > 14 ? 2 : 1;

  let svg = '<svg viewBox="0 0 ' + w + ' ' + (h + 22) + '" class="bar-chart">';

  data.forEach((d, i) => {
    const x = i * (barW + gap);
    const barH = Math.max(2, (d.value / max) * h);
    const y = h - barH;

    svg += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + barH + '" rx="2" fill="var(--gold)" opacity="0.85">' +
      '<title>' + esc(d.label) + ': ' + d.value + '</title></rect>';

    if (i % labelEvery === 0) {
      svg += '<text x="' + (x + barW / 2) + '" y="' + (h + 16) + '" text-anchor="middle" ' +
        'fill="var(--muted)" font-size="9" font-family="inherit">' + esc(d.label) + '</text>';
    }
  });

  svg += '</svg>';
  return svg;
}

/* ── Interest bars ───────────────────────────────────────── */

export function interestBars(sorted) {
  if (!sorted.length) return '<div class="empty">No interest signals yet.</div>';
  const max = sorted[0][1] || 1;
  return '<div class="bars">' + sorted.map(([k, v]) =>
    '<div class="bar"><div class="bar-name">' + esc(k.replace(/_/g, ' ')) + '</div>' +
    '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round((v / max) * 100) + '%"></div></div>' +
    '<div class="bar-val">' + v + '</div></div>'
  ).join('') + '</div>';
}

/* ── Donut chart (SVG) ───────────────────────────────────── */

export function donutChart(segments, size) {
  const r = (size || 120) / 2;
  const cx = r, cy = r;
  const ir = r * 0.6;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let angle = -90;

  let svg = '<svg viewBox="0 0 ' + (r * 2) + ' ' + (r * 2) + '" class="donut-chart">';

  segments.forEach(seg => {
    const pct = seg.value / total;
    const sweep = pct * 360;
    const startRad = (angle * Math.PI) / 180;
    const endRad = ((angle + sweep) * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const ix1 = cx + ir * Math.cos(endRad);
    const iy1 = cy + ir * Math.sin(endRad);
    const ix2 = cx + ir * Math.cos(startRad);
    const iy2 = cy + ir * Math.sin(startRad);

    const large = sweep > 180 ? 1 : 0;

    svg += '<path d="M' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + large + ',1 ' + x2 + ',' + y2 +
      ' L' + ix1 + ',' + iy1 + ' A' + ir + ',' + ir + ' 0 ' + large + ',0 ' + ix2 + ',' + iy2 + ' Z" ' +
      'fill="' + (seg.color || 'var(--gold)') + '" opacity="0.85"><title>' + esc(seg.label) + ': ' + seg.value + '</title></path>';

    angle += sweep;
  });

  svg += '</svg>';
  return svg;
}

/* ── Drawer ───────────────────────────────────────────────── */

export function openDrawer(html) {
  const d = document.getElementById('drawer');
  if (!d) return;
  d.innerHTML = html;
  d.classList.add('on');
  d.setAttribute('aria-hidden', 'false');
  document.getElementById('drawerBack').classList.add('on');
}

export function closeDrawer() {
  const d = document.getElementById('drawer');
  if (!d) return;
  d.classList.remove('on');
  d.setAttribute('aria-hidden', 'true');
  document.getElementById('drawerBack').classList.remove('on');
}

/* ── Drawer sub-components ───────────────────────────────── */

export function section(title, html) {
  if (!html) return '';
  return '<div class="sec"><h4>' + esc(title) + '</h4>' + html + '</div>';
}

export function chips(list) {
  if (!list || !list.length) return '';
  return '<div class="chips">' + list.map(x => '<span class="chip">' + esc(x) + '</span>').join('') + '</div>';
}

export function timeline(events) {
  if (!events.length) return '';
  const t0 = new Date(events[0].created_at).getTime();
  return '<div class="timeline">' + events.map(e => {
    const d = (e.event_data || {});
    const detail = d.question || d.name || d.path || d.interest || '';
    const offset = Math.max(0, Math.round((new Date(e.created_at).getTime() - t0) / 1000));
    return '<div class="tl"><div class="tl-t">' + fmtOffset(offset) + '</div>' +
      '<div class="tl-e"><b>' + esc(e.event_type.replace(/_/g, ' ')) + '</b>' +
      (detail ? ' <span>' + esc(String(detail)) + '</span>' : '') + '</div></div>';
  }).join('') + '</div>';
}

/* ── Empty state ─────────────────────────────────────────── */

export function emptyState(title, text) {
  return (
    '<div class="empty-state">' +
      '<div class="empty-state-icon">◇</div>' +
      '<div class="empty-state-title">' + esc(title) + '</div>' +
      (text ? '<div class="empty-state-text">' + esc(text) + '</div>' : '') +
    '</div>'
  );
}

/* ── Truncation notice (M6.5b) ────────────────────────────── */

/* `truncated` is state.truncated.{leads,sessions,events} from
   admin-core.js's load() — passed in rather than read from `state`
   directly here, keeping this module's pure render-given-data
   contract (same as every other builder in this file). `count` is the
   number of rows actually held (state.leads.length etc — always
   equal to the cap when truncated, since that's what got returned).
   Never suggests raising the cap; only tells the operator that older
   rows in the period exist but aren't in this list. */
export function truncationNotice(truncated, count, label) {
  if (!truncated) return '';
  return (
    '<div class="mono" style="font-size:11px;color:var(--muted);margin:8px 0 12px">' +
      'Showing the latest ' + count.toLocaleString('en-US') + ' ' + esc(label) + ' for this period. ' +
      'Older records are not included — narrow the period filter to see them.' +
    '</div>'
  );
}

/* ── Toast ────────────────────────────────────────────────── */

let toastTimer = null;
export function toast(message, type) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast toast-' + (type || 'info') + ' toast-show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('toast-show'); }, 3000);
}

/* ── Mobile sidebar toggle ───────────────────────────────── */

export function initMobileMenu() {
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('sidebar-open');
    if (overlay) overlay.classList.toggle('on');
  });

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('sidebar-open');
      overlay.classList.remove('on');
    });
  }

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 820) {
        sidebar.classList.remove('sidebar-open');
        if (overlay) overlay.classList.remove('on');
      }
    });
  });
}
