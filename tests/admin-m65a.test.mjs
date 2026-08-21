/**
 * Admin-M6.5a · Optimistic Concurrency — Test Matrix
 *
 * Dependency-free (node:assert, node:fs, node:path). No browser. No
 * Supabase. Mock-based verification of the compare-and-swap mechanism
 * added to the 6 write points identified in the M6.5a discovery:
 *
 *   admin-property-store.js: saveContent, saveAssets, saveKnowledge,
 *                             savePropertyStatus, savePropertyMeta
 *   admin-core.js:            updateLead
 *
 * Groups:
 *   1 — saveContent / saveAssets / saveKnowledge: success / conflict / error
 *   2 — savePropertyStatus / savePropertyMeta: real-error + >1-row anomaly
 *       (success/conflict already covered in admin-m5x.test.mjs — not
 *       repeated here to avoid duplicate coverage of the same assertion)
 *   3 — Cross-tab flow: Content save → Assets save, same session, must
 *       NOT produce a false-positive conflict (the central design risk
 *       flagged in the M6.5a pre-implementation report)
 *   4 — ConflictError is exported and distinguishable from a plain Error
 *
 * updateLead()'s own success/conflict/error matrix already lives in
 * tests/admin-m64.test.mjs (group 4) — not duplicated here.
 */

import assert from 'node:assert/strict';

globalThis.location = { protocol: 'https:', search: '' };
globalThis.window = {};
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', className: '', textContent: '', classList: { add() {}, remove() {} }, setAttribute() {} }),
  body: { appendChild() {} },
  querySelectorAll: () => []
};

const adminStore = await import('../admin/admin-property-store.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.error('  FAIL  ' + name);
    console.error('        ' + e.message);
    failed++;
  }
}

/* Same shape as admin-m5x.test.mjs's mockClient, extended with a
   per-table call counter so a single test can script different
   responses for the 1st vs 2nd call against the same table — needed
   for the cross-tab scenario in group 3. */
function mockClient(tables) {
  const calls = {};
  return {
    from(table) {
      calls[table] = (calls[table] || 0) + 1;
      const callIndex = calls[table];
      const handlers = tables[table] || {};
      const chain = {
        select: (cols) => { chain._select = cols; return chain; },
        insert: (row) => { chain._inserted = row; return chain; },
        update: (patch) => { chain._updated = patch; return chain; },
        delete: () => chain,
        eq: (k, v) => { chain._eq = chain._eq || {}; chain._eq[k] = v; return chain; },
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => {
          if (handlers.maybeSingle) return handlers.maybeSingle(chain, callIndex);
          return Promise.resolve({ data: null, error: null });
        },
        single: () => {
          if (handlers.single) return handlers.single(chain, callIndex);
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve) => {
          if (handlers.then) return Promise.resolve(handlers.then(chain, callIndex)).then(resolve);
          return Promise.resolve({ data: [], error: null }).then(resolve);
        }
      };
      return chain;
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — saveContent / saveAssets / saveKnowledge
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] saveContent / saveAssets / saveKnowledge — success / conflict / error');

const CASES = [
  { fn: 'saveContent', arg: { title: 'New' } },
  { fn: 'saveAssets', arg: { hero: {} } },
  { fn: 'saveKnowledge', arg: { fallback: {} } }
];

for (const { fn, arg } of CASES) {
  await test(`${fn}: success updates the cached row's own field AND syncs updated_at`, async () => {
    adminStore.clearCache();
    globalThis.window.supabaseClient = mockClient({
      properties: {
        maybeSingle: () => Promise.resolve({
          data: { slug: 'test-slug', updated_at: '2026-01-01T00:00:00Z', content: {}, assets: {}, knowledge: {} },
          error: null
        }),
        then: () => Promise.resolve({ data: [{ updated_at: '2026-01-02T00:00:00Z' }], error: null })
      }
    });
    await adminStore.loadProperty('test-slug');

    await adminStore[fn]('test-slug', arg, '2026-01-01T00:00:00Z');

    const cached = adminStore.getCached('test-slug');
    assert.equal(cached.updated_at, '2026-01-02T00:00:00Z', 'cache must sync to the server-returned updated_at');
  });

  await test(`${fn}: 0 rows matched throws ConflictError, cache is left untouched`, async () => {
    adminStore.clearCache();
    globalThis.window.supabaseClient = mockClient({
      properties: {
        maybeSingle: () => Promise.resolve({
          data: { slug: 'test-slug', updated_at: '2026-01-01T00:00:00Z', content: {}, assets: {}, knowledge: {} },
          error: null
        }),
        then: () => Promise.resolve({ data: [], error: null })
      }
    });
    await adminStore.loadProperty('test-slug');

    await assert.rejects(
      () => adminStore[fn]('test-slug', arg, 'stale-value'),
      (e) => e instanceof adminStore.ConflictError,
      `${fn} must throw ConflictError, not a plain Error, on a 0-row match`
    );

    const cached = adminStore.getCached('test-slug');
    assert.equal(cached.updated_at, '2026-01-01T00:00:00Z', 'a conflicting save must never touch the cached updated_at');
  });

  await test(`${fn}: a real Supabase error throws a plain Error, never a ConflictError`, async () => {
    adminStore.clearCache();
    globalThis.window.supabaseClient = mockClient({
      properties: {
        maybeSingle: () => Promise.resolve({
          data: { slug: 'test-slug', updated_at: '2026-01-01T00:00:00Z', content: {}, assets: {}, knowledge: {} },
          error: null
        }),
        then: () => Promise.resolve({ data: null, error: { message: 'permission denied for table properties' } })
      }
    });
    await adminStore.loadProperty('test-slug');

    await assert.rejects(
      () => adminStore[fn]('test-slug', arg, '2026-01-01T00:00:00Z'),
      (e) => !(e instanceof adminStore.ConflictError) && /permission denied/.test(e.message),
      `${fn} must surface the real error message and must NOT be a ConflictError`
    );
  });

  await test(`${fn}: more than one row matching throws — never treated as silent success`, async () => {
    adminStore.clearCache();
    globalThis.window.supabaseClient = mockClient({
      properties: {
        maybeSingle: () => Promise.resolve({
          data: { slug: 'test-slug', updated_at: '2026-01-01T00:00:00Z', content: {}, assets: {}, knowledge: {} },
          error: null
        }),
        then: () => Promise.resolve({
          data: [{ updated_at: '2026-01-02T00:00:00Z' }, { updated_at: '2026-01-02T00:00:01Z' }],
          error: null
        })
      }
    });
    await adminStore.loadProperty('test-slug');

    await assert.rejects(() => adminStore[fn]('test-slug', arg, '2026-01-01T00:00:00Z'));
  });
}

/* Review finding A: the CASES loop above proves saveContent/saveAssets
   correctly thread expectedUpdatedAt into the .eq('updated_at', ...)
   filter only indirectly, via the Group 3 cross-tab test. saveKnowledge
   has no such indirect proof, so it needs its own explicit check —
   same pattern as admin-m5x.test.mjs's savePropertyStatus test. */
await test('saveKnowledge: the expectedUpdatedAt argument reaches the .eq("updated_at", ...) filter', async () => {
  adminStore.clearCache();
  let eqUpdatedAt = null;
  let eqSlug = null;

  globalThis.window.supabaseClient = mockClient({
    properties: {
      maybeSingle: () => Promise.resolve({
        data: { slug: 'test-slug', updated_at: '2026-01-01T00:00:00Z', content: {}, assets: {}, knowledge: {} },
        error: null
      }),
      then: (chain) => {
        eqSlug = chain._eq?.slug;
        eqUpdatedAt = chain._eq?.updated_at;
        return Promise.resolve({ data: [{ updated_at: '2026-01-02T00:00:00Z' }], error: null });
      }
    }
  });
  await adminStore.loadProperty('test-slug');

  await adminStore.saveKnowledge('test-slug', { fallback: {} }, '2026-01-01T00:00:00Z');

  assert.equal(eqSlug, 'test-slug');
  assert.equal(eqUpdatedAt, '2026-01-01T00:00:00Z', 'the expectedUpdatedAt passed in must reach the .eq() filter');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — savePropertyStatus / savePropertyMeta: remaining cases
   (success + 0-row-conflict already covered in admin-m5x.test.mjs)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] savePropertyStatus / savePropertyMeta — real error + >1-row anomaly');

await test('savePropertyStatus: a real Supabase error throws a plain Error, never a ConflictError', async () => {
  globalThis.window.supabaseClient = mockClient({
    properties: { then: () => Promise.resolve({ data: null, error: { message: 'network error' } }) }
  });
  await assert.rejects(
    () => adminStore.savePropertyStatus('test-slug', 'published', '2026-01-01T00:00:00Z'),
    (e) => !(e instanceof adminStore.ConflictError) && /network error/.test(e.message)
  );
});

await test('savePropertyMeta: more than one row matching throws, not silent success', async () => {
  globalThis.window.supabaseClient = mockClient({
    properties: {
      then: () => Promise.resolve({
        data: [{ updated_at: 'a' }, { updated_at: 'b' }],
        error: null
      })
    }
  });
  await assert.rejects(() => adminStore.savePropertyMeta('test-slug', { is_default: true }, '2026-01-01T00:00:00Z'));
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — Cross-tab flow: Content save → Assets save must NOT
   produce a false-positive conflict (the central design risk in the
   M6.5a pre-implementation report, §3 point 4)
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Cross-tab flow: Content save then Assets save in the same session');

await test('Assets save right after Content save reads the FRESH cache updated_at and does not conflict', async () => {
  adminStore.clearCache();

  // Dedicated counter for actual UPDATE calls only (resolved via
  // .then()) — NOT shared with .from()'s own per-table call count,
  // which also ticks up for loadProperty()'s unrelated .maybeSingle()
  // read. Mixing the two miscounts which save is "first".
  let updateCallCount = 0;

  globalThis.window.supabaseClient = mockClient({
    properties: {
      maybeSingle: () => Promise.resolve({
        data: { slug: 'villa', updated_at: '2026-01-01T00:00:00Z', content: {}, assets: {}, knowledge: {} },
        error: null
      }),
      then: () => {
        updateCallCount++;
        // 1st UPDATE call is Content's save, 2nd is Assets' save —
        // each bumps updated_at further, exactly like the real
        // touch_properties trigger would on two separate UPDATEs.
        if (updateCallCount === 1) return Promise.resolve({ data: [{ updated_at: '2026-01-01T00:05:00Z' }], error: null });
        return Promise.resolve({ data: [{ updated_at: '2026-01-01T00:10:00Z' }], error: null });
      }
    }
  });

  await adminStore.loadProperty('villa');
  const initial = adminStore.getCached('villa');
  assert.equal(initial.updated_at, '2026-01-01T00:00:00Z');

  // Content editor's handleSave(): reads propertyRef.updated_at fresh —
  // that's the cached object, so it's the initial value at this point.
  await adminStore.saveContent('villa', { title: 'Saved from Content tab' }, initial.updated_at);

  // The shared cache must now reflect Content's save.
  assert.equal(adminStore.getCached('villa').updated_at, '2026-01-01T00:05:00Z');

  // Assets editor's handleSave(), invoked right after in the same
  // session WITHOUT the operator reloading anything — it reads
  // updated_at fresh from the same shared cache object, which Content's
  // save already advanced. This must succeed, not throw ConflictError,
  // even though the value it reads is now different from what it was
  // when the Assets tab was first opened.
  await assert.doesNotReject(
    () => adminStore.saveAssets('villa', { hero: {} }, adminStore.getCached('villa').updated_at)
  );

  assert.equal(adminStore.getCached('villa').updated_at, '2026-01-01T00:10:00Z');
});

await test('Assets save using a STALE (pre-Content-save) updated_at correctly conflicts', async () => {
  // Sanity check for the test above: prove the mock/mechanism really
  // does distinguish "fresh value" from "stale value" — if this test
  // did NOT fail without the fix, the test above would be meaningless.
  // Models a real Postgres row: a single mutable "true" server value.
  // An UPDATE's .eq('updated_at', X) only matches (and only then
  // advances the value) when X equals whatever that true value
  // currently is — exactly what touch_properties + PostgREST really do.
  adminStore.clearCache();
  let serverUpdatedAt = '2026-01-01T00:00:00Z';
  let tick = 0;

  globalThis.window.supabaseClient = mockClient({
    properties: {
      maybeSingle: () => Promise.resolve({
        data: { slug: 'villa2', updated_at: serverUpdatedAt, content: {}, assets: {}, knowledge: {} },
        error: null
      }),
      then: (chain) => {
        if (chain._eq?.updated_at !== serverUpdatedAt) {
          return Promise.resolve({ data: [], error: null }); // real 0-row conflict
        }
        tick++;
        serverUpdatedAt = '2026-01-01T00:0' + tick + ':00Z';
        return Promise.resolve({ data: [{ updated_at: serverUpdatedAt }], error: null });
      }
    }
  });

  await adminStore.loadProperty('villa2');
  await adminStore.saveContent('villa2', { title: 'x' }, '2026-01-01T00:00:00Z');
  assert.equal(adminStore.getCached('villa2').updated_at, serverUpdatedAt);

  // Deliberately reusing the ORIGINAL (now-stale) value, as an editor
  // would if it had captured updated_at once instead of reading it
  // fresh at save time — this is exactly the bug the design in §3 of
  // the pre-implementation report avoids in the real editors.
  await assert.rejects(
    () => adminStore.saveAssets('villa2', { hero: {} }, '2026-01-01T00:00:00Z'),
    (e) => e instanceof adminStore.ConflictError
  );
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 4 — ConflictError shape
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[4] ConflictError');

await test('ConflictError is exported, extends Error, and carries the exact required message by default', async () => {
  const e = new adminStore.ConflictError();
  assert.ok(e instanceof Error);
  assert.ok(e instanceof adminStore.ConflictError);
  assert.equal(e.message, 'Este registro cambió mientras lo editabas. Recargá antes de guardar.');
  assert.equal(e.name, 'ConflictError');
});

console.log('\n══ Admin-M6.5a TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
