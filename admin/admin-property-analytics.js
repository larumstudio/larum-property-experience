/* ── Larum Admin · Property Analytics (M5.7) ────────────────
   Workspace Analytics tab: per-property metrics built from
   sessions, leads, and analytics_events already in core state.

   Zero writes to visitor runtime / API / RLS / schema.
   ───────────────────────────────────────────────────────────── */

import { state, esc, minutes } from './admin-core.js';
import { statCard, card, barChart, interestBars, emptyState } from './admin-ui.js';
import { resolveCapabilities } from './admin-auth-context.js';

let containerRef = null;

/* ── Module contract ─────────────────────────────────────── */

export async function render(container, property) {
  containerRef = container;
  if (!property) {
    container.innerHTML = emptyState('Analytics', 'No property loaded.');
    return;
  }

  /* Same reasoning as the global Analytics module (M6.1): this whole
     tab is sessions/analytics_events-derived, and there is no RLS
     policy granting the agent role read access to either table — a
     "0" here would misleadingly read as "no visits" rather than "you
     cannot see this". */
  const caps = await resolveCapabilities();
  if (!caps['analytics.raw']) {
    container.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h3>Visit-level analytics is admin-only</h3></div>' +
        '<div style="padding:16px;color:var(--muted);font-size:13px">' +
          'Session and event data is not available to the agent role in this release.' +
        '</div>' +
      '</div>';
    return;
  }

  draw(property);
}

export function teardown() {
  containerRef = null;
}

/* ── Rendering ───────────────────────────────────────────── */

function draw(property) {
  if (!containerRef) return;

  const slug = property.slug;
  const sessions = state.sessions.filter(s => s.property === slug);
  const leads = state.leads.filter(l => l.property === slug);
  const events = state.events.filter(e => e.property === slug);

  if (!sessions.length && !leads.length) {
    containerRef.innerHTML = emptyState('No activity yet',
      'Visitor data will appear here once people start exploring this property.');
    return;
  }

  const totalSec = sessions.reduce((n, s) => n + (s.duration_seconds || 0), 0);
  const avgTime = sessions.length ? minutes(totalSec / sessions.length) : '—';
  const questions = sessions.reduce((n, s) => n + (s.concierge_questions || 0), 0);
  const qualified = sessions.filter(s => s.qualified).length;

  containerRef.innerHTML =
    '<div class="stats-row">' +
      statCard('Visits', sessions.length, '') +
      statCard('Avg. time', avgTime, '') +
      statCard('Questions', questions, '') +
      statCard('Leads', leads.length, '') +
      statCard('Qualified', qualified, '') +
    '</div>' +

    '<div class="grid-2">' +
      card('Visits per day', renderDays(sessions), { headerRight: '<span class="mono">Last 14 days</span>' }) +
      card('Detected interests', renderInterests(sessions)) +
    '</div>' +

    '<div class="grid-2">' +
      card('Top entry paths', renderEntryPaths(sessions)) +
      card('Engagement signals', renderSignals(sessions)) +
    '</div>' +

    '<div class="grid-2">' +
      card('Most explored scenes', renderFrequency(sessions, 'scenes_explored')) +
      card('Most explored spaces', renderFrequency(sessions, 'spaces_explored')) +
    '</div>';
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

function renderInterests(sessions) {
  const totals = {};
  sessions.forEach(s => {
    const map = s.interests || {};
    for (const k in map) totals[k] = (totals[k] || 0) + (Number(map[k]) || 0);
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return interestBars(sorted);
}

function renderEntryPaths(sessions) {
  const counts = {};
  sessions.forEach(s => {
    const p = s.entry_path || 'direct';
    counts[p] = (counts[p] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!sorted.length) return '<div class="empty">No entry path data.</div>';
  return '<div class="pa-paths">' + sorted.map(([path, n]) =>
    '<div class="pa-path-row"><span class="mono">' + esc(path) + '</span><span class="pa-path-n">' + n + '</span></div>'
  ).join('') + '</div>';
}

function renderSignals(sessions) {
  if (!sessions.length) return '<div class="empty">No sessions.</div>';
  const total = sessions.length;
  const calc = sessions.filter(s => s.calculator_used).length;
  const film = sessions.filter(s => s.film_watched).length;
  const enq = sessions.filter(s => s.enquiry_sent).length;

  function pct(n) { return total ? Math.round((n / total) * 100) + '%' : '0%'; }

  return '<div class="pa-signals">' +
    '<div class="pa-signal"><span>Calculator used</span><strong>' + pct(calc) + '</strong> <span class="mono">(' + calc + '/' + total + ')</span></div>' +
    '<div class="pa-signal"><span>Film watched</span><strong>' + pct(film) + '</strong> <span class="mono">(' + film + '/' + total + ')</span></div>' +
    '<div class="pa-signal"><span>Enquiry sent</span><strong>' + pct(enq) + '</strong> <span class="mono">(' + enq + '/' + total + ')</span></div>' +
  '</div>';
}

function renderFrequency(sessions, field) {
  const counts = {};
  sessions.forEach(s => {
    (s[field] || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; });
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return interestBars(sorted);
}
