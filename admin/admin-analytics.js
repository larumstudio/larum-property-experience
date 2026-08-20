/* ── Larum Admin · Global Analytics (M5.7 + M6.1) ────────────
   Top-level sidebar view: cross-property analytics using
   sessions, leads, and events from core state.

   M6.1 adds a "Visits" subtab. It reuses admin-sessions.js
   as-is — same render(container)/teardown() contract already
   used by admin-workspace.js to mount its own sub-panels — no
   logic is copied or reimplemented here. Visits has no sidebar
   item of its own; #sessions stays registered in admin-router.js
   for the direct deep-link, but the only in-app way to reach it
   is Analytics → Visits.

   Zero writes to visitor runtime / API / RLS / schema.
   ───────────────────────────────────────────────────────────── */

import { state, filteredLeads, filteredSessions, esc, minutes, getRole } from './admin-core.js';
import { statCard, card, barChart, interestBars, emptyState, tabs } from './admin-ui.js';
import * as sessionsModule from './admin-sessions.js';

export const title = 'Analytics';

const SUBTABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'visits',   label: 'Visits' }
];

let containerRef = null;
let activeSubtab = 'overview';
let role = null;

/* ── Module contract ─────────────────────────────────────── */

export async function render(container) {
  containerRef = container;
  activeSubtab = 'overview';
  role = await getRole();
  draw();
}

export function teardown() {
  /* Unconditional, like admin-workspace.js tears down every sub-panel
     regardless of which tab was active — sessionsModule.teardown() is
     a safe no-op if Visits was never mounted this visit. */
  sessionsModule.teardown();
  delete window.__analyticsSubtab;
  containerRef = null;
  activeSubtab = 'overview';
  role = null;
}

/* ── Rendering ───────────────────────────────────────────── */

function draw() {
  if (!containerRef) return;

  containerRef.innerHTML =
    '<div class="page-header"><h2>Analytics</h2></div>' +
    tabs(SUBTABS, activeSubtab, 'onclick="__analyticsSubtab(this.dataset.tab)"') +
    '<div id="analyticsSubtabContent" class="workspace-content"></div>';

  window.__analyticsSubtab = switchSubtab;

  const mount = document.getElementById('analyticsSubtabContent');
  if (!mount) return;

  if (activeSubtab === 'visits') drawVisits(mount);
  else drawOverview(mount);
}

function switchSubtab(id) {
  if (id === activeSubtab) return;
  activeSubtab = id;
  draw();
}

/* Same restricted-access notice for both subtabs: virtually everything
   in Overview (visits/day, engagement, entry paths, exploration,
   canonical ID coverage) is sessions/analytics_events-derived, same as
   Visits itself — there is no RLS policy granting an agent read access
   to either table (deliberate AE III v1 scope, Migration 006). Showing
   a "0" here would look like "no traffic" when the real answer is
   "you cannot see this" — this notice says the true thing instead. */
function restrictedNotice() {
  return (
    '<div class="card">' +
      '<div class="card-head"><h3>Visit-level analytics is admin-only</h3></div>' +
      '<div style="padding:16px;color:var(--muted);font-size:13px">' +
        'Session and event data is not available to the agent role in this release. ' +
        'Your leads and their status stay visible under Leads.' +
      '</div>' +
    '</div>'
  );
}

function drawVisits(mount) {
  if (role === 'agent') { mount.innerHTML = restrictedNotice(); return; }
  sessionsModule.render(mount);
}

function drawOverview(mount) {
  if (role === 'agent') { mount.innerHTML = restrictedNotice(); return; }

  const sessions = filteredSessions();
  const leads = filteredLeads();

  if (!sessions.length && !leads.length) {
    mount.innerHTML = emptyState('No activity', 'Visitor data will appear here once people start exploring properties.');
    return;
  }

  const totalSec = sessions.reduce((n, s) => n + (s.duration_seconds || 0), 0);
  const avgTime = sessions.length ? minutes(totalSec / sessions.length) : '—';
  const questions = sessions.reduce((n, s) => n + (s.concierge_questions || 0), 0);
  const qualified = sessions.filter(s => s.qualified).length;
  const convRate = sessions.length ? Math.round((leads.length / sessions.length) * 100) + '%' : '—';

  mount.innerHTML =
    '<div class="stats-row">' +
      statCard('Sessions', sessions.length, '') +
      statCard('Avg. time', avgTime, '') +
      statCard('Leads', leads.length, '') +
      statCard('Qualified', qualified, '') +
      statCard('Conversion', convRate, '') +
    '</div>' +

    '<div class="grid-2">' +
      card('Visits per day', renderDays(sessions), { headerRight: '<span class="mono">Last 14 days</span>' }) +
      card('Sessions per property', renderByProperty(sessions)) +
    '</div>' +

    '<div class="grid-2">' +
      card('Detected interests', renderInterests(sessions)) +
      card('Engagement signals', renderSignals(sessions)) +
    '</div>' +

    '<div class="grid-2">' +
      card('Top entry paths', renderEntryPaths(sessions)) +
      card('Content exploration', renderExploration(sessions)) +
    '</div>' +

    card(
      'Canonical ID coverage',
      renderNullReport(state.events),
      { headerRight: '<span class="mono" style="font-size:11px;color:var(--muted)">event_schema · 1 · LPE-10</span>' }
    );
}

/* ── Charts ─────────────────────────────────────────────── */

function renderDays(sessions) {
  const days = 14;
  const buckets = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({ date: d, n: 0 });
  }
  sessions.forEach(s => {
    const t = new Date(s.created_at);
    const key = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const b = buckets.find(x => x.date.getTime() === key);
    if (b) b.n++;
  });
  return barChart(buckets.map(b => ({ label: String(b.date.getDate()), value: b.n })));
}

function renderByProperty(sessions) {
  const counts = {};
  sessions.forEach(s => {
    const p = s.property || 'unknown';
    counts[p] = (counts[p] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return interestBars(sorted);
}

function renderInterests(sessions) {
  const totals = {};
  sessions.forEach(s => {
    const map = s.interests || {};
    for (const k in map) totals[k] = (totals[k] || 0) + (Number(map[k]) || 0);
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return interestBars(sorted);
}

function renderSignals(sessions) {
  if (!sessions.length) return '<div class="empty">No sessions.</div>';
  const total = sessions.length;
  const calc = sessions.filter(s => s.calculator_used).length;
  const film = sessions.filter(s => s.film_watched).length;
  const enq = sessions.filter(s => s.enquiry_sent).length;

  function pct(n) { return total ? Math.round((n / total) * 100) + '%' : '0%'; }

  return '<div class="ga-signals">' +
    '<div class="ga-signal"><span>Calculator used</span><strong>' + pct(calc) + '</strong> <span class="mono">(' + calc + '/' + total + ')</span></div>' +
    '<div class="ga-signal"><span>Film watched</span><strong>' + pct(film) + '</strong> <span class="mono">(' + film + '/' + total + ')</span></div>' +
    '<div class="ga-signal"><span>Enquiry sent</span><strong>' + pct(enq) + '</strong> <span class="mono">(' + enq + '/' + total + ')</span></div>' +
  '</div>';
}

function renderEntryPaths(sessions) {
  const counts = {};
  sessions.forEach(s => {
    const p = s.entry_path || 'direct';
    counts[p] = (counts[p] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!sorted.length) return '<div class="empty">No entry path data.</div>';
  return '<div class="ga-paths">' + sorted.map(([path, n]) =>
    '<div class="ga-path-row"><span class="mono">' + esc(path) + '</span><span class="ga-path-n">' + n + '</span></div>'
  ).join('') + '</div>';
}

/* LPE-10: Canonical ID coverage reconciliation view (HANDOFF §5).
   Read-only. Reads from state.events (analytics_events already loaded by
   admin-core.js). No writes, no mutations. Non-zero missing counts are
   EXPECTED until LPE-08/09 surface canonical IDs to the runtime. */
function renderNullReport(events) {
  const lpe10 = events.filter(e => e.event_schema === 1);

  if (!lpe10.length) {
    return '<div class="empty">No LPE-10 canonical events in this period. ' +
      'Canonical fields populate once the analytics schema is live and the visitor runtime runs.</div>' +
      '<div class="mono" style="margin-top:10px;font-size:11px;color:var(--muted)">' +
        'The property slug (legacy field) is always written regardless — dual-write retained.' +
      '</div>';
  }

  const total = lpe10.length;
  function pct(n) { return total ? Math.round((n / total) * 100) + '%' : '0%'; }

  const hasPropId = lpe10.filter(e => e.property_id).length;
  const hasRevId  = lpe10.filter(e => e.experience_revision_id).length;
  const hasModId  = lpe10.filter(e => e.module_id).length;
  const hasFamily = lpe10.filter(e => e.family).length;

  function row(field, n) {
    return '<div class="ga-signal">' +
      '<span class="mono" style="min-width:210px;display:inline-block">' + esc(field) + '</span>' +
      '<strong>' + pct(n) + '</strong>' +
      ' <span class="mono" style="color:var(--muted)">(' + n + ' / ' + total + ')</span>' +
    '</div>';
  }

  return '<div class="ga-signals">' +
    row('property_id', hasPropId) +
    row('experience_revision_id', hasRevId) +
    row('module_id', hasModId) +
    row('family', hasFamily) +
  '</div>' +
  '<div class="mono" style="margin-top:12px;font-size:11px;color:var(--muted)">' +
    'property (slug) always written · dual-write retained · ' +
    'non-zero missing counts expected until LPE-08/09 surface canonical IDs' +
  '</div>';
}

function renderExploration(sessions) {
  const scenes = {};
  const spaces = {};
  sessions.forEach(s => {
    (s.scenes_explored || []).forEach(name => { scenes[name] = (scenes[name] || 0) + 1; });
    (s.spaces_explored || []).forEach(name => { spaces[name] = (spaces[name] || 0) + 1; });
  });
  const topScenes = Object.entries(scenes).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topSpaces = Object.entries(spaces).sort((a, b) => b[1] - a[1]).slice(0, 5);

  let html = '';
  if (topScenes.length) {
    html += '<div style="margin-bottom:8px;font-size:11px;color:var(--muted)">Scenes</div>';
    html += interestBars(topScenes);
  }
  if (topSpaces.length) {
    html += '<div style="margin:12px 0 8px;font-size:11px;color:var(--muted)">Spaces</div>';
    html += interestBars(topSpaces);
  }
  if (!html) html = '<div class="empty">No exploration data.</div>';
  return html;
}
