/* ── Larum Property Experience™ — Analytics & Interest Engine (V2) ── */
/* Consent-first. Nothing leaves the browser until the visitor accepts.
   Once accepted, the visit is mirrored to Supabase so it survives the tab
   being closed: one row in `sessions` (upserted as the visit progresses)
   and one row per interaction in `analytics_events`, linked by session_id.
   localStorage stays as the local truth and as the offline fallback. */

const LarumAnalytics = (() => {
  'use strict';

  const STORAGE_KEY = 'larum_px_v2';
  const SESSION_KEY = 'larum_sid_v1';
  const DURATION_KEY = 'larum_sdur_v1';

  /* Cadences. Slow enough to be invisible, fast enough that a visitor who
     closes the tab abruptly loses seconds, not the visit. */
  const EVENT_FLUSH_MS = 5000;
  const EVENT_BATCH_MAX = 20;
  const SESSION_FLUSH_MS = 20000;
  const HEARTBEAT_MS = 10000;
  const IDLE_CUTOFF_MS = 90000; /* no interaction for this long → stop counting */

  let state = {
    property: null,
    lang: 'en',
    events: [],
    chapters: {},
    scenes: {},
    spaces: {},
    conciergeQuestions: [],
    interests: {},
    documents: {},
    calculatorUsed: false,
    filmWatched: false,
    enquirySent: false,
    entryPath: '',
    interestScores: {},
    questionCount: 0,
    qualified: false,
    startTime: null,
    lastActivity: null
  };

  let consentGiven = false;
  let consentDenied = false;
  let queue = []; /* buffer events before consent */

  /* ── Remote state ── */
  let sessionId = null;
  let sessionSeconds = 0;
  let sessionDirty = false;
  let outbox = [];          /* event rows waiting to be written */
  let timers = { event: null, session: null, beat: null };
  let lastBeat = Date.now();
  let remoteDisabled = false;
  let remoteWarned = false;
  let listenersBound = false;

  /* ════════════════════════════════════════════════════════════
     LIFECYCLE
     ════════════════════════════════════════════════════════════ */

  /* Called again on every render (language switch, property switch), so it
     has to be idempotent: only a genuine property change starts a new visit. */
  function init(property, lang) {
    const sameVisit = state.property === property && sessionId !== null;

    state.lang = lang;
    if (sameVisit) {
      sessionDirty = true;
      return;
    }

    /* Switching property closes the previous session cleanly. */
    if (state.property && state.property !== property) flush();

    state.property = property;
    state.startTime = Date.now();
    state.lastActivity = Date.now();

    readConsent();
    loadPersisted();

    sessionId = resolveSessionId(property);
    sessionSeconds = readSessionSeconds();
    lastBeat = Date.now();

    bindUnloadListeners();
    startTimers();

    if (consentGiven) {
      flushQueue();
      sessionDirty = true;
      pushSession();
    }
  }

  function readConsent() {
    try {
      const saved = localStorage.getItem('larum_consent_v1');
      if (saved === 'accepted') consentGiven = true;
      if (saved === 'rejected') consentDenied = true;
    } catch (e) { /* ignore */ }
  }

  function loadPersisted() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_' + state.property);
      if (saved) {
        const parsed = JSON.parse(saved);
        state = { ...state, ...parsed, startTime: Date.now() };
      }
    } catch (e) { /* ignore */ }
  }

  function persist() {
    try {
      const toSave = { ...state };
      delete toSave.startTime;
      localStorage.setItem(STORAGE_KEY + '_' + state.property, JSON.stringify(toSave));
    } catch (e) { /* ignore */ }
  }

  /* One session per tab per property: a reload continues the same visit,
     a second tab is a second visitor as far as the advisor is concerned. */
  function resolveSessionId(property) {
    const key = SESSION_KEY + '_' + property;
    try {
      let sid = sessionStorage.getItem(key);
      if (!sid) {
        sid = uuid();
        sessionStorage.setItem(key, sid);
      }
      return sid;
    } catch (e) {
      return uuid();
    }
  }

  function uuid() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { /* ignore */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /* Duration is per session, not per visitor: the persisted profile of a
     returning visitor must not inflate today's visit. */
  function readSessionSeconds() {
    try {
      const raw = sessionStorage.getItem(DURATION_KEY + '_' + sessionId);
      return raw ? parseInt(raw, 10) || 0 : 0;
    } catch (e) { return 0; }
  }

  function writeSessionSeconds() {
    try { sessionStorage.setItem(DURATION_KEY + '_' + sessionId, String(sessionSeconds)); } catch (e) {}
  }

  function startTimers() {
    if (timers.beat) return;
    timers.beat = setInterval(heartbeat, HEARTBEAT_MS);
    timers.event = setInterval(() => pushEvents(false), EVENT_FLUSH_MS);
    timers.session = setInterval(() => { if (sessionDirty) pushSession(); }, SESSION_FLUSH_MS);
  }

  /* `force` counts the last stretch on the way out: by the time pagehide or
     visibilitychange fires, the tab is already hidden, and those seconds were
     as real as any other. */
  function heartbeat(force) {
    const now = Date.now();
    const elapsed = Math.round((now - lastBeat) / 1000);
    lastBeat = now;
    const visible = force || typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const active = now - (state.lastActivity || now) < IDLE_CUTOFF_MS;
    if (visible && active && elapsed > 0 && elapsed < 120) {
      sessionSeconds += elapsed;
      writeSessionSeconds();
      sessionDirty = true;
    }
  }

  function bindUnloadListeners() {
    if (listenersBound || typeof window === 'undefined') return;
    listenersBound = true;
    /* pagehide is the only unload event iOS Safari reliably fires. */
    window.addEventListener('pagehide', () => flush(), { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  /* ════════════════════════════════════════════════════════════
     CONSENT
     ════════════════════════════════════════════════════════════ */

  function grantConsent() {
    consentGiven = true;
    consentDenied = false;
    flushQueue();
    sessionDirty = true;
    pushSession();
  }

  /* Declined: drop what was buffered and stop buffering. The experience keeps
     working, the local profile keeps working, nothing is ever transmitted. */
  function denyConsent() {
    consentDenied = true;
    consentGiven = false;
    queue = [];
    outbox = [];
  }

  function flushQueue() {
    if (queue.length === 0) return;
    const buffered = queue.slice();
    queue = [];
    buffered.forEach(e => trackInternal(e.type, e.data));
  }

  /* ════════════════════════════════════════════════════════════
     TRACKING
     ════════════════════════════════════════════════════════════ */

  function track(type, data) {
    if (consentDenied) return;
    if (!consentGiven) {
      queue.push({ type, data });
      return;
    }
    trackInternal(type, data);
  }

  function trackInternal(type, data) {
    state.lastActivity = Date.now();
    const event = {
      type,
      data,
      property: state.property,
      lang: state.lang,
      ts: Date.now()
    };
    state.events.push(event);

    switch (type) {
      case 'chapter_enter':
        state.chapters[data.name] = (state.chapters[data.name] || 0) + 1;
        break;
      case 'scene_open':
        state.scenes[data.name] = (state.scenes[data.name] || 0) + 1;
        break;
      case 'space_open':
        state.spaces[data.name] = (state.spaces[data.name] || 0) + 1;
        break;
      case 'concierge_question':
        state.conciergeQuestions.push({
          q: data.question,
          intentId: data.intentId || null,
          ts: Date.now()
        });
        state.questionCount++;
        if (data.interests) detectInterests(data.interests);
        break;
      case 'document_request':
        state.documents[data.name] = (state.documents[data.name] || 0) + 1;
        break;
      case 'calculator_use':
        state.calculatorUsed = true;
        break;
      case 'film_watch':
        state.filmWatched = true;
        break;
      case 'enquiry':
        state.enquirySent = true;
        break;
      case 'entry_path':
        state.entryPath = data.path;
        break;
      case 'interest_signal':
        detectInterests(data.interests || {});
        break;
    }

    persist();
    enqueueRemote(type, data);
  }

  function detectInterests(signals) {
    if (!signals) return;
    if (!state.interestScores) state.interestScores = {};
    for (const [key, weight] of Object.entries(signals)) {
      state.interestScores[key] = (state.interestScores[key] || 0) + (weight || 1);
    }
  }

  /* ════════════════════════════════════════════════════════════
     REMOTE — Supabase (PostgREST over plain fetch)

     Raw fetch rather than supabase-js: the unload write needs `keepalive`,
     which the client library does not expose, and an analytics write that
     dies with the tab is the exact failure this module exists to remove.
     ════════════════════════════════════════════════════════════ */

  function remoteReady() {
    return !remoteDisabled &&
      typeof window !== 'undefined' &&
      !!window.SUPABASE_URL &&
      !!window.SUPABASE_ANON_KEY &&
      typeof fetch === 'function';
  }

  function sbWrite(path, body, prefer, keepalive) {
    const url = window.SUPABASE_URL + '/rest/v1/' + path;
    const payload = JSON.stringify(body);
    const init = {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: prefer || 'return=minimal'
      },
      body: payload
    };
    if (keepalive) init.keepalive = true;
    return fetch(url, init).then(res => {
      if (!res.ok) return res.text().then(t => { throw new Error(res.status + ' ' + t); });
      return true;
    });
  }

  /* A blocked or misconfigured database must never turn into a console flood
     or into traffic on every interaction. One clear warning, then silence. */
  function remoteFailed(what, err) {
    const msg = String((err && err.message) || err);
    if (!remoteWarned) {
      remoteWarned = true;
      console.warn(
        '[Larum] Analytics not reaching Supabase (' + what + '):', msg,
        msg.indexOf('42501') !== -1 || msg.indexOf('row-level security') !== -1
          ? '\nRow-level security is blocking anon inserts. Run docs/supabase-fix-rls.sql in the Supabase SQL editor.'
          : ''
      );
    }
    if (msg.indexOf('42501') !== -1 || msg.indexOf('401') === 0 || msg.indexOf('403') === 0) {
      remoteDisabled = true; /* it will not start working within this visit */
      outbox = [];
    }
  }

  function enqueueRemote(type, data) {
    if (!remoteReady()) return;
    outbox.push({
      session_id: sessionId,
      property: state.property,
      lang: state.lang,
      event_type: type,
      event_data: data || {}
    });
    sessionDirty = true;
    if (outbox.length >= EVENT_BATCH_MAX) pushEvents(false);
    /* An enquiry is the one event worth a round trip of its own. */
    if (type === 'enquiry') { pushEvents(false); pushSession(); }
  }

  function pushEvents(keepalive) {
    if (!remoteReady() || outbox.length === 0) return Promise.resolve(false);
    const batch = outbox.slice();
    outbox = [];
    return sbWrite('analytics_events', batch, 'return=minimal', keepalive)
      .catch(err => {
        remoteFailed('events', err);
        /* Keep them for the next attempt unless remote is off for good. */
        if (!remoteDisabled) outbox = batch.concat(outbox);
        return false;
      });
  }

  function buildSessionRow() {
    return {
      id: sessionId,
      property: state.property,
      lang: state.lang,
      entry_path: state.entryPath || null,
      duration_seconds: sessionSeconds,
      chapters_visited: Object.keys(state.chapters || {}),
      scenes_explored: getVisitedScenes(),
      spaces_explored: getVisitedSpaces(),
      concierge_questions: state.questionCount || 0,
      interests: state.interestScores || {},
      calculator_used: !!state.calculatorUsed,
      film_watched: !!state.filmWatched,
      enquiry_sent: !!state.enquirySent,
      qualified: isQualified(),
      consent_given: true
    };
  }

  /* Upsert on the primary key: the same row is rewritten as the visit grows,
     so a visitor is one row whether they stayed ten seconds or ten minutes. */
  function pushSession(keepalive) {
    if (!remoteReady() || !consentGiven || !sessionId) return Promise.resolve(false);
    sessionDirty = false;
    return sbWrite(
      'sessions?on_conflict=id',
      [buildSessionRow()],
      'return=minimal,resolution=merge-duplicates',
      keepalive
    ).catch(err => {
      remoteFailed('session', err);
      sessionDirty = true;
      return false;
    });
  }

  /* Last chance to write before the tab goes. Someone alt-tabbing back and
     forth should not generate a write per switch, so only what changed goes. */
  function flush() {
    if (!consentGiven) return;
    heartbeat(true);
    if (outbox.length) pushEvents(true);
    if (sessionDirty) pushSession(true);
  }

  /* ════════════════════════════════════════════════════════════
     DERIVED VIEWS
     ════════════════════════════════════════════════════════════ */

  function getTopInterests(n) {
    n = n || 3;
    const sorted = Object.entries(state.interestScores || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
    return sorted;
  }

  function getVisitedScenes() {
    return Object.keys(state.scenes || {});
  }

  function getVisitedSpaces() {
    return Object.keys(state.spaces || {});
  }

  function getChaptersProgress() {
    return Object.keys(state.chapters || {});
  }

  function isQualified() {
    return state.questionCount >= 3 || Object.keys(state.interestScores || {}).length >= 2;
  }

  function shouldQualify(trigger) {
    if (trigger === 'after_3_questions' && state.questionCount === 3) return true;
    if (trigger === 'interest_detected' && !state.qualified && Object.keys(state.interestScores || {}).length >= 2) {
      state.qualified = true;
      return true;
    }
    if (trigger === 'high_intent' && isQualified()) return true;
    return false;
  }

  function buildAdvisorSummary() {
    const visited = getVisitedScenes();
    const spaces = getVisitedSpaces();
    const topInterests = getTopInterests(5);
    /* Prefer the measured session time; fall back to wall clock. */
    const duration = sessionSeconds
      ? Math.max(1, Math.round(sessionSeconds / 60))
      : (state.lastActivity && state.startTime
        ? Math.round((state.lastActivity - state.startTime) / 60000)
        : 0);

    const summary = {
      property: state.property,
      lang: state.lang,
      sessionId: sessionId,
      durationMinutes: duration,
      entryPath: state.entryPath || null,
      chaptersVisited: getChaptersProgress(),
      scenesExplored: visited,
      spacesExplored: spaces,
      conciergeQuestions: state.conciergeQuestions.map(q => q.q),
      detectedInterests: topInterests.map(([k, v]) => ({ interest: k, strength: v })),
      documentsRequested: Object.keys(state.documents || {}),
      calculatorUsed: state.calculatorUsed,
      filmWatched: state.filmWatched,
      totalQuestions: state.questionCount,
      qualified: isQualified(),
      timestamp: new Date().toISOString()
    };

    return summary;
  }

  function buildContextualEnquiry() {
    const scenes = getVisitedScenes();
    const spaces = getVisitedSpaces();
    const topInterests = getTopInterests(3);
    const parts = [];

    if (state.entryPath) {
      parts.push(`Entry: ${state.entryPath}`);
    }
    if (scenes.length) {
      parts.push(`Scenes: ${scenes.join(', ')}`);
    }
    if (spaces.length) {
      parts.push(`Spaces: ${spaces.join(', ')}`);
    }
    if (topInterests.length) {
      parts.push(`Interests: ${topInterests.map(([k]) => k.replace('_', ' ')).join(', ')}`);
    }
    if (state.calculatorUsed) {
      parts.push('Calculator: used');
    }
    if (state.filmWatched) {
      parts.push('Film: watched');
    }

    return parts.join(' · ');
  }

  function reset() {
    const prop = state.property;
    const lang = state.lang;
    try { localStorage.removeItem(STORAGE_KEY + '_' + prop); } catch (e) {}
    try { sessionStorage.removeItem(SESSION_KEY + '_' + prop); } catch (e) {}
    try { sessionStorage.removeItem(DURATION_KEY + '_' + sessionId); } catch (e) {}
    state = {
      property: prop, lang, events: [], chapters: {}, scenes: {}, spaces: {},
      conciergeQuestions: [], interests: {}, documents: {}, calculatorUsed: false,
      filmWatched: false, enquirySent: false, entryPath: '', interestScores: {},
      questionCount: 0, qualified: false, startTime: Date.now(), lastActivity: Date.now()
    };
    sessionId = resolveSessionId(prop);
    sessionSeconds = 0;
    outbox = [];
  }

  function debug() {
    return {
      state: JSON.parse(JSON.stringify(state)),
      summary: buildAdvisorSummary(),
      context: buildContextualEnquiry(),
      remote: {
        sessionId,
        sessionSeconds,
        consentGiven,
        consentDenied,
        enabled: remoteReady(),
        pendingEvents: outbox.length
      }
    };
  }

  return {
    init, track, grantConsent, denyConsent, persist, flush,
    getTopInterests, getVisitedScenes, getVisitedSpaces, getChaptersProgress,
    isQualified, shouldQualify, buildAdvisorSummary, buildContextualEnquiry,
    reset, debug,
    getSessionId() { return sessionId; },
    get state() { return state; }
  };
})();

window.LarumAnalytics = LarumAnalytics;
