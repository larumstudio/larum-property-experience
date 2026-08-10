/* ── Larum — Concierge rate limiting ─────────────────────────────────
   The /api/concierge endpoint is public, has no auth (by design — the
   visitor never signs in), and spends real money at Anthropic every
   time it is called. Before this file it had no protection at all: a
   script from a single IP could quietly burn a monthly budget in an
   afternoon.

   In-memory limits on the warm container. Two windows:

   - IP rolling window (60 s) — catches the burst pattern that is 99% of
     abuse. Same IP is a soft signal (CGNAT, corporate egress), so the
     limit is set generous enough that a real human curious about a
     property never trips it.

   - Session lifetime cap — sessionStorage id from the browser. Anyone
     who wants to hammer the endpoint can rotate the id, but the friction
     of doing that already puts them in a different category, and the IP
     window catches the tool that does it.

   This is not a defence against a distributed adversary. It is a
   defence against the one script that would otherwise cost us hundreds
   of dollars before anyone noticed. Distributed abuse needs an edge
   layer (Vercel WAF or Cloudflare) and belongs to a later phase.
   ─────────────────────────────────────────────────────────────────── */

const IP_LIMIT      = 20;         // requests per window per IP
const IP_WINDOW_MS  = 60_000;
const SESSION_LIMIT = 40;         // per session_id, container lifetime
const CLEANUP_MS    = 5 * 60_000; // stale entries pruned lazily

const ipBuckets = new Map();     // ip → { count, resetAt }
const sessionCounts = new Map(); // sid → count
let lastCleanup = Date.now();

function cleanup(now) {
  if (now - lastCleanup < CLEANUP_MS) return;
  lastCleanup = now;
  for (const [ip, b] of ipBuckets) if (b.resetAt < now) ipBuckets.delete(ip);
  /* sessionCounts intentionally kept: a session that reaches the cap on
     one instance should not be reset by rotating containers. */
}

/* First value of x-forwarded-for is the client on Vercel; fall back to a
   fixed key so a missing header does not silently disable limiting. */
export function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.headers['x-real-ip'] || 'unknown';
}

export function check(req, sessionId) {
  const now = Date.now();
  cleanup(now);

  const ip = clientIp(req);
  const b = ipBuckets.get(ip);
  if (!b || b.resetAt <= now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
  } else {
    b.count++;
    if (b.count > IP_LIMIT) {
      return {
        ok: false,
        scope: 'ip',
        retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000))
      };
    }
  }

  if (sessionId) {
    const c = (sessionCounts.get(sessionId) || 0) + 1;
    sessionCounts.set(sessionId, c);
    if (c > SESSION_LIMIT) {
      /* Session caps are per-container by design (see file header). No
         retry-after: the session is done for the life of this instance. */
      return { ok: false, scope: 'session' };
    }
  }

  return { ok: true };
}
