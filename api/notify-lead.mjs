/* ── Larum Admin · Lead Notification (M6.7a) ───────────────────────────
   Server-side only. Triggered by a Supabase Database Webhook configured
   on `leads` (event: INSERT) — that configuration lives in the Supabase
   Dashboard (Database → Webhooks), not in this repo, same as every
   migration in docs/migrations/ requires a manual one-time step outside
   of code. See docs/LEAD_NOTIFICATIONS_SETUP.md for the exact steps.

   Same two-credential discipline as api/_data.mjs and
   api/admin-invite-agent.mjs: SUPABASE_SERVICE_ROLE_KEY is read only in
   this process, never sent to the browser, never logged. Plain fetch()
   throughout — no new dependency added to package.json, consistent with
   every other endpoint in this directory.

   Design:
   - LEAD_NOTIFY_SECRET is a shared value set BOTH as this function's own
     env var and as a custom header on the Supabase webhook config —
     never embedded in any committed file (not a migration, not this
     source file). Requests without a matching x-notify-secret header
     are rejected outright; this is the only thing standing between the
     endpoint and the open internet, since Supabase webhooks call it
     unauthenticated.
   - Resolves the lead's property → organization_id, and the assigned
     agent if any. Recipients are the assigned agent's email (if
     assigned) PLUS every admin in that organization — always both, per
     the approved M6.7a scope, not an either/or.
   - No agent assigned yet: still notifies every admin, with the email
     itself saying so explicitly ("No agent assigned yet") rather than
     silently sending a shorter email — an admin reading it needs to
     know they may be the only one who saw this lead land.
   - Never blocks or affects the actual lead insert — this fires AFTER
     the row already exists, asynchronously, as a Supabase webhook. A
     failure here (Resend down, misconfigured key) cannot lose lead
     data; it can only fail to notify about it. Always responds 200 once
     past the secret check, so Supabase's webhook delivery does not
     retry-storm a send that will keep failing the same way (e.g. a bad
     domain) — failures are logged server-side for diagnosis instead.
   ─────────────────────────────────────────────────────────────────── */

const SB_URL = process.env.SUPABASE_URL || 'https://mtyemgfovvmjrsxevcgh.supabase.co';
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const NOTIFY_SECRET = process.env.LEAD_NOTIFY_SECRET || null;
const RESEND_API_KEY = process.env.RESEND_API_KEY || null;
const RESEND_FROM = process.env.RESEND_FROM || 'Larum <onboarding@resend.dev>';

function serviceHeaders(extra) {
  return Object.assign(
    { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, 'Content-Type': 'application/json' },
    extra || {}
  );
}

/* ── Data access (service_role — same as admin-invite-agent.mjs; bypasses
   RLS by design, no policy added or changed) ────────────────────────── */

async function loadProperty({ propertyId, propertySlug }) {
  const filter = propertyId
    ? `id=eq.${encodeURIComponent(propertyId)}`
    : `slug=eq.${encodeURIComponent(propertySlug)}`;
  const url = `${SB_URL}/rest/v1/properties?${filter}&select=id,slug,organization_id,agent_id&limit=1`;
  const r = await fetch(url, { headers: serviceHeaders() });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows[0] || null;
}

async function loadAgent(agentId) {
  if (!agentId) return null;
  const url = `${SB_URL}/rest/v1/agents?id=eq.${encodeURIComponent(agentId)}&select=id,name,email&limit=1`;
  const r = await fetch(url, { headers: serviceHeaders() });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows[0] || null;
}

async function loadAdminUserIds(organizationId) {
  const url = `${SB_URL}/rest/v1/memberships?organization_id=eq.${encodeURIComponent(organizationId)}&role=eq.admin&select=user_id`;
  const r = await fetch(url, { headers: serviceHeaders() });
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return rows.map(row => row.user_id).filter(Boolean);
}

/* memberships has no email of its own — same Auth Admin API call
   admin-invite-agent.mjs already uses to read a user by id. */
async function loadAuthUserEmail(userId) {
  const url = `${SB_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
  const r = await fetch(url, { headers: serviceHeaders() });
  if (!r.ok) return null;
  const body = await r.json().catch(() => null);
  return body && body.email ? body.email : null;
}

async function resolveRecipients(property) {
  const emails = new Set();
  let agent = null;

  if (property.agent_id) {
    agent = await loadAgent(property.agent_id);
    if (agent && agent.email) emails.add(agent.email);
  }

  const adminUserIds = await loadAdminUserIds(property.organization_id);
  const adminEmails = await Promise.all(adminUserIds.map(loadAuthUserEmail));
  for (const email of adminEmails) if (email) emails.add(email);

  return { emails: Array.from(emails), agent };
}

/* ── Email composition + send (Resend) ───────────────────────────────
   Chosen for M6.7a: plain REST API (POST /emails, Bearer key), no SDK —
   matches this project's existing convention of talking to every
   external service over fetch() rather than adding a client library. */

function composeEmail(lead, property, agent) {
  const propertyLabel = property.slug || 'a property';
  const assignmentLine = agent
    ? `Assigned agent: ${agent.name || agent.email || '(unnamed)'}`
    : 'No agent assigned yet — an admin should assign one or follow up directly.';

  const subject = agent
    ? `New lead — ${propertyLabel} (assigned to ${agent.name || agent.email})`
    : `New lead — ${propertyLabel} (unassigned)`;

  const lines = [
    `A new enquiry just came in for ${propertyLabel}.`,
    '',
    `Name: ${lead.name || 'Anonymous'}`,
    `Email: ${lead.email || '—'}`,
    `Interest: ${lead.interest || '—'}`,
    lead.message ? `Message: ${lead.message}` : null,
    '',
    assignmentLine,
    '',
    'Open Larum Admin → Leads to respond.'
  ].filter(line => line !== null);

  return { subject, text: lines.join('\n') };
}

async function sendEmail({ to, subject, text }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, text })
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`resend_failed_${r.status}:${body}`);
  }
}

/* ── Handler ──────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!NOTIFY_SECRET) {
    /* Same fail-closed stance as admin-invite-agent.mjs's missing-
       service_role case — an unconfigured secret means this endpoint
       cannot verify who is calling it, so it refuses rather than
       accepting every request. */
    return res.status(503).json({ error: 'notify_unconfigured' });
  }

  const providedSecret = req.headers && req.headers['x-notify-secret'];
  if (providedSecret !== NOTIFY_SECRET) {
    return res.status(401).json({ error: 'invalid_secret' });
  }

  if (!SB_SERVICE) {
    return res.status(503).json({ error: 'supabase_unconfigured' });
  }

  const payload = req.body || {};
  const lead = payload.record;
  if (!lead || !lead.id) {
    return res.status(400).json({ error: 'missing_lead_record' });
  }

  try {
    const property = await loadProperty({ propertyId: lead.property_id, propertySlug: lead.property });
    if (!property) {
      /* A lead can exist with no matching property (e.g. a stale/typo
         slug) — same "correctly stays NULL" case resolve_lead_agent_id()
         already tolerates. Nothing to notify about an org for; log and
         stop, do not error the webhook. */
      console.error('[notify-lead] lead has no resolvable property, skipping:', lead.id);
      return res.status(200).json({ ok: true, skipped: 'no_property' });
    }

    const { emails, agent } = await resolveRecipients(property);
    if (!emails.length) {
      console.error('[notify-lead] no recipients resolved for org:', property.organization_id);
      return res.status(200).json({ ok: true, skipped: 'no_recipients' });
    }

    if (!RESEND_API_KEY) {
      /* Same graceful-degradation stance as api/concierge.mjs without
         ANTHROPIC_API_KEY: the feature silently does nothing rather
         than failing loudly, since there is no user-facing surface for
         this endpoint to report an error to. */
      console.error('[notify-lead] RESEND_API_KEY not configured, skipping send for lead:', lead.id);
      return res.status(200).json({ ok: true, skipped: 'email_not_configured' });
    }

    const { subject, text } = composeEmail(lead, property, agent);
    await sendEmail({ to: emails, subject, text });

    return res.status(200).json({ ok: true, notified: emails.length });
  } catch (e) {
    console.error('[notify-lead] failed:', e.message);
    /* Always 200 past this point — see file header: a failed send must
       never make Supabase retry-storm a webhook call that will keep
       failing the same way. */
    return res.status(200).json({ ok: false, error: 'notify_failed' });
  }
}
