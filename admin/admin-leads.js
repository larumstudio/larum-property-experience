/* ── Larum Admin · Leads ────────────────────────────────────────
   Leads table and drawer. Exact same logic as the monolithic
   admin.html, restructured into the modular system.
   ───────────────────────────────────────────────────────────── */

import {
  state, filteredLeads, filteredSessions, esc, cap, minutes,
  timeAgo, fullDate, normaliseInterests, updateLead,
  sessionForLead, eventsFor
} from './admin-core.js';
import { badge, openDrawer, closeDrawer, section, chips, timeline } from './admin-ui.js';

export const title = 'Leads';

let currentLeads = [];

export function render(container) {
  const leads = filteredLeads();
  currentLeads = leads;

  container.innerHTML =
    '<div class="page-header">' +
      '<h2>Leads</h2>' +
      '<span class="mono">' + leads.length + ' rows</span>' +
    '</div>' +
    renderTable(leads);

  window.__openLead = openLead;
}

function renderTable(leads) {
  if (!leads.length) {
    return '<div class="card"><div class="empty">No leads in this period.<br>Visits without a form are under <strong>Visits</strong>.</div></div>';
  }

  let html = '<div class="card"><div class="table-wrap"><table><thead><tr>' +
    '<th>Contact</th><th>Property</th><th>Interest</th><th>Signals</th><th>Time</th><th>Received</th><th>Status</th>' +
    '</tr></thead><tbody>';

  leads.forEach((l, i) => {
    const status = l.status || 'new';
    const signals = [];
    if ((l.concierge_questions || []).length) signals.push((l.concierge_questions || []).length + ' questions');
    if (l.calculator_used) signals.push('calculator');
    if (l.film_watched) signals.push('film');

    html += '<tr onclick="__openLead(' + i + ')">' +
      '<td class="who-cell"><strong>' + esc(l.name || 'Anonymous') + '</strong><span>' + esc(l.email || '') + '</span></td>' +
      '<td>' + esc(l.property || '—') + '</td>' +
      '<td>' + esc(l.interest || '—') + '</td>' +
      '<td>' + (signals.length ? esc(signals.join(' · ')) : '<span class="badge badge-muted">—</span>') + '</td>' +
      '<td class="num">' + (l.duration_minutes || 0) + 'm</td>' +
      '<td>' + timeAgo(l.created_at) + '</td>' +
      '<td>' + (l.qualified ? '<span class="badge badge-red">Qualified</span> ' : '') +
        badge(status) + '</td>' +
    '</tr>';
  });

  html += '</tbody></table></div></div>';
  return html;
}

function openLead(i) {
  const l = currentLeads[i];
  if (!l) return;
  state.current = { kind: 'lead', row: l, index: i };

  const s = sessionForLead(l);
  const events = eventsFor(l.session_id);
  const interests = normaliseInterests(l.detected_interests);
  const questions = l.concierge_questions || [];
  const status = l.status || 'new';

  openDrawer(
    '<button class="drawer-close" onclick="__closeDrawer()">&#x2715;</button>' +
    '<div class="mono">' + esc(l.property || '') + ' · ' + esc((l.lang || 'en').toUpperCase()) + '</div>' +
    '<h2>' + esc(l.name || 'Anonymous') + '</h2>' +
    '<div class="drawer-email">' + esc(l.email || 'no email given') + '</div>' +

    '<dl class="kv">' +
      '<dt>Received</dt><dd>' + fullDate(l.created_at) + '</dd>' +
      '<dt>Status</dt><dd>' + (l.qualified ? '<span class="badge badge-red">Qualified</span> ' : '') + badge(status) + '</dd>' +
      '<dt>Interest</dt><dd>' + esc(l.interest || '—') + '</dd>' +
      '<dt>Entry path</dt><dd>' + esc(l.entry_path || 'direct') + '</dd>' +
      '<dt>Time on site</dt><dd>' + (l.duration_minutes || 0) + ' min' + (s ? ' · ' + minutes(s.duration_seconds) + ' measured' : '') + '</dd>' +
      '<dt>Calculator</dt><dd>' + (l.calculator_used ? 'Used' : 'No') + '</dd>' +
      '<dt>Film</dt><dd>' + (l.film_watched ? 'Watched' : 'No') + '</dd>' +
    '</dl>' +

    (l.message ? section('Message', '<div class="qlist"><div>' + esc(l.message) + '</div></div>') : '') +
    section('Scenes explored', chips(l.scenes_explored || (s && s.scenes_explored) || [])) +
    section('Spaces explored', chips(l.spaces_explored || (s && s.spaces_explored) || [])) +
    section('Chapters', chips((s && s.chapters_visited) || [])) +
    section('Detected interests', interests.length
      ? '<div class="chips">' + interests.map(([k, v]) => '<span class="chip">' + esc(k.replace(/_/g, ' ')) + ' · ' + v + '</span>').join('') + '</div>'
      : '') +
    section('Questions to the concierge', questions.length
      ? '<div class="qlist">' + questions.map(q => '<div>' + esc(q) + '</div>').join('') + '</div>'
      : '') +
    section('Timeline', events.length ? timeline(events) : '') +

    '<div class="sec">' +
      '<h4>Advisor notes</h4>' +
      '<textarea id="leadNotes" placeholder="What was agreed, when to follow up…">' + esc(l.notes || '') + '</textarea>' +
      '<div class="actions">' +
        '<button class="btn btn-primary" onclick="__markContacted()">' + (status === 'contacted' ? 'Save notes' : 'Mark as contacted') + '</button>' +
        (status === 'contacted' ? '<button class="btn btn-outline" onclick="__reopenLead()">Back to new</button>' : '') +
        '<span class="saved" id="savedNote"></span>' +
      '</div>' +
    '</div>'
  );

  window.__closeDrawer = closeDrawer;
  window.__markContacted = () => markContacted(l, i);
  window.__reopenLead = () => reopenLead(l, i);
}

async function markContacted(lead, idx) {
  const notes = (document.getElementById('leadNotes') || {}).value || '';
  const ok = await updateLead(lead, { status: 'contacted', notes });
  if (ok) {
    const content = document.getElementById('viewContent');
    if (content) render(content);
    setTimeout(() => openLead(idx), 100);
  }
}

async function reopenLead(lead, idx) {
  const notes = (document.getElementById('leadNotes') || {}).value || '';
  const ok = await updateLead(lead, { status: 'new', notes });
  if (ok) {
    const content = document.getElementById('viewContent');
    if (content) render(content);
    setTimeout(() => openLead(idx), 100);
  }
}

export function teardown() {
  closeDrawer();
  delete window.__openLead;
  delete window.__closeDrawer;
  delete window.__markContacted;
  delete window.__reopenLead;
}
