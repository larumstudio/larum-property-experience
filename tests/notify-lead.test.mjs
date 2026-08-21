/**
 * M6.7a — api/notify-lead.mjs · Test Matrix
 *
 * Dependency-free (node:assert). Mocks global fetch — no real network,
 * no real Supabase/Resend calls. Same harness shape as
 * tests/admin-invite-agent.test.mjs.
 *
 * notify-lead.mjs reads its config (LEAD_NOTIFY_SECRET, RESEND_API_KEY,
 * ...) into module-level constants at import time, same as
 * admin-invite-agent.mjs already does — Node's ESM loader caches a
 * module by its exact specifier, so re-importing the same path later
 * would keep returning the FIRST evaluation's env-var snapshot, not
 * whatever process.env holds by then. loadHandler() below works around
 * that with a cache-busting query string per call, so each test can set
 * process.env freshly and get a module that actually reads it — without
 * this, every test after the first import would silently share
 * whatever config state existed at that first import (a real trap;
 * confirmed admin-invite-agent.test.mjs sidesteps it by never
 * re-importing at all, and consequently never exercises its own
 * "unconfigured" branch — this suite exercises both configured and
 * unconfigured branches for notify-lead.mjs instead).
 *
 * Groups:
 *   1 — Secret verification (missing/invalid/valid x-notify-secret)
 *   2 — Recipients: assigned agent + all org admins, both always
 *       included (never either/or)
 *   3 — Unassigned lead: admins only, email says so explicitly
 *   4 — No property match / no recipients / Resend not configured:
 *       all skip gracefully with 200, never a thrown error
 *   5 — A real Resend failure logs and still responds 200 (never
 *       makes the caller retry-storm a send that will keep failing)
 */

import assert from 'node:assert/strict';

let importCounter = 0;
async function loadHandler({ resendKey } = {}) {
  process.env.LEAD_NOTIFY_SECRET = 'test-secret-value';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.SUPABASE_URL = 'https://mtyemgfovvmjrsxevcgh.supabase.co';
  if (resendKey) process.env.RESEND_API_KEY = 'resend-test-key';
  else delete process.env.RESEND_API_KEY;

  importCounter++;
  const mod = await import('../api/notify-lead.mjs?case=' + importCounter);
  return mod.default;
}

const SECRET = 'test-secret-value';

const NO_SECRET = Symbol('no-secret-header-sent');

/* `secret` defaults to the valid SECRET so most tests don't have to
   pass it. Pass NO_SECRET explicitly to simulate no header at all —
   NOT `secret: undefined`, which a destructured default silently
   replaces with SECRET regardless of the key being present (a real
   trap: an earlier draft of this test used `undefined` here and it
   quietly asserted against the wrong scenario). */
function fakeReq({ method = 'POST', secret = SECRET, body = {} } = {}) {
  return {
    method,
    headers: secret === NO_SECRET ? {} : { 'x-notify-secret': secret },
    body
  };
}
function fakeRes() {
  const res = { _status: null, _body: null };
  res.status = (code) => { res._status = code; return res; };
  res.json = (obj) => { res._body = obj; return res; };
  return res;
}

function installMockFetch(scenario) {
  const calls = [];
  const origFetch = globalThis.fetch;

  globalThis.fetch = async (url, opts = {}) => {
    const method = (opts && opts.method) || 'GET';
    calls.push({ url, method, body: opts && opts.body ? JSON.parse(opts.body) : null });

    const json = (status, body) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body)
    });

    if (url.includes('/rest/v1/properties')) {
      return scenario.property ? json(200, [scenario.property]) : json(200, []);
    }
    if (url.includes('/rest/v1/agents')) {
      return scenario.agent ? json(200, [scenario.agent]) : json(200, []);
    }
    if (url.includes('/rest/v1/memberships')) {
      return json(200, scenario.adminMemberships || []);
    }
    if (url.includes('/auth/v1/admin/users/')) {
      const userId = url.split('/').pop();
      const email = (scenario.adminEmails || {})[userId];
      return email ? json(200, { id: userId, email }) : json(404, {});
    }
    if (url.includes('api.resend.com/emails')) {
      if (scenario.resendFails) return json(500, { message: 'resend down' });
      return json(200, { id: 'email-1' });
    }

    return json(404, {});
  };

  return { calls, restore: () => { globalThis.fetch = origFetch; } };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

function callsMatching(calls, urlFragment, method) {
  return calls.filter(c => c.url.includes(urlFragment) && (!method || c.method === method));
}

const LEAD = { id: 'lead-1', property_id: 'prop-1', property: 'villa-test', name: 'Jane Visitor', email: 'jane@example.invalid', interest: 'privacy', message: 'Tell me more' };
const PROPERTY_WITH_AGENT = { id: 'prop-1', slug: 'villa-test', organization_id: 'org-1', agent_id: 'agent-1' };
const PROPERTY_NO_AGENT = { id: 'prop-1', slug: 'villa-test', organization_id: 'org-1', agent_id: null };
const AGENT = { id: 'agent-1', name: 'Alex Agent', email: 'alex@example.invalid' };

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — Secret verification
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] Secret verification');

await test('GET request → 405', async () => {
  const handler = await loadHandler({ resendKey: true });
  const res = await handler(fakeReq({ method: 'GET' }), fakeRes());
  assert.equal(res._status, 405);
});

await test('missing x-notify-secret header → 401, no Supabase/Resend calls made', async () => {
  const handler = await loadHandler({ resendKey: true });
  const mock = installMockFetch({});
  try {
    const res = await handler(fakeReq({ secret: NO_SECRET, body: { record: LEAD } }), fakeRes());
    assert.equal(res._status, 401);
    assert.equal(mock.calls.length, 0, 'no downstream call should happen before the secret is verified');
  } finally { mock.restore(); }
});

await test('wrong x-notify-secret value → 401', async () => {
  const handler = await loadHandler({ resendKey: true });
  const mock = installMockFetch({});
  try {
    const res = await handler(fakeReq({ secret: 'not-the-secret', body: { record: LEAD } }), fakeRes());
    assert.equal(res._status, 401);
  } finally { mock.restore(); }
});

await test('missing record in body → 400', async () => {
  const handler = await loadHandler({ resendKey: true });
  const mock = installMockFetch({});
  try {
    const res = await handler(fakeReq({ body: {} }), fakeRes());
    assert.equal(res._status, 400);
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — Assigned agent: agent + all admins notified together
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] Assigned agent → agent email AND all admin emails, both always included');

await test('assigned agent + 2 admins → all 3 emails in the Resend "to" list, subject mentions the agent', async () => {
  const handler = await loadHandler({ resendKey: true });
  const mock = installMockFetch({
    property: PROPERTY_WITH_AGENT,
    agent: AGENT,
    adminMemberships: [{ user_id: 'admin-user-1' }, { user_id: 'admin-user-2' }],
    adminEmails: { 'admin-user-1': 'admin1@example.invalid', 'admin-user-2': 'admin2@example.invalid' }
  });
  try {
    const res = await handler(fakeReq({ body: { record: LEAD } }), fakeRes());
    assert.equal(res._status, 200);
    assert.equal(res._body.ok, true);
    assert.equal(res._body.notified, 3);

    const sendCall = callsMatching(mock.calls, 'api.resend.com/emails', 'POST')[0];
    assert.ok(sendCall, 'Resend must have been called');
    const to = sendCall.body.to;
    assert.ok(to.includes('alex@example.invalid'));
    assert.ok(to.includes('admin1@example.invalid'));
    assert.ok(to.includes('admin2@example.invalid'));
    assert.match(sendCall.body.subject, /Alex Agent/);
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — Unassigned lead
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Unassigned lead → admins only, email explicitly says "no agent assigned"');

await test('no agent_id on the property → admins notified, subject says "unassigned", body says so explicitly', async () => {
  const handler = await loadHandler({ resendKey: true });
  const mock = installMockFetch({
    property: PROPERTY_NO_AGENT,
    adminMemberships: [{ user_id: 'admin-user-1' }],
    adminEmails: { 'admin-user-1': 'admin1@example.invalid' }
  });
  try {
    const res = await handler(fakeReq({ body: { record: LEAD } }), fakeRes());
    assert.equal(res._status, 200);
    assert.equal(res._body.notified, 1);

    const sendCall = callsMatching(mock.calls, 'api.resend.com/emails', 'POST')[0];
    assert.match(sendCall.body.subject, /unassigned/);
    assert.match(sendCall.body.text, /No agent assigned yet/);
    assert.ok(!sendCall.body.to.includes('alex@example.invalid'), 'no agent email should appear when none is assigned');
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 4 — Graceful skips, never a thrown/500 error
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[4] Graceful skips (no property / no recipients / Resend not configured)');

await test('lead with no resolvable property → 200, skipped, no Resend call', async () => {
  const handler = await loadHandler({ resendKey: true });
  const mock = installMockFetch({ property: null });
  try {
    const res = await handler(fakeReq({ body: { record: LEAD } }), fakeRes());
    assert.equal(res._status, 200);
    assert.equal(res._body.skipped, 'no_property');
    assert.equal(callsMatching(mock.calls, 'api.resend.com').length, 0);
  } finally { mock.restore(); }
});

await test('no agent and zero admins resolvable → 200, skipped, no Resend call', async () => {
  const handler = await loadHandler({ resendKey: true });
  const mock = installMockFetch({ property: PROPERTY_NO_AGENT, adminMemberships: [] });
  try {
    const res = await handler(fakeReq({ body: { record: LEAD } }), fakeRes());
    assert.equal(res._status, 200);
    assert.equal(res._body.skipped, 'no_recipients');
  } finally { mock.restore(); }
});

await test('RESEND_API_KEY not configured → 200, skipped, recipients still resolved but no send attempted', async () => {
  const handler = await loadHandler({ resendKey: false });
  const mock = installMockFetch({
    property: PROPERTY_WITH_AGENT, agent: AGENT,
    adminMemberships: [], adminEmails: {}
  });
  try {
    const res = await handler(fakeReq({ body: { record: LEAD } }), fakeRes());
    assert.equal(res._status, 200);
    assert.equal(res._body.skipped, 'email_not_configured');
    assert.equal(callsMatching(mock.calls, 'api.resend.com').length, 0);
  } finally { mock.restore(); }
});

await test('LEAD_NOTIFY_SECRET itself not configured → 503, before any other check', async () => {
  delete process.env.LEAD_NOTIFY_SECRET;
  importCounter++;
  const mod = await import('../api/notify-lead.mjs?case=' + importCounter);
  process.env.LEAD_NOTIFY_SECRET = 'test-secret-value'; // restore for subsequent tests
  const mock = installMockFetch({});
  try {
    const res = await mod.default(fakeReq({ body: { record: LEAD } }), fakeRes());
    assert.equal(res._status, 503);
    assert.equal(res._body.error, 'notify_unconfigured');
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 5 — Resend failure never produces a 5xx (no retry-storm)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[5] A real Resend failure logs and still responds 200');

await test('Resend API returns an error → handler still responds 200, ok:false', async () => {
  const handler = await loadHandler({ resendKey: true });
  const mock = installMockFetch({
    property: PROPERTY_WITH_AGENT, agent: AGENT,
    adminMemberships: [], adminEmails: {},
    resendFails: true
  });
  try {
    const res = await handler(fakeReq({ body: { record: LEAD } }), fakeRes());
    assert.equal(res._status, 200);
    assert.equal(res._body.ok, false);
  } finally { mock.restore(); }
});

console.log('\n══ M6.7a notify-lead TEST SUMMARY ═══════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
