/* ── Larum Admin · Core ─────────────────────────────────────────
   Auth gate, Supabase session, data loading, shared state.
   Every module reads from the shared stores; only this module
   writes to them.
   ───────────────────────────────────────────────────────────── */

import { CONFLICT_MESSAGE, loadAllAgents } from './admin-property-store.js';

export const state = {
  leads: [],
  sessions: [],
  events: [],
  view: 'dashboard',
  current: null,
  user: null,
  /* M6.1: 'admin' | 'agent' | null (not yet resolved). Populated lazily
     by getRole() below — nothing eager at boot, since most views never
     need it. Every real user today is 'admin' (the only membership row
     that exists); 'agent' only becomes reachable once M6.2 ships invite. */
  role: null,
  /* M6.5b: whether the last load() hit the leads/sessions/events cap
     for the selected period — i.e. more rows exist than what's in
     state.leads/.sessions/.events. See truncationNotice() in
     admin-ui.js for how this renders. */
  truncated: { leads: false, sessions: false, events: false }
};

/* ── Auth ─────────────────────────────────────────────────── */

export async function boot() {
  const { data } = await supabaseClient.auth.getSession();
  if (data && data.session) enterApp(data.session);
  else showGate();
}

function showGate() {
  document.getElementById('gate').style.display = 'flex';
  document.getElementById('app').classList.remove('on');
}

export function enterApp(session) {
  document.getElementById('gate').style.display = 'none';
  document.getElementById('app').classList.add('on');
  state.user = session.user;
  document.getElementById('whoami').textContent = session.user.email || '';
  load();
}

export async function signOut() {
  await supabaseClient.auth.signOut();
  state.leads = [];
  state.sessions = [];
  state.events = [];
  state.user = null;
  state.role = null;
  showGate();
}

/* M6.1: minimal role read, NOT the full M6.2 capability layer. Reads
   the caller's own membership row — already permitted by the
   `memberships self read` RLS policy (Migration 006, live in
   production), no new SQL, no RLS change. Exists only so a view can
   tell "the current user cannot see sessions/analytics_events" apart
   from "there is genuinely no data yet", instead of rendering a
   misleading empty chart. Memoized in state.role once resolved.

   Fails OPEN to 'admin' on any query error or missing row: this is a
   display-only gate, not a security boundary (RLS already enforces
   the real one — if a caller cannot read sessions, the rows come back
   empty regardless of what this function returns). Failing open here
   only protects against ever hiding the current single admin's own
   dashboard behind a transient network hiccup; it grants no additional
   data access either way. */
export async function getRole() {
  if (state.role) return state.role;
  if (!state.user) return null;

  try {
    const { data, error } = await supabaseClient
      .from('memberships')
      .select('role')
      .limit(1)
      .maybeSingle();
    state.role = (!error && data && data.role) ? data.role : 'admin';
  } catch (e) {
    state.role = 'admin';
  }
  return state.role;
}

/* ── Data ─────────────────────────────────────────────────── */

export function since() {
  const el = document.getElementById('periodFilter');
  const days = el ? parseInt(el.value, 10) || 30 : 30;
  return new Date(Date.now() - days * 864e5).toISOString();
}

export async function load() {
  const banner = document.getElementById('banner');
  if (banner) banner.classList.remove('on');

  const from = since();

  /* M6.5b: { count: 'exact' } asks PostgREST to also compute the total
     number of rows matching the filter, independent of .limit() — the
     only way to tell "there are exactly 1000 leads this period" from
     "there are 1000+ and 1000 got cut off" without raising the cap. */
  const [leadsRes, sessionsRes, eventsRes] = await Promise.all([
    supabaseClient.from('leads').select('*', { count: 'exact' }).gte('created_at', from).order('created_at', { ascending: false }).limit(1000),
    supabaseClient.from('sessions').select('*', { count: 'exact' }).gte('created_at', from).order('created_at', { ascending: false }).limit(1000),
    supabaseClient.from('analytics_events').select('*', { count: 'exact' }).gte('created_at', from).order('created_at', { ascending: false }).limit(3000)
  ]);

  if (leadsRes.error) reportError('Leads', leadsRes.error);
  else if (sessionsRes.error) reportError('Sessions', sessionsRes.error);
  else if (eventsRes.error) reportError('Events', eventsRes.error);

  state.leads = leadsRes.data || [];
  state.sessions = sessionsRes.data || [];
  state.events = eventsRes.data || [];

  /* Truncated only when the server says more rows exist than we
     actually received — never inferred just from "length === limit"
     (a period that happens to have exactly 1000 leads and no more is
     not truncated). Falls back to false on error, since leadsRes.count
     is null in that case and typeof null !== 'number'. */
  state.truncated = {
    leads: typeof leadsRes.count === 'number' && leadsRes.count > state.leads.length,
    sessions: typeof sessionsRes.count === 'number' && sessionsRes.count > state.sessions.length,
    events: typeof eventsRes.count === 'number' && eventsRes.count > state.events.length
  };

  document.dispatchEvent(new CustomEvent('larum:data-loaded'));
}

function reportError(what, error) {
  const b = document.getElementById('banner');
  if (!b) return;
  b.innerHTML =
    '<strong>' + esc(what) + ' could not be read.</strong> ' + esc(error.message) +
    (error.code === '42501' || /permission|policy/i.test(error.message || '')
      ? ' — the <code>authenticated</code> read policies are missing. Run <code>docs/supabase-fix-rls.sql</code> in the Supabase SQL editor.'
      : '');
  b.classList.add('on');
}

/* ── Filtering ────────────────────────────────────────────── */

export function propFilter() {
  const el = document.getElementById('propertyFilter');
  return el ? el.value : 'all';
}

export function searchTerm() {
  const el = document.getElementById('search');
  return (el ? el.value : '').trim().toLowerCase();
}

function matchesProp(row) {
  const p = propFilter();
  return p === 'all' || row.property === p;
}

export function filteredLeads() {
  const q = searchTerm();
  return state.leads.filter(l => matchesProp(l) && (!q ||
    [l.name, l.email, l.message, l.interest, (l.concierge_questions || []).join(' ')]
      .filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1));
}

export function filteredSessions() {
  const q = searchTerm();
  return state.sessions.filter(s => matchesProp(s) && (!q ||
    [s.entry_path, (s.scenes_explored || []).join(' '), (s.spaces_explored || []).join(' '),
      Object.keys(s.interests || {}).join(' ')]
      .filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1));
}

export function buildPropertyFilter() {
  const sel = document.getElementById('propertyFilter');
  if (!sel) return;
  const chosen = sel.value;
  const props = Array.from(new Set(
    state.leads.map(l => l.property).concat(state.sessions.map(s => s.property)).filter(Boolean)
  )).sort();
  sel.innerHTML = '<option value="all">All properties</option>' +
    props.map(p => '<option value="' + esc(p) + '">' + esc(p) + '</option>').join('');
  if (props.indexOf(chosen) !== -1) sel.value = chosen;
}

/* ── Lead updates ────────────────────────────────────────── */

export async function updateLead(lead, patch, noteElementId) {
  /* M6.7b: a second independent action (Follow-up) now shares this
     function with the original Advisor-notes save — defaulting to
     'savedNote' keeps every existing caller's behavior byte-identical;
     passing 'savedFollowUp' points the same success/error/conflict
     feedback at that action's own indicator instead, so saving one
     never flashes a misleading "Saved" next to the other. */
  const note = document.getElementById(noteElementId || 'savedNote');
  if (note) note.textContent = 'Saving…';

  /* M6.5a: same compare-and-swap as the 5 property saves in
     admin-property-store.js, keyed on leads.updated_at (migration
     007 — leads had no such column before this). `lead` is the same
     object reference held by whichever list rendered the drawer
     (currentLeads[i] in admin-leads.js / admin-property-leads.js), and
     it gets `updated_at` refreshed in place below on every successful
     save — so reading `lead.updated_at` here is always the freshest
     value this session knows, never a stale snapshot from when the
     drawer first opened. */
  const { data, error } = await supabaseClient
    .from('leads')
    .update(patch)
    .eq('id', lead.id)
    .eq('updated_at', lead.updated_at)
    .select('updated_at');

  if (error) {
    /* M6.4 finding: clearing #savedNote to blank on failure looked
       identical to "nothing happened yet" right next to the button the
       operator just clicked — the real error only showed in the
       page-level #banner, easy to miss from inside a property's
       Leads tab. Now it fails visibly right where the click happened,
       in addition to (not instead of) the banner. */
    if (note) { note.textContent = 'Error — not saved'; note.classList.add('error'); }
    const b = document.getElementById('banner');
    if (b) {
      b.innerHTML = '<strong>The lead could not be updated.</strong> ' + esc(error.message) +
        (/permission|policy|42501/i.test(error.message || '')
          ? ' — the <code>authenticated updates leads</code> policy is missing. Run <code>docs/supabase-fix-rls.sql</code>.'
          : '');
      b.classList.add('on');
    }
    return false;
  }

  /* Zero rows matched: someone else saved this lead since it was
     loaded. PostgREST does not treat this as an error — without this
     check a stale save would look identical to a successful one. */
  if (!data || data.length === 0) {
    if (note) { note.textContent = CONFLICT_MESSAGE; note.classList.add('error'); }
    const b = document.getElementById('banner');
    if (b) {
      b.innerHTML = '<strong>' + esc(CONFLICT_MESSAGE) + '</strong>';
      b.classList.add('on');
    }
    return false;
  }

  /* `id` is the primary key — more than one row matching is expected-
     impossible. Treated as a hard failure, never as silent success. */
  if (data.length > 1) {
    if (note) { note.textContent = 'Error — not saved'; note.classList.add('error'); }
    const b = document.getElementById('banner');
    if (b) {
      b.innerHTML = '<strong>The lead could not be updated.</strong> Integrity error: more than one row matched — investigate before retrying.';
      b.classList.add('on');
    }
    return false;
  }

  if (note) note.classList.remove('error');
  Object.assign(lead, patch);
  lead.updated_at = data[0].updated_at;
  if (note) note.textContent = 'Saved';
  return true;
}

/* ── Helpers (shared across modules) ─────────────────────── */

export function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function cap(s) {
  return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
}

export function minutes(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s < 60) return s + 's';
  return Math.round(s / 60) + 'm';
}

export function fmtOffset(s) {
  const m = Math.floor(s / 60);
  return m > 0 ? m + 'm' + String(s % 60).padStart(2, '0') : s + 's';
}

export function timeAgo(iso) {
  const ts = new Date(iso).getTime();
  if (!ts) return '—';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + ' min ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function fullDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function normaliseInterests(raw) {
  if (!raw) return [];
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
  if (Array.isArray(v)) return v.map(i => [i.interest || i.name || '?', Number(i.strength) || 1]);
  if (typeof v === 'object') return Object.entries(v).map(([k, n]) => [k, Number(n) || 1]);
  return [];
}

/* M6.7b — Follow-up. `leads.follow_up_date` is a plain DATE ('YYYY-MM-DD',
   no time/timezone) — parsed with an explicit local midnight so the
   comparison against "today" never shifts a day off in western
   timezones the way `new Date('YYYY-MM-DD')` alone would (that form
   parses as UTC midnight). */
export function followUpStatus(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  if (d.getTime() < today.getTime()) return 'overdue';
  if (d.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

export function plainDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function leadForSession(id) {
  return state.leads.find(l => l.session_id && l.session_id === id) || null;
}

export function sessionForLead(lead) {
  return lead.session_id ? state.sessions.find(s => s.id === lead.session_id) || null : null;
}

export function eventsFor(sessionId) {
  if (!sessionId) return [];
  return state.events.filter(e => e.session_id === sessionId)
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

/* ── Lead change history (M6.6a) ──────────────────────────────
   Reads public.lead_history (migration 008, M6.5c) — RLS already
   scopes this correctly per caller (agent: only their own leads;
   admin: their whole org), so this makes no role check of its own.
   Not bulk-loaded into `state` like leads/sessions/events — a lead's
   history is only ever needed once its drawer is open, so it's
   fetched on demand. */
export async function loadLeadHistory(leadId) {
  const { data, error } = await supabaseClient
    .from('lead_history')
    .select('*')
    .eq('lead_id', leadId)
    .order('changed_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

/* changed_by is a bare auth.users.id (migration 008) — there is no
   admin roster to resolve names from (only agents have a name field
   linked to an auth_user_id), so resolution is necessarily partial:
   the viewer's own edits ("You"), edits by an agent this viewer's own
   RLS can see (their own row for an agent, the whole org for an
   admin), or a generic "Admin" fallback for anything else — most
   commonly an admin account, which has no separate name to show. NULL
   means the row was written outside the app (an elevated key, e.g. the SQL Editor
   — see migration 008's own comment) and is labeled "System". */
let agentDirectory = null; // Map<auth_user_id, name> — lazy, session-lifetime cache

export async function ensureAgentDirectory() {
  if (agentDirectory) return agentDirectory;
  agentDirectory = new Map();
  try {
    const agents = await loadAllAgents();
    for (const a of agents) if (a.auth_user_id) agentDirectory.set(a.auth_user_id, a.name);
  } catch (e) {
    // Non-fatal — actorLabel() below just falls back to generic labels.
  }
  return agentDirectory;
}

export function actorLabel(changedBy) {
  if (!changedBy) return 'System';
  if (state.user && changedBy === state.user.id) return 'You';
  const name = agentDirectory && agentDirectory.get(changedBy);
  return name || 'Admin';
}
