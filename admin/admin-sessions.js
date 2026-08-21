/* ── Larum Admin · Sessions (Visits) ───────────────────────────
   Sessions table and drawer. Same logic as the monolithic
   admin.html, restructured into the modular system.
   ───────────────────────────────────────────────────────────── */

import {
  state, filteredSessions, esc, cap, minutes,
  timeAgo, fullDate, normaliseInterests, leadForSession, eventsFor
} from './admin-core.js';
import { badge, openDrawer, closeDrawer, section, chips, timeline, truncationNotice } from './admin-ui.js';

export const title = 'Visits';

let currentSessions = [];

export function render(container) {
  const sessions = filteredSessions();
  currentSessions = sessions;

  container.innerHTML =
    '<div class="page-header">' +
      '<h2>Visits</h2>' +
      '<span class="mono">' + sessions.length + ' rows</span>' +
    '</div>' +
    truncationNotice(state.truncated.sessions, state.sessions.length, 'sessions') +
    renderTable(sessions);

  window.__openSession = openSession;
}

function renderTable(sessions) {
  if (!sessions.length) {
    return '<div class="card"><div class="empty">No visits recorded in this period.<br>' +
      'Visits are only written once the visitor accepts the consent banner.</div></div>';
  }

  let html = '<div class="card"><div class="table-wrap"><table><thead><tr>' +
    '<th>Started</th><th>Property</th><th>Time</th><th>Explored</th><th>Questions</th><th>Interests</th><th>Outcome</th>' +
    '</tr></thead><tbody>';

  sessions.forEach((s, i) => {
    const explored = (s.scenes_explored || []).length + (s.spaces_explored || []).length;
    const interests = Object.keys(s.interests || {});
    const lead = leadForSession(s.id);

    html += '<tr onclick="__openSession(' + i + ')">' +
      '<td>' + timeAgo(s.created_at) + '</td>' +
      '<td>' + esc(s.property || '—') + '</td>' +
      '<td class="num">' + minutes(s.duration_seconds) + '</td>' +
      '<td>' + explored + ' <span class="badge badge-muted">scenes + spaces</span></td>' +
      '<td class="num">' + (s.concierge_questions || 0) + '</td>' +
      '<td>' + (interests.length
        ? esc(interests.slice(0, 2).join(', ').replace(/_/g, ' ')) +
          (interests.length > 2 ? ' +' + (interests.length - 2) : '')
        : '<span class="badge badge-muted">—</span>') + '</td>' +
      '<td>' + (lead
        ? '<span class="badge badge-green">Enquiry</span>'
        : s.qualified ? '<span class="badge badge-orange">Qualified, no form</span>'
        : '<span class="badge badge-accent">Explored</span>') + '</td>' +
    '</tr>';
  });

  html += '</tbody></table></div></div>';
  return html;
}

function openSession(i) {
  const s = currentSessions[i];
  if (!s) return;
  state.current = { kind: 'session', row: s };

  const events = eventsFor(s.id);
  const lead = leadForSession(s.id);
  const interests = Object.entries(s.interests || {}).sort((a, b) => b[1] - a[1]);

  openDrawer(
    '<button class="drawer-close" onclick="__closeDrawer()">&#x2715;</button>' +
    '<div class="mono">' + esc(s.property || '') + ' · ' + esc((s.lang || 'en').toUpperCase()) + '</div>' +
    '<h2>' + (s.qualified ? 'Qualified visit' : 'Visit') + '</h2>' +
    '<div class="drawer-email">' + (lead
      ? 'Left an enquiry as ' + esc(lead.name || lead.email || 'anonymous')
      : 'No contact details left') + '</div>' +

    '<dl class="kv">' +
      '<dt>Started</dt><dd>' + fullDate(s.created_at) + '</dd>' +
      '<dt>Time on site</dt><dd>' + minutes(s.duration_seconds) + '</dd>' +
      '<dt>Entry path</dt><dd>' + esc(s.entry_path || 'direct') + '</dd>' +
      '<dt>Questions</dt><dd>' + (s.concierge_questions || 0) + '</dd>' +
      '<dt>Calculator</dt><dd>' + (s.calculator_used ? 'Used' : 'No') + '</dd>' +
      '<dt>Film</dt><dd>' + (s.film_watched ? 'Watched' : 'No') + '</dd>' +
      '<dt>Enquiry</dt><dd>' + (s.enquiry_sent ? 'Sent' : 'Not sent') + '</dd>' +
    '</dl>' +

    section('Chapters', chips(s.chapters_visited || [])) +
    section('Scenes explored', chips(s.scenes_explored || [])) +
    section('Spaces explored', chips(s.spaces_explored || [])) +
    section('Detected interests', interests.length
      ? '<div class="chips">' + interests.map(([k, v]) =>
          '<span class="chip">' + esc(k.replace(/_/g, ' ')) + ' · ' + v + '</span>').join('') + '</div>'
      : '') +
    section('Questions to the concierge', conciergeQuestions(events)) +
    section('Timeline', events.length ? timeline(events) : '')
  );

  window.__closeDrawer = closeDrawer;
}

function conciergeQuestions(events) {
  const qs = events.filter(e => e.event_type === 'concierge_question')
    .map(e => (e.event_data || {}).question).filter(Boolean);
  if (!qs.length) return '';
  return '<div class="qlist">' + qs.map(q => '<div>' + esc(q) + '</div>').join('') + '</div>';
}

export function teardown() {
  closeDrawer();
  delete window.__openSession;
  delete window.__closeDrawer;
}
