/* ── Larum Agent Page — Lightweight Analytics ──────────────────
   Tracks visits and interactions on the public agent page.
   Writes to the same sessions/analytics_events tables as the
   property experience, using property='agent:{slug}' to
   distinguish agent page visits from property page visits.

   Uses plain INSERT for the session (created once) and events.
   Duration is tracked via a 'session_end' event on page unload.
   No session updates — anon has no SELECT policy so PostgREST
   PATCH finds no rows, and upsert (ON CONFLICT) also fails RLS.
   ───────────────────────────────────────────────────────────── */

const HEARTBEAT_MS = 15000;

let sessionId = null;
let slug = null;
let lang = 'en';
let duration = 0;
let lastBeat = 0;
let events = [];
let beatTimer = null;
let bound = false;
let sessionCreated = false;

function uuid() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function ready() {
  return typeof window !== 'undefined' && !!window.SUPABASE_URL && !!window.SUPABASE_ANON_KEY;
}

function sbPost(path, body, keepalive) {
  return fetch(window.SUPABASE_URL + '/rest/v1/' + path, {
    method: 'POST',
    headers: {
      apikey: window.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(body),
    keepalive: !!keepalive
  }).catch(() => {});
}

function propertyKey() {
  return 'agent:' + slug;
}

function resolveSession() {
  const key = 'larum_agent_sid_' + slug;
  try {
    let sid = sessionStorage.getItem(key);
    if (sid) { sessionCreated = true; return sid; }
    sid = uuid();
    sessionStorage.setItem(key, sid);
    return sid;
  } catch (e) { return uuid(); }
}

export function init(agentSlug, language) {
  if (!agentSlug || !ready()) return;
  slug = agentSlug;
  lang = language || 'en';
  sessionId = resolveSession();
  lastBeat = Date.now();
  duration = 0;

  if (!beatTimer) beatTimer = setInterval(heartbeat, HEARTBEAT_MS);

  if (!bound) {
    bound = true;
    window.addEventListener('pagehide', () => flushEnd(true), { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushEnd(true);
    });
  }

  if (!sessionCreated) {
    sessionCreated = true;
    sbPost('sessions', [{
      id: sessionId,
      property: propertyKey(),
      lang,
      duration_seconds: 0,
      chapters_visited: [],
      scenes_explored: [],
      spaces_explored: [],
      concierge_questions: 0,
      interests: {},
      calculator_used: false,
      film_watched: false,
      enquiry_sent: false,
      qualified: false,
      consent_given: true
    }], false);
  }

  trackEvent('page_view', { slug });
}

function heartbeat() {
  const now = Date.now();
  const elapsed = Math.round((now - lastBeat) / 1000);
  lastBeat = now;
  if (document.visibilityState !== 'hidden' && elapsed > 0 && elapsed < 120) {
    duration += elapsed;
  }
}

export function trackEvent(type, data) {
  if (!sessionId || !ready()) return;
  events.push({
    session_id: sessionId,
    property: propertyKey(),
    lang,
    event_type: type,
    event_data: data || {}
  });
}

function pushEvents(keepalive) {
  if (!ready() || events.length === 0) return;
  const batch = events.slice();
  events = [];
  sbPost('analytics_events', batch, keepalive);
}

function flushEnd(keepalive) {
  heartbeat();
  if (duration > 0) {
    trackEvent('session_end', { duration_seconds: duration });
  }
  pushEvents(keepalive);
}
