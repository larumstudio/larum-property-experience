/**
 * Admin-M6.7b · Follow-up — Test Matrix
 *
 * Dependency-free (node:assert). No browser. No Supabase.
 *
 * Groups:
 *   1 — followUpStatus() date classification (overdue/today/upcoming/none)
 *   2 — plainDate() formatting
 *   3 — followUpBadge() rendering
 *   4 — updateLead() accepts an optional noteElementId, defaults to
 *       'savedNote' (regression: every existing caller passes only 2
 *       args and must keep writing to #savedNote exactly as before)
 */

import assert from 'node:assert/strict';

globalThis.location = { protocol: 'https:', search: '' };
globalThis.window = {};

const elements = {};
globalThis.document = {
  getElementById: (id) => elements[id] || null,
  createElement: () => ({ id: '', className: '', textContent: '', classList: { add() {}, remove() {} }, setAttribute() {} }),
  body: { appendChild() {} },
  querySelectorAll: () => []
};

function mockNoteEl() {
  return { textContent: '', classList: { add() {}, remove() {} } };
}

const adminCore = await import('../admin/admin-core.js');
const adminUi = await import('../admin/admin-ui.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — followUpStatus()
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] followUpStatus() date classification');

function isoDate(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD', matches Postgres DATE over PostgREST
}

await test('null/undefined/empty follow_up_date → null (no status)', async () => {
  assert.equal(adminCore.followUpStatus(null), null);
  assert.equal(adminCore.followUpStatus(undefined), null);
  assert.equal(adminCore.followUpStatus(''), null);
});

await test('a date before today → overdue', async () => {
  assert.equal(adminCore.followUpStatus(isoDate(-3)), 'overdue');
  assert.equal(adminCore.followUpStatus(isoDate(-1)), 'overdue');
});

await test('today\'s date → today', async () => {
  assert.equal(adminCore.followUpStatus(isoDate(0)), 'today');
});

await test('a date after today → upcoming', async () => {
  assert.equal(adminCore.followUpStatus(isoDate(1)), 'upcoming');
  assert.equal(adminCore.followUpStatus(isoDate(30)), 'upcoming');
});

await test('an invalid date string → null, never throws', async () => {
  assert.equal(adminCore.followUpStatus('not-a-date'), null);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — plainDate()
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] plainDate() formatting');

await test('formats a plain DATE string without a timezone-driven day shift', async () => {
  const formatted = adminCore.plainDate('2026-08-25');
  assert.match(formatted, /25/);
  assert.match(formatted, /2026/);
});

await test('falls back to em-dash for missing/invalid input', async () => {
  assert.equal(adminCore.plainDate(null), '—');
  assert.equal(adminCore.plainDate(''), '—');
  assert.equal(adminCore.plainDate('garbage'), '—');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — followUpBadge()
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] followUpBadge() rendering');

await test('no date → empty string (table cells fall back to their own "—" badge)', async () => {
  assert.equal(adminUi.followUpBadge(null), '');
  assert.equal(adminUi.followUpBadge(''), '');
});

await test('overdue date → badge-red, "Overdue"', async () => {
  const html = adminUi.followUpBadge(isoDate(-2));
  assert.match(html, /badge-red/);
  assert.match(html, />Overdue</);
});

await test('today\'s date → badge-orange, "Today"', async () => {
  const html = adminUi.followUpBadge(isoDate(0));
  assert.match(html, /badge-orange/);
  assert.match(html, />Today</);
});

await test('future date → badge-muted, "Upcoming"', async () => {
  const html = adminUi.followUpBadge(isoDate(5));
  assert.match(html, /badge-muted/);
  assert.match(html, />Upcoming</);
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 4 — updateLead() noteElementId parameter
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[4] updateLead() — optional noteElementId (M6.7b), default unchanged');

function mockLeadsClient() {
  return {
    from() {
      const chain = {
        update: () => chain,
        eq: () => chain,
        select: () => chain,
        then: (resolve) => Promise.resolve({ data: [{ updated_at: '2026-01-02T00:00:00Z' }], error: null }).then(resolve)
      };
      return chain;
    }
  };
}

await test('called with only (lead, patch): writes to #savedNote, exactly like before M6.7b', async () => {
  const savedNote = mockNoteEl();
  const savedFollowUp = mockNoteEl();
  elements.savedNote = savedNote;
  elements.savedFollowUp = savedFollowUp;
  globalThis.supabaseClient = mockLeadsClient();

  try {
    const lead = { id: 'lead-1', status: 'new', notes: 'x', updated_at: '2026-01-01T00:00:00Z' };
    const ok = await adminCore.updateLead(lead, { status: 'contacted', notes: 'y' });
    assert.equal(ok, true);
    assert.equal(savedNote.textContent, 'Saved');
    assert.equal(savedFollowUp.textContent, '', 'an unrelated action\'s indicator must never be touched');
  } finally {
    delete elements.savedNote;
    delete elements.savedFollowUp;
    delete globalThis.supabaseClient;
  }
});

await test('called with a 3rd arg "savedFollowUp": writes there instead, #savedNote untouched', async () => {
  const savedNote = mockNoteEl();
  const savedFollowUp = mockNoteEl();
  elements.savedNote = savedNote;
  elements.savedFollowUp = savedFollowUp;
  globalThis.supabaseClient = mockLeadsClient();

  try {
    const lead = { id: 'lead-2', status: 'new', notes: 'x', updated_at: '2026-01-01T00:00:00Z' };
    const ok = await adminCore.updateLead(lead, { follow_up_date: '2026-09-01' }, 'savedFollowUp');
    assert.equal(ok, true);
    assert.equal(savedFollowUp.textContent, 'Saved');
    assert.equal(savedNote.textContent, '', 'saving the follow-up date must not flash "Saved" in the Advisor Notes indicator');
    assert.equal(lead.follow_up_date, '2026-09-01');
  } finally {
    delete elements.savedNote;
    delete elements.savedFollowUp;
    delete globalThis.supabaseClient;
  }
});

console.log('\n══ Admin-M6.7b TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
if (failed > 0) process.exit(1);
