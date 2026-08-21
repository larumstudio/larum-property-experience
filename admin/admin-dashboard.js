/* ── Larum Admin · Dashboard ────────────────────────────────────
   The landing view after login. Shows the same stats and charts
   that the monolithic admin.html had, reorganized into the new
   component system. No new metrics, no new logic.
   ───────────────────────────────────────────────────────────── */

import { state, filteredLeads, filteredSessions, esc, minutes, normaliseInterests } from './admin-core.js';
import { statCard, card, barChart, interestBars, truncationNotice } from './admin-ui.js';

export const title = 'Dashboard';

export function render(container) {
  const leads = filteredLeads();
  const sessions = filteredSessions();

  const totalSeconds = sessions.reduce((n, s) => n + (s.duration_seconds || 0), 0);
  const questions = sessions.reduce((n, s) => n + (s.concierge_questions || 0), 0)
    || leads.reduce((n, l) => n + ((l.concierge_questions || []).length), 0);
  const qualified = sessions.filter(s => s.qualified).length;

  const avgTime = sessions.length ? minutes(totalSeconds / sessions.length) : '—';

  container.innerHTML =
    '<div class="page-header">' +
      '<h2>Dashboard</h2>' +
      '<p class="page-subtitle">Resumen de actividad de Larum.</p>' +
    '</div>' +

    truncationNotice(state.truncated.leads, state.leads.length, 'leads') +
    truncationNotice(state.truncated.sessions, state.sessions.length, 'sessions') +

    '<div class="stats-grid">' +
      statCard('Visits', sessions.length || '0', 'Sessions tracked') +
      statCard('Avg. time', avgTime, 'Per visit') +
      statCard('Questions', questions, 'Asked to concierge') +
      statCard('Leads', leads.length, 'Enquiries submitted') +
      statCard('Qualified', qualified, 'Meeting the triggers') +
    '</div>' +

    '<div class="grid-2">' +
      card('Visits per day', renderDays(sessions), { headerRight: '<span class="mono">Last 14 days</span>' }) +
      card('Detected interests', renderInterests(sessions, leads)) +
    '</div>';
}

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

  const data = buckets.map(b => ({
    label: String(b.date.getDate()),
    value: b.n
  }));

  return barChart(data);
}

function renderInterests(sessions, leads) {
  const totals = {};
  sessions.forEach(s => {
    const map = s.interests || {};
    for (const k in map) totals[k] = (totals[k] || 0) + (Number(map[k]) || 0);
  });
  leads.forEach(l => normaliseInterests(l.detected_interests)
    .forEach(([k, v]) => { totals[k] = (totals[k] || 0) + v; }));

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return interestBars(sorted);
}

export function teardown() {}
