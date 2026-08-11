/* ── Larum Admin · Core ─────────────────────────────────────────
   Auth gate, Supabase session, data loading, shared state.
   Every module reads from the shared stores; only this module
   writes to them.
   ───────────────────────────────────────────────────────────── */

export const state = {
  leads: [],
  sessions: [],
  events: [],
  view: 'dashboard',
  current: null,
  user: null
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
  showGate();
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

  const [leadsRes, sessionsRes, eventsRes] = await Promise.all([
    supabaseClient.from('leads').select('*').gte('created_at', from).order('created_at', { ascending: false }).limit(1000),
    supabaseClient.from('sessions').select('*').gte('created_at', from).order('created_at', { ascending: false }).limit(1000),
    supabaseClient.from('analytics_events').select('*').gte('created_at', from).order('created_at', { ascending: false }).limit(3000)
  ]);

  if (leadsRes.error) reportError('Leads', leadsRes.error);
  else if (sessionsRes.error) reportError('Sessions', sessionsRes.error);
  else if (eventsRes.error) reportError('Events', eventsRes.error);

  state.leads = leadsRes.data || [];
  state.sessions = sessionsRes.data || [];
  state.events = eventsRes.data || [];

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

export async function updateLead(lead, patch) {
  const note = document.getElementById('savedNote');
  if (note) note.textContent = 'Saving…';

  const { error } = await supabaseClient.from('leads').update(patch).eq('id', lead.id);

  if (error) {
    if (note) note.textContent = '';
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

  Object.assign(lead, patch);
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
