/* ── Larum — Concierge data layer ─────────────────────────────────────
   Everything the concierge needs from Supabase, isolated so the handler
   stays focused on prompting the model.

   Two responsibilities:

   1 · Serve the property dossier. Reads properties from Supabase with a
       short in-memory cache; falls back to the bundled PACK if the
       database is unreachable — the concierge must never go silent.

   2 · Persist the conversation. One row in concierge_conversations per
       (session_id, property_slug), and one row per turn in
       concierge_messages. Fire-and-forget from the handler's point of
       view: a database write must never delay the visitor's reply, and
       must never turn a working turn into a 500.
   ─────────────────────────────────────────────────────────────────── */

import { PACK } from './_pack.mjs';

const SB_URL = process.env.SUPABASE_URL || 'https://mtyemgfovvmjrsxevcgh.supabase.co';

/* Two credentials, two purposes, kept apart on purpose.

   PUBLIC (anon) — reads the published property dossier. Row-level security
   already restricts it to `status = 'published'`, so this key is safe to
   embed as a fallback if the env var is missing. The browser bundle uses
   the same key for the same reads; nothing here escalates that trust.

   PRIVILEGED (service_role) — writes to concierge_conversations and
   concierge_messages. RLS on those tables gives anon INSERT only, no
   SELECT, which is why the previous anon+return=representation upsert
   failed under RLS (401 / 42501). service_role bypasses RLS, so the
   handler can read back the conversation id and its running counters in
   one round trip without opening SELECT to the public.

   The service_role key MUST NEVER reach the browser. It lives only in
   process.env on the serverless function, is never returned in any API
   response, and has no fallback literal — if the env var is missing,
   persistence is skipped rather than falling back to an unsafe default. */
const SB_ANON = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eWVtZ2ZvdnZtanJzeGV2Y2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjgyMzUsImV4cCI6MjEwMTgwNDIzNX0.MT7Yy2rkEuVDR8jihtwkBw3bRlMGQT-DmaovuzLAIYo';
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

const DOSSIER_TTL_MS = 60_000;

/* Cache lives on the container. Cold starts warm it back up on the first
   question, and a warm container serves the next visitor with no fetch. */
const dossierCache = new Map();  // slug → { at, dossier, source }

/* Warn once per cold container if the service_role key is absent — otherwise
   every turn logs the same line. */
let warnedNoServiceKey = false;
function serviceKeyReady() {
  if (SB_SERVICE) return true;
  if (!warnedNoServiceKey) {
    warnedNoServiceKey = true;
    console.warn('[concierge] SUPABASE_SERVICE_ROLE_KEY not set — persistence disabled');
  }
  return false;
}

function anonHeaders(extra) {
  return Object.assign({
    apikey: SB_ANON,
    Authorization: 'Bearer ' + SB_ANON,
    'Content-Type': 'application/json'
  }, extra || {});
}

function privilegedHeaders(extra) {
  return Object.assign({
    apikey: SB_SERVICE,
    Authorization: 'Bearer ' + SB_SERVICE,
    'Content-Type': 'application/json'
  }, extra || {});
}

/* Slim the row down to what buildDossierPrompt actually reads. Cutting
   the payload also means a stale cache uses less memory. */
function extractDossier(row) {
  if (!row || !row.content || !row.knowledge) return null;
  return {
    content: {
      label: row.content.label,
      brand: row.content.brand,
      title: row.content.title,
      subtitle: row.content.subtitle,
      intro: row.content.intro,
      shortRef: row.content.shortRef,
      facts: row.content.facts,
      sequences: row.content.sequences,
      dna: row.content.dna,
      setting: row.content.setting
    },
    knowledge: {
      property: row.knowledge.property,
      surroundings: row.knowledge.surroundings
    }
  };
}

function fromBundle(slug) {
  const b = PACK.properties[slug];
  return b ? extractDossier(b) : null;
}

/* Fetching only what the prompt uses (`select=content,knowledge`) rather
   than the whole row: the assets block is 1-2 KB per property of URLs and
   provenance the concierge does not read. */
async function fetchDossier(slug) {
  const url = `${SB_URL}/rest/v1/properties`
    + `?slug=eq.${encodeURIComponent(slug)}`
    + `&status=eq.published`
    + `&select=content,knowledge&limit=1`;
  const r = await fetch(url, { headers: anonHeaders() });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  const rows = await r.json();
  return rows.length ? extractDossier(rows[0]) : null;
}

/* Public: the shape the handler expected from PACK before this file
   existed, so buildDossierPrompt is unchanged. */
export async function getDossier(slug) {
  const cached = dossierCache.get(slug);
  const now = Date.now();
  if (cached && now - cached.at < DOSSIER_TTL_MS) return cached.dossier;

  try {
    const fresh = await fetchDossier(slug);
    if (fresh) {
      dossierCache.set(slug, { at: now, dossier: fresh, source: 'db' });
      return fresh;
    }
    /* DB reachable but the property is not there or not published. Fall
       through to the bundle so demos keep working until the seed is run. */
  } catch (e) {
    /* Any failure — DNS, timeout, RLS, cold DB — hands off to the bundle
       rather than leaving the concierge without a dossier. Serve stale
       cache if we have one; it beats offline. */
    if (cached) return cached.dossier;
    console.warn('[concierge] dossier: falling back to bundle:', e.message);
  }

  const bundled = fromBundle(slug);
  if (bundled) dossierCache.set(slug, { at: now, dossier: bundled, source: 'bundle' });
  return bundled;
}

/* Public: does the property exist at all, from any source? Used for the
   400 check without paying for a full dossier fetch. */
export async function propertyKnown(slug) {
  if (PACK.properties[slug]) return true;
  const d = await getDossier(slug);
  return !!d;
}

/* ────────────────────────────────────────────────────────────────────
   PERSISTENCE

   Errors here never propagate. A concierge turn is user-facing; a
   database blip must not turn a good answer into a 500.

   The client's assistant history is untrusted (it can lie about what the
   concierge said last turn), but what THIS server just produced this
   turn is not — that is what we persist. Nothing that arrives in the
   `history` field is written.
   ──────────────────────────────────────────────────────────────────── */

async function upsertConversation(sessionId, slug, lang) {
  if (!sessionId) return null;
  /* on_conflict on the natural key gives us the row whether it already
     existed or not in one round trip. return=representation hands back the
     id AND the current counters, so the follow-up bump can accumulate from
     them without a separate read. merge-duplicates leaves message_count and
     total_cost_usd untouched (this body does not set them), so the values
     returned are the pre-turn totals.

     Uses the service_role key: RLS gives anon INSERT but no SELECT, so
     return=representation is impossible with the public credential. Also
     requires the plain UNIQUE index from migration 004 — the partial
     index shipped in 003 is not a valid ON CONFLICT target. */
  const url = `${SB_URL}/rest/v1/concierge_conversations`
    + `?on_conflict=session_id,property_slug`;
  const r = await fetch(url, {
    method: 'POST',
    headers: privilegedHeaders({
      Prefer: 'return=representation,resolution=merge-duplicates'
    }),
    body: JSON.stringify([{
      session_id: sessionId,
      property_slug: slug,
      lang: lang || 'en'
    }])
  });
  if (!r.ok) throw new Error(`conversation upsert ${r.status}`);
  const rows = await r.json();
  return rows[0] || null;
}

async function bumpConversation(conv, addedCost) {
  if (!conv?.id) return;
  /* Accumulate, don't overwrite. PostgREST cannot express `col = col + delta`
     in a plain PATCH without an RPC, so we increment from the values the
     upsert just returned. One turn is a user question plus an assistant
     answer, so message_count grows by two. A concurrent burst on the same
     conversation would race and drop an increment, but bursts are already
     capped by rate limiting, and both counters are an operator hint — the
     authoritative cost is the sum over concierge_messages.usage. */
  const messageCount = (Number(conv.message_count) || 0) + 2;
  const totalCost = +(((Number(conv.total_cost_usd) || 0) + (addedCost || 0)).toFixed(5));
  await fetch(`${SB_URL}/rest/v1/concierge_conversations?id=eq.${conv.id}`, {
    method: 'PATCH',
    headers: privilegedHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      updated_at: new Date().toISOString(),
      message_count: messageCount,
      total_cost_usd: totalCost
    })
  }).catch(() => { /* logged elsewhere; do not derail the turn */ });
}

async function insertMessages(convId, rows) {
  if (!convId || !rows.length) return;
  const r = await fetch(`${SB_URL}/rest/v1/concierge_messages`, {
    method: 'POST',
    headers: privilegedHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(rows.map(row => Object.assign({ conversation_id: convId }, row)))
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.warn('[concierge] insertMessages failed:', r.status, body);
  }
}

/* Public: called from the handler after it has both the question and the
   answer. Awaited but wrapped: if it throws, the visitor still gets the
   reply that was already generated. */
export async function persistTurn(ctx) {
  const { sessionId, slug, lang, question, answer } = ctx;
  if (!sessionId) return;
  /* No service_role key = persistence disabled by design. The visitor's
     turn already succeeded; skipping the write is the correct fallback,
     not a 500. */
  if (!serviceKeyReady()) return;
  try {
    const conv = await upsertConversation(sessionId, slug, lang);
    if (!conv?.id) return;

    await insertMessages(conv.id, [
      {
        role: 'user',
        content: question,
        confidence: null,
        interests: [],
        source: 'visitor',
        usage: {}
      },
      {
        role: 'assistant',
        content: answer.text,
        confidence: answer.confidence || null,
        interests: answer.interests || [],
        source: answer.source || 'llm',
        usage: answer.usage || {}
      }
    ]);

    await bumpConversation(conv, (answer.usage && answer.usage.costUSD) || 0);
  } catch (e) {
    console.warn('[concierge] persistence failed:', e.message);
  }
}
