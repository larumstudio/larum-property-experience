/* ── Larum Admin · Concierge History (M5.5b) ──────────────────
   Read-only viewer of concierge conversations for the current
   property. Two subtabs: History (this milestone) and Knowledge
   (placeholder for M5.5c, visibly disabled).

   Zero writes. No API/RLS/schema changes. Filters conversations
   by property_slug — every row today has property_id = null
   because api/_data.mjs upsertConversation does not resolve the
   slug to a UUID. When it does, extend the filter to include
   property_id without breaking this one.
   ───────────────────────────────────────────────────────────── */

import { esc } from './admin-core.js';

const PAGE_SIZE = 20;

let containerRef = null;
let currentSlug = null;
let clickHandler = null;

const state = {
  loading: false,
  error: null,
  total: 0,
  list: [],
  expandedId: null,
  messages: {},
  msgLoading: {},
  msgError: {}
};

export function render(container, property) {
  if (containerRef && containerRef !== container) unbind(containerRef);
  containerRef = container;
  currentSlug = property.slug;

  state.loading = true;
  state.error = null;
  state.total = 0;
  state.list = [];
  state.expandedId = null;
  state.messages = {};
  state.msgLoading = {};
  state.msgError = {};

  bind(container);
  draw();
  loadFirstPage();
}

export function teardown() {
  if (containerRef) unbind(containerRef);
  containerRef = null;
  currentSlug = null;
  state.list = [];
  state.messages = {};
  state.msgLoading = {};
  state.msgError = {};
}

/* Event delegation lives on containerRef itself: one listener per mount,
   removed in teardown. Never touches window, so an ad-hoc extra mount
   torn down cannot break the primary mount's buttons. */
function bind(container) {
  if (clickHandler) container.removeEventListener('click', clickHandler);
  clickHandler = (e) => {
    const el = e.target.closest('[data-co-action]');
    if (!el || !container.contains(el)) return;
    const action = el.getAttribute('data-co-action');
    if (action === 'toggle') toggleExpand(el.getAttribute('data-co-id'));
    else if (action === 'load-more') loadMore();
  };
  container.addEventListener('click', clickHandler);
}

function unbind(container) {
  if (clickHandler) container.removeEventListener('click', clickHandler);
  clickHandler = null;
}

/* ── Data loading ─────────────────────────────────────────── */

async function loadFirstPage() {
  const slug = currentSlug;
  const sb = window.supabaseClient;
  if (!sb) {
    state.loading = false;
    state.error = 'Supabase client not available.';
    draw();
    return;
  }

  try {
    const [countRes, pageRes] = await Promise.all([
      sb.from('concierge_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('property_slug', slug),
      sb.from('concierge_conversations')
        .select('id, created_at, session_id, lang, message_count, total_cost_usd')
        .eq('property_slug', slug)
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1)
    ]);

    if (slug !== currentSlug) return;

    if (countRes.error) throw countRes.error;
    if (pageRes.error) throw pageRes.error;

    state.total = countRes.count || 0;
    state.list = pageRes.data || [];
    state.loading = false;
    state.error = null;
  } catch (e) {
    if (slug !== currentSlug) return;
    state.loading = false;
    state.error = e.message || 'Failed to load conversations.';
  }
  draw();
}

async function loadMore() {
  const slug = currentSlug;
  const sb = window.supabaseClient;
  if (!sb) return;
  const offset = state.list.length;
  if (offset >= state.total) return;

  state.loading = true;
  draw();

  try {
    const { data, error } = await sb.from('concierge_conversations')
      .select('id, created_at, session_id, lang, message_count, total_cost_usd')
      .eq('property_slug', slug)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (slug !== currentSlug) return;
    if (error) throw error;
    state.list = state.list.concat(data || []);
    state.loading = false;
  } catch (e) {
    if (slug !== currentSlug) return;
    state.loading = false;
    state.error = e.message || 'Failed to load more.';
  }
  draw();
}

async function loadMessages(convId) {
  const slug = currentSlug;
  const sb = window.supabaseClient;
  if (!sb) return;

  state.msgLoading[convId] = true;
  state.msgError[convId] = null;
  draw();

  try {
    const { data, error } = await sb.from('concierge_messages')
      .select('id, created_at, role, content, confidence, interests, source, usage')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (slug !== currentSlug) return;
    if (error) throw error;
    state.messages[convId] = data || [];
    state.msgLoading[convId] = false;
  } catch (e) {
    if (slug !== currentSlug) return;
    state.msgLoading[convId] = false;
    state.msgError[convId] = e.message || 'Failed to load messages.';
  }
  draw();
}

function toggleExpand(convId) {
  if (state.expandedId === convId) {
    state.expandedId = null;
    draw();
    return;
  }
  state.expandedId = convId;
  if (!state.messages[convId] && !state.msgLoading[convId]) {
    loadMessages(convId);
    return;
  }
  draw();
}

/* ── Rendering ────────────────────────────────────────────── */

function draw() {
  if (!containerRef) return;
  containerRef.innerHTML =
    '<div class="co">' +
      subtabsHtml() +
      bodyHtml() +
    '</div>';
}

function subtabsHtml() {
  const count = state.total ? ' <span class="co-count">(' + state.total + ')</span>' : '';
  return (
    '<div class="co-subtabs" role="tablist" aria-label="Concierge subtabs">' +
      '<button class="co-subtab co-subtab-active" role="tab" aria-selected="true">' +
        'History' + count +
      '</button>' +
      '<span class="co-subtab co-subtab-disabled" role="tab" aria-selected="false" aria-disabled="true">' +
        'Knowledge<span class="co-subtab-note">Coming in M5.5c</span>' +
      '</span>' +
    '</div>'
  );
}

function bodyHtml() {
  if (state.loading && state.list.length === 0) {
    return '<div class="co-status">Loading conversations…</div>';
  }
  if (state.error && state.list.length === 0) {
    return '<div class="co-error">' + esc(state.error) + '</div>';
  }
  if (state.list.length === 0) {
    return emptyHtml();
  }

  const header =
    '<div class="co-header">' +
      '<span>Showing ' + state.list.length + ' of ' + state.total + '</span>' +
    '</div>';

  const rows = '<div class="co-list">' + state.list.map(rowHtml).join('') + '</div>';

  const more = state.list.length < state.total
    ? '<div class="co-load-more">' +
        '<button class="btn btn-outline" data-co-action="load-more"' +
          (state.loading ? ' disabled' : '') + '>' +
          (state.loading ? 'Loading…' : 'Load ' + Math.min(PAGE_SIZE, state.total - state.list.length) + ' more') +
        '</button>' +
      '</div>'
    : '';

  const errBanner = state.error && state.list.length > 0
    ? '<div class="co-error">' + esc(state.error) + '</div>'
    : '';

  return header + rows + more + errBanner;
}

function emptyHtml() {
  return (
    '<div class="co-empty">' +
      '<div class="co-empty-title">No concierge conversations yet for this property</div>' +
      '<div class="co-empty-text">Turns appear here as visitors chat with the concierge.</div>' +
    '</div>'
  );
}

function rowHtml(conv) {
  const isOpen = state.expandedId === conv.id;
  const sid = conv.session_id ? (String(conv.session_id).slice(0, 8) + '…') : '—';
  const msgs = Number(conv.message_count) || 0;
  const cost = formatCost(conv.total_cost_usd);
  const lang = (conv.lang || 'en').toUpperCase();

  const head =
    '<button class="co-row-head" type="button" data-co-action="toggle" data-co-id="' + esc(conv.id) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
      '<span class="co-chevron' + (isOpen ? ' co-chevron-open' : '') + '">▸</span>' +
      '<span class="co-session" title="' + esc(String(conv.session_id || '')) + '">' + esc(sid) + '</span>' +
      '<span class="co-date">' + esc(formatDateTime(conv.created_at)) + '</span>' +
      '<span class="co-pill">' + msgs + ' ' + (msgs === 1 ? 'msg' : 'msgs') + '</span>' +
      '<span class="co-pill co-pill-cost">' + esc(cost) + '</span>' +
      '<span class="co-pill co-pill-lang">' + esc(lang) + '</span>' +
    '</button>';

  const body = isOpen ? expandedHtml(conv) : '';

  return '<div class="co-row">' + head + body + '</div>';
}

function expandedHtml(conv) {
  const id = conv.id;
  if (state.msgLoading[id]) {
    return '<div class="co-expanded"><div class="co-status">Loading messages…</div></div>';
  }
  if (state.msgError[id]) {
    return '<div class="co-expanded"><div class="co-error">' + esc(state.msgError[id]) + '</div></div>';
  }
  const msgs = state.messages[id] || [];
  if (!msgs.length) {
    return '<div class="co-expanded"><div class="co-status">No messages in this conversation.</div></div>';
  }
  return '<div class="co-expanded">' + msgs.map(messageHtml).join('') + '</div>';
}

function messageHtml(m) {
  const isAssistant = m.role === 'assistant';
  const cls = 'co-msg' + (isAssistant ? ' co-msg-assistant' : ' co-msg-user');
  const roleLabel = isAssistant ? 'Concierge' : 'Visitor';

  const headBits = [];
  headBits.push('<span class="co-msg-role">' + esc(roleLabel) + '</span>');
  if (isAssistant && m.confidence) headBits.push('<span>' + esc(m.confidence) + '</span>');
  if (m.source) headBits.push('<span>' + esc(m.source) + '</span>');
  if (isAssistant && m.usage && typeof m.usage.costUSD === 'number') {
    headBits.push('<span>' + esc(formatCost(m.usage.costUSD)) + '</span>');
  }
  headBits.push('<span>' + esc(formatClock(m.created_at)) + '</span>');

  const interests = Array.isArray(m.interests) && m.interests.length
    ? '<div class="co-msg-interests">interests: ' + m.interests.map(esc).join(', ') + '</div>'
    : '';

  return (
    '<div class="' + cls + '">' +
      '<div class="co-msg-head">' + headBits.join(' · ') + '</div>' +
      '<div class="co-msg-body">' + esc(m.content || '') + '</div>' +
      interests +
    '</div>'
  );
}

/* ── Formatters ───────────────────────────────────────────── */

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat('en-GB', { month: 'short', day: '2-digit' }).format(d);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return date + ' · ' + hh + ':' + mm;
  } catch (e) {
    return String(iso).slice(0, 16);
  }
}

function formatClock(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0') + ':' +
           String(d.getSeconds()).padStart(2, '0');
  } catch (e) {
    return '';
  }
}

function formatCost(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return '$0.00';
  if (n < 0.005) return '<$0.01';
  return '$' + n.toFixed(3);
}
