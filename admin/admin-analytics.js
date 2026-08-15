/* ── Larum Admin · Global Analytics (M5.7) ──────────────────
   Top-level sidebar view: cross-property analytics using
   sessions, leads, and events from core state.

   Zero writes to visitor runtime / API / RLS / schema.
   ───────────────────────────────────────────────────────────── */

import { state, filteredLeads, filteredSessions, esc, minutes } from './admin-core.js';
import { statCard, card, barChart, interestBars, emptyState } from './admin-ui.js';

export const title = 'Analytics';

let containerRef = null;

/* ── Module contract ─────────────────────────────────────── */

export function render(container) {
  containerRef = container;
  draw();
}

export function teardown() {
  containerRef = null;
}

/* ── Rendering ───────────────────────────────────────────── */

function draw() {
  if (!containerRef) return;

  const sessions = filteredSessions();
  const leads = filteredLeads();

  if (!sessions.length && !leads.length) {
    containerRef.innerHTML =
      '<div class="page-header"><h2>Analytics</h2></div>' +
      emptyState('No activity', 'Visitor data will appear here once people start exploring properties.');
    return;
  }

  const totalSec = sessions.reduce((n, s) => n + (s.duration_seconds || 0), 0);
  const avgTime = sessions.length ? minutes(totalSec / sessions.length) : '—';
  const questions = sessions.reduce((n, s) => n + (s.concierge_questions || 0), 0);
  const qualified = sessions.filter(s => s.qualified).length;
  const convRate = sessions.length ? Math.round((leads.length / sessions.length) * 100) + '%' : '—';

  containerRef.innerHTML =
    '<div class="page-header"><h2>Analytics</h2></div>' +

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
