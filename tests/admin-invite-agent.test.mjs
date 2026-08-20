/**
 * M6.2 — api/admin-invite-agent.mjs · Endpoint Test Matrix
 *
 * Dependency-free (node:assert). No real Supabase project, no real
 * credentials — every fetch() call the handler makes is intercepted by
 * a mock router keyed on URL pattern, matching the exact REST/Auth
 * Admin endpoints the module calls. process.env is set to obviously
 * fake, non-resolvable values BEFORE the module is imported (its
 * SB_URL/SB_ANON/SB_SERVICE consts are read once, at import time) —
 * even if a mock were accidentally bypassed, these values cannot reach
 * a real server.
 *
 * Covers all 9 endpoint-side cases from the M6.2 authorization:
 *   1 — admin autorizado
 *   2 — llamante no autenticado rechazado
 *   3 — agent rechazado como invitador
 *   4 — creación de Auth user
 *   5 — vinculación auth_user_id
 *   6 — creación de membership
 *   7 — reintento idempotente
 *   8 — fallo parcial Auth → membership, reparación
 *   9 — cross-org bloqueado
 */

import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://fake-test-project.supabase.invalid';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key-not-real';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-not-real';

const { default: handler } = await import('../api/admin-invite-agent.mjs');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

/* ── Fake req/res (Vercel handler shape) ─────────────────────────── */
function fakeReq({ method = 'POST', token = 'valid-token', body = {} } = {}) {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body
  };
}
function fakeRes() {
  const res = { _status: null, _body: null };
  res.status = (code) => { res._status = code; return res; };
  res.json = (obj) => { res._body = obj; return res; };
  return res;
}

/* ── Mock fetch router ────────────────────────────────────────────
   `calls` records every intercepted URL+method so tests can assert on
   exactly what the handler did (or, just as importantly, did NOT do —
   e.g. "no second Auth user was ever created"). */
function installMockFetch(scenario) {
  const calls = [];
  const origFetch = globalThis.fetch;

  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url, method, body: opts.body ? JSON.parse(opts.body) : null });

    const json = (status, body) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body)
    });

    if (url.includes('/auth/v1/user')) {
      return scenario.callerUser
        ? json(200, scenario.callerUser)
        : json(401, { error: 'invalid_token' });
    }

    if (url.includes('/rest/v1/memberships') && method === 'GET' && url.includes('role=eq.admin')) {
      return json(200, scenario.adminMembershipRows || []);
    }

    if (url.includes('/rest/v1/agents') && method === 'GET') {
      return json(200, scenario.agentRows || []);
    }

    if (url.includes('/rest/v1/agents') && method === 'PATCH') {
      return json(204, null);
    }

    if (url.includes('/rest/v1/memberships') && method === 'GET') {
      return json(200, scenario.existingMembershipRows || []);
    }

    if (url.includes('/rest/v1/memberships') && method === 'POST') {
      return json(201, [{ id: 'new-membership-id' }]);
    }

    if (url.includes('/auth/v1/invite')) {
      if (scenario.inviteResult) return scenario.inviteResult();
      return json(200, { id: 'new-auth-user-id', email: (scenario.agentRows?.[0]?.email) || 'x@example.invalid' });
    }

    if (url.includes('/auth/v1/recover') && method === 'POST') {
      if (scenario.recoveryResult) return scenario.recoveryResult();
      return json(200, {});
    }

    if (url.includes('/auth/v1/admin/users/') && method === 'GET') {
      // by-id lookup (loadAuthUserById) — distinct from the email-query
      // lookup below (findAuthUserByEmail).
      if (scenario.authUserById === undefined) {
        throw new Error('Test scenario missing authUserById for GET /auth/v1/admin/users/{id}');
      }
      return scenario.authUserById
        ? json(200, scenario.authUserById)
        : json(404, { error: 'user_not_found' });
    }

    if (url.includes('/auth/v1/admin/users')) {
      return json(200, { users: scenario.existingAuthUsers || [] });
    }

    throw new Error('Unmocked URL in test: ' + method + ' ' + url);
  };

  return { calls, restore: () => { globalThis.fetch = origFetch; } };
}

function callsMatching(calls, pattern, method) {
  return calls.filter(c => c.url.includes(pattern) && (!method || c.method === method));
}

/* ═══════════════════════════════════════════════════════════════
   1 — admin autorizado
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] Caller authorization — happy path');

await test('admin autorizado → 200, outcome=invited', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-user-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-1', email: 'agent@example.invalid', organization_id: 'org-A', auth_user_id: null, status: 'active', name: 'Agent One' }],
    existingMembershipRows: []
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-1' } }), res);
    assert.equal(res._status, 200);
    assert.equal(res._body.ok, true);
    assert.equal(res._body.outcome, 'invited');
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   2 — llamante no autenticado rechazado
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] Unauthenticated caller rejected');

await test('sin bearer token → 401, cero llamadas privilegiadas', async () => {
  const mock = installMockFetch({ callerUser: null });
  try {
    const res = fakeRes();
    await handler(fakeReq({ token: null, body: { agentId: 'agent-1' } }), res);
    assert.equal(res._status, 401);
    assert.equal(res._body.error, 'unauthenticated');
    assert.equal(callsMatching(mock.calls, '/auth/v1/invite').length, 0);
    assert.equal(callsMatching(mock.calls, '/rest/v1/agents').length, 0);
  } finally { mock.restore(); }
});

await test('token inválido (Auth server rejects it) → 401', async () => {
  const mock = installMockFetch({ callerUser: null });
  try {
    const res = fakeRes();
    await handler(fakeReq({ token: 'garbage-token', body: { agentId: 'agent-1' } }), res);
    assert.equal(res._status, 401);
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   3 — agent rechazado como invitador
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Agent role rejected as inviter');

await test('caller autenticado pero sin membership admin → 403, cero invite/membership calls', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'agent-user-1' },
    adminMembershipRows: [],  // caller has no role=admin row for this org
    agentRows: [{ id: 'agent-2', email: 'other@example.invalid', organization_id: 'org-A', auth_user_id: null, status: 'active', name: 'Agent Two' }]
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-2' } }), res);
    assert.equal(res._status, 403);
    assert.equal(res._body.error, 'not_org_admin');
    assert.equal(callsMatching(mock.calls, '/auth/v1/invite').length, 0);
    assert.equal(callsMatching(mock.calls, '/rest/v1/memberships', 'POST').length, 0);
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   4/5/6 — Auth user creation, agent linking, membership creation
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[4/5/6] Auth user creation → agent link → membership creation');

await test('4: crea Auth user exactamente una vez, con el email correcto', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-3', email: 'fresh@example.invalid', organization_id: 'org-A', auth_user_id: null, status: 'active', name: 'Fresh Agent' }]
  });
  try {
    await handler(fakeReq({ body: { agentId: 'agent-3' } }), fakeRes());
    const inviteCalls = callsMatching(mock.calls, '/auth/v1/invite', 'POST');
    assert.equal(inviteCalls.length, 1);
    assert.equal(inviteCalls[0].body.email, 'fresh@example.invalid');
  } finally { mock.restore(); }
});

await test('4b: /auth/v1/invite recibe redirect_to apuntando a admin.html (fix M6.2 — redirect)', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-3b', email: 'redirect@example.invalid', organization_id: 'org-A', auth_user_id: null, status: 'active', name: 'Redirect Agent' }]
  });
  try {
    await handler(fakeReq({ body: { agentId: 'agent-3b' } }), fakeRes());
    const inviteCalls = callsMatching(mock.calls, '/auth/v1/invite', 'POST');
    assert.equal(inviteCalls.length, 1);
    assert.equal(
      inviteCalls[0].url,
      'https://fake-test-project.supabase.invalid/auth/v1/invite?redirect_to=https%3A%2F%2Flarum-property-experience.vercel.app%2Fadmin.html',
      'redirect_to must be a URL query param — GoTrue reads it exclusively there, a JSON body field is silently ignored'
    );
  } finally { mock.restore(); }
});

await test('5: vincula agents.auth_user_id con el id devuelto por Auth', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-4', email: 'link@example.invalid', organization_id: 'org-A', auth_user_id: null, status: 'active', name: 'Link Agent' }],
    inviteResult: () => ({ ok: true, status: 200, json: async () => ({ id: 'brand-new-auth-id', email: 'link@example.invalid' }), text: async () => '' })
  });
  try {
    await handler(fakeReq({ body: { agentId: 'agent-4' } }), fakeRes());
    const patchCalls = callsMatching(mock.calls, '/rest/v1/agents', 'PATCH');
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].body.auth_user_id, 'brand-new-auth-id');
    assert.ok(patchCalls[0].url.includes('agent-4'), 'PATCH must target the right agent row');
  } finally { mock.restore(); }
});

await test('6: crea membership con role=agent y la organization_id correcta', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-5', email: 'mem@example.invalid', organization_id: 'org-B', auth_user_id: null, status: 'active', name: 'Mem Agent' }]
  });
  try {
    await handler(fakeReq({ body: { agentId: 'agent-5' } }), fakeRes());
    const memberCalls = callsMatching(mock.calls, '/rest/v1/memberships', 'POST');
    assert.equal(memberCalls.length, 1);
    const row = memberCalls[0].body[0];
    assert.equal(row.role, 'agent');
    assert.equal(row.organization_id, 'org-B');
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   7 — reintento idempotente
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[7] Idempotent retry — already linked, membership already exists');

await test('agente ya conectado + membership ya existe → recovery_sent, cero invite, cero patch, cero membership POST', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-6', email: 'done@example.invalid', organization_id: 'org-A', auth_user_id: 'already-linked-user-id', status: 'active', name: 'Done Agent' }],
    existingMembershipRows: [{ id: 'existing-membership' }],
    authUserById: { id: 'already-linked-user-id', email: 'done@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-01-02T00:00:00Z' }
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-6' } }), res);
    assert.equal(res._status, 200);
    assert.equal(res._body.outcome, 'recovery_sent');
    assert.equal(callsMatching(mock.calls, '/auth/v1/invite').length, 0, 'confirmed account must never get a second invite');
    assert.equal(callsMatching(mock.calls, '/auth/v1/recover').length, 1);
    assert.equal(callsMatching(mock.calls, '/rest/v1/agents', 'PATCH').length, 0);
    assert.equal(callsMatching(mock.calls, '/rest/v1/memberships', 'POST').length, 0);
  } finally { mock.restore(); }
});

await test('pulsar Invite dos veces seguidas nunca crea un segundo Auth user (simulado en 2 llamadas)', async () => {
  // First call: fresh agent.
  const mock1 = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-7', email: 'twice@example.invalid', organization_id: 'org-A', auth_user_id: null, status: 'active', name: 'Twice Agent' }]
  });
  let firstOutcome;
  try {
    const res1 = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-7' } }), res1);
    firstOutcome = res1._body.outcome;
    assert.equal(callsMatching(mock1.calls, '/auth/v1/invite').length, 1);
  } finally { mock1.restore(); }

  // Second call: same agent, now already linked (simulates the DB state
  // after the first call actually persisted) + membership now exists.
  const mock2 = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-7', email: 'twice@example.invalid', organization_id: 'org-A', auth_user_id: 'new-auth-user-id', status: 'active', name: 'Twice Agent' }],
    existingMembershipRows: [{ id: 'now-exists' }],
    authUserById: { id: 'new-auth-user-id', email: 'twice@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-01-02T00:00:00Z' }
  });
  try {
    const res2 = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-7' } }), res2);
    assert.equal(res2._status, 200);
    assert.equal(res2._body.outcome, 'recovery_sent');
    assert.equal(callsMatching(mock2.calls, '/auth/v1/invite').length, 0, 'second call must NOT invite again');
  } finally { mock2.restore(); }

  assert.equal(firstOutcome, 'invited');
});

/* ═══════════════════════════════════════════════════════════════
   8 — fallo parcial Auth → membership, reparación
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[8] Partial-failure repair — auth_user_id present, membership missing');

await test('auth_user_id ya presente pero SIN membership → repara la membership sin re-invitar (outcome sigue siendo recovery_sent, la cuenta está confirmada)', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-8', email: 'partial@example.invalid', organization_id: 'org-A', auth_user_id: 'orphaned-auth-user-id', status: 'active', name: 'Partial Agent' }],
    existingMembershipRows: [],  // no membership row yet — the partial-failure state
    authUserById: { id: 'orphaned-auth-user-id', email: 'partial@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-01-02T00:00:00Z' }
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-8' } }), res);
    assert.equal(res._status, 200);
    assert.equal(res._body.outcome, 'recovery_sent');
    assert.equal(callsMatching(mock.calls, '/auth/v1/invite').length, 0, 'must not invite — Auth user already exists');
    assert.equal(callsMatching(mock.calls, '/rest/v1/agents', 'PATCH').length, 0, 'must not re-link — already linked');
    const memberCalls = callsMatching(mock.calls, '/rest/v1/memberships', 'POST');
    assert.equal(memberCalls.length, 1);
    assert.equal(memberCalls[0].body[0].user_id, 'orphaned-auth-user-id');
  } finally { mock.restore(); }
});

await test('invite reporta "already registered" → repara usando el Auth user existente, nunca crea uno nuevo', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-9', email: 'existed-already@example.invalid', organization_id: 'org-A', auth_user_id: null, status: 'active', name: 'Existed Agent' }],
    inviteResult: () => ({ ok: false, status: 422, json: async () => ({ msg: 'User already registered' }), text: async () => 'already registered' }),
    existingAuthUsers: [{ id: 'preexisting-auth-id', email: 'existed-already@example.invalid' }]
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-9' } }), res);
    assert.equal(res._status, 200);
    assert.equal(res._body.outcome, 'repaired');
    const patchCalls = callsMatching(mock.calls, '/rest/v1/agents', 'PATCH');
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].body.auth_user_id, 'preexisting-auth-id');
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   8b — auth_user_id presente pero NUNCA confirmado → reenvío real
   (bug encontrado en el smoke test: "Resend / repair access" no
   reenviaba nada para un agente cuyo enlace de invitación original
   redirigió a la página equivocada y nunca llegó a aceptarse.

   Dos estados atascados distintos, dos remedios distintos:
     - nunca confirmado (link nunca abierto)      → reinvitar
     - confirmado pero sin sesión nunca completada → recovery link
       (Supabase rechaza un segundo invite para una cuenta ya
       confirmada, así que un simple reintento de /invite no sirve)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[8b] auth_user_id present but onboarding never completed → real resend/recovery');

await test('agente vinculado, nunca confirmado → llama a /auth/v1/invite de nuevo, outcome=resent', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-10', email: 'pending@example.invalid', organization_id: 'org-A', auth_user_id: 'pending-auth-user-id', status: 'active', name: 'Pending Agent' }],
    existingMembershipRows: [{ id: 'existing-membership' }],
    authUserById: { id: 'pending-auth-user-id', email: 'pending@example.invalid', email_confirmed_at: null, last_sign_in_at: null },
    inviteResult: () => ({ ok: true, status: 200, json: async () => ({ id: 'pending-auth-user-id', email: 'pending@example.invalid' }), text: async () => '' })
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-10' } }), res);
    assert.equal(res._status, 200);
    assert.equal(res._body.outcome, 'resent');
    const inviteCalls = callsMatching(mock.calls, '/auth/v1/invite', 'POST');
    assert.equal(inviteCalls.length, 1, 'must actually resend — the earlier invite link is dead');
    assert.equal(inviteCalls[0].body.email, 'pending@example.invalid');
    assert.ok(
      inviteCalls[0].url.includes('redirect_to=' + encodeURIComponent('https://larum-property-experience.vercel.app/admin.html')),
      'redirect_to must be a URL query param, not a JSON body field'
    );
    assert.equal(callsMatching(mock.calls, '/rest/v1/agents', 'PATCH').length, 0, 'same user id came back — no re-link needed');
    assert.equal(callsMatching(mock.calls, '/auth/v1/recover').length, 0);
  } finally { mock.restore(); }
});

await test('agente confirmado pero sin sesión nunca completada → envía recovery link, outcome=recovery_sent', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-13', email: 'stuck@example.invalid', organization_id: 'org-A', auth_user_id: 'stuck-auth-user-id', status: 'active', name: 'Stuck Agent' }],
    existingMembershipRows: [{ id: 'existing-membership' }],
    authUserById: { id: 'stuck-auth-user-id', email: 'stuck@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: null }
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-13' } }), res);
    assert.equal(res._status, 200);
    assert.equal(res._body.outcome, 'recovery_sent');
    assert.equal(callsMatching(mock.calls, '/auth/v1/invite').length, 0, 'must not attempt /invite on an already-confirmed account');
    const recoverCalls = callsMatching(mock.calls, '/auth/v1/recover', 'POST');
    assert.equal(recoverCalls.length, 1);
    assert.equal(recoverCalls[0].body.email, 'stuck@example.invalid');
    assert.ok(
      recoverCalls[0].url.includes('redirect_to=' + encodeURIComponent('https://larum-property-experience.vercel.app/admin.html')),
      'redirect_to must be a URL query param, not a JSON body field'
    );
  } finally { mock.restore(); }
});

await test('recovery falla en Supabase → 502, error propagado', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-14', email: 'recoverfail@example.invalid', organization_id: 'org-A', auth_user_id: 'recoverfail-auth-user-id', status: 'active', name: 'Recover Fail Agent' }],
    existingMembershipRows: [{ id: 'existing-membership' }],
    authUserById: { id: 'recoverfail-auth-user-id', email: 'recoverfail@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: null },
    recoveryResult: () => ({ ok: false, status: 500, json: async () => ({ msg: 'smtp_unavailable' }), text: async () => 'smtp_unavailable' })
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-14' } }), res);
    assert.equal(res._status, 502);
    assert.equal(res._body.error, 'recovery_failed');
  } finally { mock.restore(); }
});

await test('agente confirmado con sesión previa recibe recovery link igualmente (last_sign_in_at no distingue "usando la cuenta" de "sesión de invite descartada")', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-11', email: 'confirmed@example.invalid', organization_id: 'org-A', auth_user_id: 'confirmed-auth-user-id', status: 'active', name: 'Confirmed Agent' }],
    existingMembershipRows: [{ id: 'existing-membership' }],
    authUserById: { id: 'confirmed-auth-user-id', email: 'confirmed@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-01-02T00:00:00Z' }
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-11' } }), res);
    assert.equal(res._status, 200);
    assert.equal(res._body.outcome, 'recovery_sent');
    assert.equal(callsMatching(mock.calls, '/auth/v1/invite').length, 0, 'a confirmed agent must never be re-invited');
    assert.equal(callsMatching(mock.calls, '/auth/v1/recover').length, 1);
  } finally { mock.restore(); }
});

await test('fallo al consultar el Auth user por id → 502, sin intentar reenviar a ciegas', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-1' },
    adminMembershipRows: [{ id: 'm1' }],
    agentRows: [{ id: 'agent-12', email: 'lookupfail@example.invalid', organization_id: 'org-A', auth_user_id: 'ghost-auth-user-id', status: 'active', name: 'Lookup Fail Agent' }],
    authUserById: null
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-12' } }), res);
    assert.equal(res._status, 502);
    assert.equal(res._body.error, 'auth_user_lookup_failed');
    assert.equal(callsMatching(mock.calls, '/auth/v1/invite').length, 0);
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   9 — cross-org bloqueado
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[9] Cross-org invite blocked');

await test('admin de Org A no puede invitar a un agente de Org B → 403', async () => {
  const mock = installMockFetch({
    callerUser: { id: 'admin-org-a' },
    // The caller DOES have an admin membership row — but only for org-A,
    // never checked against org-B. isOrgAdmin() is called with the
    // TARGET agent's organization_id (org-B), for which no admin row
    // exists in this mock — so it must resolve to false regardless of
    // the caller's real admin status elsewhere.
    adminMembershipRows: [],
    agentRows: [{ id: 'agent-cross', email: 'crossorg@example.invalid', organization_id: 'org-B', auth_user_id: null, status: 'active', name: 'Cross Org Agent' }]
  });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'agent-cross' } }), res);
    assert.equal(res._status, 403);
    assert.equal(res._body.error, 'not_org_admin');
    assert.equal(callsMatching(mock.calls, '/auth/v1/invite').length, 0);
    assert.equal(callsMatching(mock.calls, '/rest/v1/agents', 'PATCH').length, 0);
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   Bonus: basic input/method validation (not explicitly numbered but
   cheap, real, and load-bearing for a POST-only privileged endpoint)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[bonus] Method + input validation');

await test('GET request → 405', async () => {
  const res = fakeRes();
  await handler(fakeReq({ method: 'GET' }), res);
  assert.equal(res._status, 405);
});

await test('sin agentId en el body (con caller válido) → 400', async () => {
  const mock = installMockFetch({ callerUser: { id: 'admin-1' } });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: {} }), res);
    assert.equal(res._status, 400);
    assert.equal(res._body.error, 'missing_agent_id');
  } finally { mock.restore(); }
});

await test('agentId apunta a un agente inexistente → 404', async () => {
  const mock = installMockFetch({ callerUser: { id: 'admin-1' }, agentRows: [] });
  try {
    const res = fakeRes();
    await handler(fakeReq({ body: { agentId: 'ghost-agent' } }), res);
    assert.equal(res._status, 404);
  } finally { mock.restore(); }
});

/* ═══════════════════════════════════════════════════════════════
   SUMMARY
   ═══════════════════════════════════════════════════════════════ */
console.log('\n══ M6.2 admin-invite-agent TEST SUMMARY ═══════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
