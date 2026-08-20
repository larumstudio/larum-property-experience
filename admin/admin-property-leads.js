/* ── Larum Admin · Property Leads (M5.7) ────────────────────
   Workspace Leads tab: enquiries and visitor signals specific
   to one property. Uses local event delegation (data-pl-action).

   Zero writes to visitor runtime / API / RLS / schema.
   ───────────────────────────────────────────────────────────── */

import {
  state, esc, cap, timeAgo, fullDate,
  normaliseInterests, updateLead, sessionForLead, eventsFor
} from './admin-core.js';
import {
  statCard, badge, emptyState, openDrawer, closeDrawer,
  section, chips, timeline, toast
} from './admin-ui.js';

let containerRef = null;
let clickHandler = null;
let currentProperty = null;
let openLeadNotesBaseline = null; // notes value when the open lead's drawer was drawn — M6.4 dirty-check

/* ── Module contract ─────────────────────────────────────── */

export function render(container, property) {
  if (containerRef && containerRef !== container) unbind(containerRef);
  containerRef = container;
  currentProperty = property;

  if (!property) {
    container.innerHTML = emptyState('Leads', 'No property loaded.');
    return;
  }

  bind(container);
  draw();
}

export function teardown() {
  closeDrawer();
  if (containerRef) unbind(containerRef);
  containerRef = null;
  currentProperty = null;
  openLeadNotesBaseline = null;
}

/* ── Event delegation ────────────────────────────────────── */

function bind(container) {
  if (clickHandler) container.removeEventListener('click', clickHandler);
  clickHandler = (e) => {
    const el = e.target.closest('[data-pl-action]');
    if (!el || !container.contains(el)) return;
    const action = el.getAttribute('data-pl-action');

    if (action === 'open') {
      const idx = parseInt(el.getAttribute('data-pl-idx'), 10);
      openLead(idx);
    } else if (action === 'close') {
      closeDrawerGuarded();
    } else if (action === 'contact') {
      const idx = parseInt(el.getAttribute('data-pl-idx'), 10);
      markContacted(idx);
    } else if (action === 'reopen') {
      const idx = parseInt(el.getAttribute('data-pl-idx'), 10);
      reopenLead(idx);
    }
  };
  container.addEventListener('click', clickHandler);
}

function unbind(container) {
  if (clickHandler) container.removeEventListener('click', clickHandler);
  clickHandler = null;
}

/* ── Rendering ───────────────────────────────────────────── */

function getLeads() {
  if (!currentProperty) return [];
  return state.leads.filter(l => l.property === currentProperty.slug);
}

function draw() {
  if (!containerRef || !currentProperty) return;

  const leads = getLeads();

  if (!leads.length) {
    containerRef.innerHTML = emptyState('No leads yet',
      'Enquiries for this property will appear here.');
    return;
  }

  const newCount = leads.filter(l => (l.status || 'new') === 'new').length;
  const contacted = leads.filter(l => l.status === 'contacted').length;
  const qualified = leads.filter(l => l.qualified).length;

  containerRef.innerHTML =
    '<div class="stats-row">' +
      statCard('Total', leads.length, '') +
      statCard('New', newCount, '') +
      statCard('Contacted', contacted, '') +
      statCard('Qualified', qualified, '') +
    '</div>' +
    renderTable(leads);
}

function renderTable(leads) {
  let html = '<div class="card"><div class="table-wrap"><table><thead><tr>' +
    '<th>Contact</th><th>Interest</th><th>Signals</th><th>Time</th><th>Received</th><th>Status</th>' +
    '</tr></thead><tbody>';

  leads.forEach((l, i) => {
    const status = l.status || 'new';
    const signals = [];
    if ((l.concierge_questions || []).length) signals.push((l.concierge_questions || []).length + ' questions');
    if (l.calculator_used) signals.push('calculator');
    if (l.film_watched) signals.push('film');

    html += '<tr data-pl-action="open" data-pl-idx="' + i + '" style="cursor:pointer">' +
      '<td class="who-cell"><strong>' + esc(l.name || 'Anonymous') + '</strong><span>' + esc(l.email || '') + '</span></td>' +
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

/* ── Lead drawer ─────────────────────────────────────────── */

function openLead(idx) {
  const leads = getLeads();
  const l = leads[idx];
  if (!l) return;
  openLeadNotesBaseline = l.notes || '';

  const s = sessionForLead(l);
  const events = eventsFor(l.session_id);
  const interests = normaliseInterests(l.detected_interests);
  const questions = l.concierge_questions || [];
  const status = l.status || 'new';

  openDrawer(
    '<button class="drawer-close" data-pl-action="close">&#x2715;</button>' +
    '<div class="mono">' + esc(l.property || '') + ' · ' + esc((l.lang || 'en').toUpperCase()) + '</div>' +
    '<h2>' + esc(l.name || 'Anonymous') + '</h2>' +
    '<div class="drawer-email">' + esc(l.email || 'no email given') + '</div>' +

    '<dl class="kv">' +
      '<dt>Received</dt><dd>' + fullDate(l.created_at) + '</dd>' +
      '<dt>Status</dt><dd>' + (l.qualified ? '<span class="badge badge-red">Qualified</span> ' : '') + badge(status) + '</dd>' +
      '<dt>Interest</dt><dd>' + esc(l.interest || '—') + '</dd>' +
      '<dt>Entry path</dt><dd>' + esc(l.entry_path || 'direct') + '</dd>' +
      '<dt>Time on site</dt><dd>' + (l.duration_minutes || 0) + ' min' + (s ? ' · ' + (s.duration_seconds ? Math.round(s.duration_seconds / 60) + 'm measured' : '') : '') + '</dd>' +
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
        '<button class="btn btn-primary" data-pl-action="contact" data-pl-idx="' + idx + '">' + (status === 'contacted' ? 'Save notes' : 'Mark as contacted') + '</button>' +
        (status === 'contacted' ? '<button class="btn btn-outline" data-pl-action="reopen" data-pl-idx="' + idx + '">Back to new</button>' : '') +
        '<span class="saved" id="savedNote"></span>' +
      '</div>' +
    '</div>'
  );
}

/* M6.4 finding: closing the drawer without pressing Save/Mark as
   contacted silently discarded whatever was typed in Advisor notes —
   a normal "jot a quick note, then close" flow lost data with no
   warning. Guards only the explicit close click, matching the exact
   finding; full-navigation-away is a separate, lower-severity gap
   (no beforeunload anywhere in the app) not in this scope. */
function closeDrawerGuarded() {
  const ta = document.getElementById('leadNotes');
  const current = ta ? ta.value : openLeadNotesBaseline;
  if (current !== openLeadNotesBaseline && !window.confirm('Discard unsaved notes for this lead?')) return;
  closeDrawer();
}

/* ── Actions ─────────────────────────────────────────────── */

async function markContacted(idx) {
  const leads = getLeads();
  const lead = leads[idx];
  if (!lead) return;
  const notes = (document.getElementById('leadNotes') || {}).value || '';
  const ok = await updateLead(lead, { status: 'contacted', notes });
  if (ok) {
    draw();
    setTimeout(() => openLead(idx), 100);
  }
}

async function reopenLead(idx) {
  const leads = getLeads();
  const lead = leads[idx];
  if (!lead) return;
  const notes = (document.getElementById('leadNotes') || {}).value || '';
  const ok = await updateLead(lead, { status: 'new', notes });
  if (ok) {
    draw();
    setTimeout(() => openLead(idx), 100);
  }
}
