/* ── Larum Admin · Invite Agent (M6.2) ─────────────────────────────────
   Server-side only. This is the ONLY place SUPABASE_SERVICE_ROLE_KEY is
   read — never sent to the browser, never logged, never echoed in any
   response. Same two-credential discipline already established in
   api/_data.mjs (anon for reads that respect RLS, service_role only
   inside this process for the handful of privileged operations that
   genuinely need it).

   What this does, in order, every call:
     1. Resolves the CALLER from their own bearer token (never trusts a
        user id sent in the request body).
     2. Confirms the caller is role='admin' in the TARGET agent's own
        organization_id — this is what makes cross-org invites
        impossible: the check is always scoped to the target's org,
        never the caller's.
     3. Applies the idempotent state machine described in the M6.2
        authorization (agents.auth_user_id / memberships), never
        creating a second Auth user for the same agent.

   Does not touch RLS. Does not touch Migration 006. Does not touch
   app.js or any visitor-facing code — this endpoint is reachable only
   from the authenticated admin UI.
   ─────────────────────────────────────────────────────────────────── */

const SB_URL = process.env.SUPABASE_URL || 'https://mtyemgfovvmjrsxevcgh.supabase.co';
const SB_ANON = process.env.SUPABASE_ANON_KEY || null;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

/* Without this, Supabase falls back to the project's default Site URL
   (index.html, the public visitor experience) — which silently
   consumes and discards the invite session, since it has no code path
   for it. Must also be present in Supabase's Redirect URLs allowlist
   (Dashboard → Authentication → URL Configuration) or Supabase ignores
   it and falls back to the same default. */
const INVITE_REDIRECT_TO = 'https://larum-property-experience.vercel.app/admin.html';

function anonHeaders(extra) {
  return Object.assign({ apikey: SB_ANON, 'Content-Type': 'application/json' }, extra || {});
}
function serviceHeaders(extra) {
  return Object.assign(
    { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, 'Content-Type': 'application/json' },
    extra || {}
  );
}

/* ── Caller identity ──────────────────────────────────────────────── */

/* Resolves who is ACTUALLY calling, from their own session token —
   the request body is never trusted for identity. This call cannot
   escalate privilege: it only asks Supabase Auth "whose token is
   this", the same question the browser's own supabaseClient answers
   for itself every page load. */
async function resolveCaller(bearerToken) {
  if (!bearerToken) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: anonHeaders({ Authorization: `Bearer ${bearerToken}` })
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user && user.id ? user : null;
  } catch (e) {
    return null;
  }
}

/* Authorization decision uses service_role to read `memberships`
   directly — deliberately not dependent on the caller's own RLS
   visibility into that table, mirroring why is_org_admin() in Postgres
   is SECURITY DEFINER rather than relying on the caller's own read
   access. organizationId is always the TARGET agent's org, never
   derived from the caller — this is the entire cross-org guard. */
async function isOrgAdmin(userId, organizationId) {
  const url = `${SB_URL}/rest/v1/memberships`
    + `?user_id=eq.${encodeURIComponent(userId)}`
    + `&organization_id=eq.${encodeURIComponent(organizationId)}`
    + `&role=eq.admin&select=id&limit=1`;
  const r = await fetch(url, { headers: serviceHeaders() });
  if (!r.ok) return false;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

/* ── Data access (service_role — bypasses RLS by design, same as
   api/_data.mjs's persistTurn; no RLS policy is added or changed) ─── */

async function loadAgent(agentId) {
  const url = `${SB_URL}/rest/v1/agents`
    + `?id=eq.${encodeURIComponent(agentId)}`
    + `&select=id,email,organization_id,auth_user_id,status,name&limit=1`;
  const r = await fetch(url, { headers: serviceHeaders() });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows[0] || null;
}

async function findMembership(userId, organizationId) {
  const url = `${SB_URL}/rest/v1/memberships`
    + `?user_id=eq.${encodeURIComponent(userId)}`
    + `&organization_id=eq.${encodeURIComponent(organizationId)}&select=id&limit=1`;
  const r = await fetch(url, { headers: serviceHeaders() });
  if (!r.ok) throw new Error('membership_lookup_failed');
  const rows = await r.json().catch(() => []);
  return rows[0] || null;
}

async function createMembership(userId, organizationId) {
  const r = await fetch(`${SB_URL}/rest/v1/memberships`, {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'return=representation,resolution=merge-duplicates' }),
    body: JSON.stringify([{ user_id: userId, organization_id: organizationId, role: 'agent' }])
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`membership_create_failed:${r.status}:${body}`);
  }
}

async function linkAgentAuthUser(agentId, userId) {
  const r = await fetch(`${SB_URL}/rest/v1/agents?id=eq.${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: serviceHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ auth_user_id: userId })
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`agent_link_failed:${r.status}:${body}`);
  }
}

/* ── Supabase Auth Admin (service_role only) ─────────────────────── */

/* Raw REST equivalent of supabase.auth.admin.inviteUserByEmail() — no
   new dependency added to package.json, consistent with api/_data.mjs
   already talking to Supabase over plain fetch() rather than the JS
   client library. On "already registered", returns a typed outcome
   instead of throwing, so the caller can take the repair path.

   redirect_to MUST be a URL query parameter, not a JSON body field —
   GoTrue's /invite (and /recover, below) read it exclusively off the
   request URL, the same way auth-js's own _request() helper builds
   it (redirectTo is passed as a top-level option there, never inside
   `body`). A body field is silently ignored, which is exactly what
   let this fix's first two attempts through code review and tests
   while still landing on the wrong page in production. */
async function inviteAuthUser(email) {
  const url = `${SB_URL}/auth/v1/invite?redirect_to=${encodeURIComponent(INVITE_REDIRECT_TO)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ email })
  });
  const body = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, user: body };

  const msg = (body && (body.msg || body.message || body.error_description)) || '';
  if (r.status === 422 || /already registered|already exists/i.test(msg)) {
    return { ok: false, alreadyRegistered: true, message: msg };
  }
  return { ok: false, alreadyRegistered: false, message: msg || `invite_failed_${r.status}` };
}

/* Repair-path lookup only — never used on the fresh-invite path. If
   this can't find the user (e.g. the admin API's email filter isn't
   available on a given project), the caller gets a clear 409 asking
   for manual resolution rather than guessing at a user id. */
async function findAuthUserByEmail(email) {
  const url = `${SB_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const r = await fetch(url, { headers: serviceHeaders() });
  if (!r.ok) return null;
  const body = await r.json().catch(() => null);
  const users = (body && body.users) || (Array.isArray(body) ? body : []);
  return users.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
}

/* agents.auth_user_id is set the moment Auth creates the user — at
   INVITE time, not at ACCEPT time. email_confirmed_at is set the
   moment the link gets opened and Supabase verifies the token,
   server-side, before the client redirect even happens — so an
   agent whose link landed on the wrong page (pre redirect_to-fix)
   and silently lost its session is still marked confirmed. (Even
   last_sign_in_at gets set in that case — establishing a session
   from the link counts as a sign-in to Supabase — so it can't
   distinguish "stuck" from "actually using the account" either.)
   Only a genuinely unconfirmed link (never opened at all) can take
   a plain re-invite; anything confirmed needs a recovery link. */
async function loadAuthUserById(userId) {
  const url = `${SB_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
  const r = await fetch(url, { headers: serviceHeaders() });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

/* Same endpoint a "forgot password" form calls — the correct way to
   get a confirmed-but-passwordless account a fresh login link, since
   Supabase's /invite refuses accounts it already considers
   confirmed. */
async function sendPasswordRecovery(email) {
  const url = `${SB_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(INVITE_REDIRECT_TO)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ email })
  });
  if (r.ok) return { ok: true };
  const body = await r.json().catch(() => ({}));
  const msg = (body && (body.msg || body.message || body.error_description)) || `recover_failed_${r.status}`;
  return { ok: false, message: msg };
}

/* ── Handler ──────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!SB_SERVICE || !SB_ANON) {
    /* Not configured — refuse outright rather than degrading to a
       lesser check. There is no safe fallback for a missing
       service_role key on a privilege-escalating endpoint. */
    return res.status(503).json({ error: 'invite_unconfigured' });
  }

  const authHeader = req.headers && req.headers.authorization ? req.headers.authorization : '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const caller = await resolveCaller(bearerToken);
  if (!caller) {
    return res.status(401).json({ error: 'unauthenticated' });
  }

  const { agentId } = req.body || {};
  if (!agentId || typeof agentId !== 'string') {
    return res.status(400).json({ error: 'missing_agent_id' });
  }

  const agent = await loadAgent(agentId);
  if (!agent) {
    return res.status(404).json({ error: 'agent_not_found' });
  }

  const callerIsAdmin = await isOrgAdmin(caller.id, agent.organization_id);
  if (!callerIsAdmin) {
    /* Covers "not an admin at all" AND "admin of a different
       organization" with the exact same check — organizationId above
       is always the target agent's, never the caller's own. */
    return res.status(403).json({ error: 'not_org_admin' });
  }

  try {
    let userId = agent.auth_user_id || null;
    let outcome;

    if (!userId) {
      if (!agent.email) {
        return res.status(400).json({ error: 'agent_missing_email' });
      }

      const invite = await inviteAuthUser(agent.email);

      if (invite.ok) {
        userId = invite.user.id;
        outcome = 'invited';
      } else if (invite.alreadyRegistered) {
        const existing = await findAuthUserByEmail(agent.email);
        if (!existing) {
          return res.status(409).json({ error: 'already_registered_but_not_found' });
        }
        userId = existing.id;
        outcome = 'repaired';
      } else {
        return res.status(502).json({ error: 'invite_failed', detail: invite.message });
      }

      await linkAgentAuthUser(agentId, userId);
    } else {
      const authUser = await loadAuthUserById(userId);
      if (!authUser) {
        return res.status(502).json({ error: 'auth_user_lookup_failed' });
      }

      const isConfirmed = !!(authUser.email_confirmed_at || authUser.confirmed_at);

      if (!isConfirmed) {
        /* Link never opened at all — a plain re-invite works and
           Supabase resends against the SAME unconfirmed user rather
           than erroring, so this never creates a second Auth user. */
        const invite = await inviteAuthUser(agent.email);
        if (!invite.ok && !invite.alreadyRegistered) {
          return res.status(502).json({ error: 'invite_failed', detail: invite.message });
        }
        if (invite.ok && invite.user.id !== userId) {
          userId = invite.user.id;
          await linkAgentAuthUser(agentId, userId);
        }
        outcome = 'resent';
      } else {
        /* Confirmed — could genuinely be using the account already,
           or could be stuck exactly like this fix's motivating case
           (link opened, session silently established and discarded
           by the wrong pre-fix landing page — which is enough for
           Supabase to also mark last_sign_in_at, so that field can't
           tell the two apart either). Supabase refuses a second
           /invite for a confirmed user, and a recovery link is safe
           to send either way — the same "forgot password" flow the
           agent could trigger themselves. */
        const recovery = await sendPasswordRecovery(agent.email);
        if (!recovery.ok) {
          return res.status(502).json({ error: 'recovery_failed', detail: recovery.message });
        }
        outcome = 'recovery_sent';
      }
    }

    const existingMembership = await findMembership(userId, agent.organization_id);
    if (!existingMembership) {
      await createMembership(userId, agent.organization_id);
    }

    return res.status(200).json({ ok: true, outcome, agentId });
  } catch (e) {
    console.error('[admin-invite-agent] failed:', e.message);
    return res.status(500).json({ error: 'invite_processing_failed' });
  }
}
