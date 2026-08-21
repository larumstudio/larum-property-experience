/**
 * Admin-M5.X · Structural + Functional Tests
 *
 * Dependency-free (node:assert, node:fs, node:path).
 * No browser. No Supabase. Mock-based verification of store call sequences.
 *
 * Groups:
 *   1 — File structure: modified files exist and export expected symbols
 *   2 — Store: createProperty call sequence (mock Supabase)
 *   3 — Store: savePropertyStatus / savePropertyMeta call sequences
 *   4 — Workspace: status transitions map validity
 *   5 — Properties UI: create form structure
 *   6 — Admin injection gate on modified files
 *   7 — Protected files unchanged
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const readFile = f => readFileSync(join(root, f), 'utf8');
const exists = f => existsSync(join(root, f));

/* ── Bootstrap globals ── */
globalThis.location = { protocol: 'https:', search: '' };
globalThis.window = {};
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', className: '', textContent: '', classList: { add() {}, remove() {} }, setAttribute() {} }),
  body: { appendChild() {} },
  querySelectorAll: () => []
};

/* ── Dynamic import of browser ESM modules ── */
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

/* ═══════════════════════════════════════════════════════════════
   GROUP 1 — File structure
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[1] File structure');

await test('admin-property-store.js exists and exports createProperty', async () => {
  assert.ok(exists('admin/admin-property-store.js'));
  assert.equal(typeof adminStore.createProperty, 'function');
});

await test('admin-property-store.js exports savePropertyStatus', async () => {
  assert.equal(typeof adminStore.savePropertyStatus, 'function');
});

await test('admin-property-store.js exports savePropertyMeta', async () => {
  assert.equal(typeof adminStore.savePropertyMeta, 'function');
});

await test('admin-property-store.js exports loadAgents', async () => {
  assert.equal(typeof adminStore.loadAgents, 'function');
});

await test('admin-property-store.js exports loadRevisions', async () => {
  assert.equal(typeof adminStore.loadRevisions, 'function');
});

await test('admin-properties.js exists and references createProperty', async () => {
  assert.ok(exists('admin/admin-properties.js'));
  const src = readFile('admin/admin-properties.js');
  assert.ok(src.includes('createProperty'), 'missing createProperty import/usage');
});

await test('admin-workspace.js exists and references savePropertyStatus', async () => {
  assert.ok(exists('admin/admin-workspace.js'));
  const src = readFile('admin/admin-workspace.js');
  assert.ok(src.includes('savePropertyStatus'), 'missing savePropertyStatus import/usage');
});

await test('admin-workspace.js references savePropertyMeta', async () => {
  const src = readFile('admin/admin-workspace.js');
  assert.ok(src.includes('savePropertyMeta'), 'missing savePropertyMeta import/usage');
});

await test('admin-workspace.js has Revisions tab', async () => {
  const src = readFile('admin/admin-workspace.js');
  assert.ok(src.includes("id: 'revisions'"), 'missing revisions tab definition');
  assert.ok(src.includes('revisionsPanelMount'), 'missing revisions panel mount');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 2 — Store: createProperty call sequence
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[2] Store: createProperty call sequence');

function mockClient(tables) {
  return {
    from(table) {
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
          if (handlers.maybeSingle) return handlers.maybeSingle(chain);
          return Promise.resolve({ data: null, error: null });
        },
        single: () => {
          if (handlers.single) return handlers.single(chain);
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve) => {
          if (handlers.then) return handlers.then(chain).then(resolve);
          return Promise.resolve({ data: [], error: null }).then(resolve);
        }
      };
      return chain;
    }
  };
}

await test('createProperty inserts with status=draft and is_default=false', async () => {
  let insertedRow = null;
  const ORG_ID = 'org-test-123';

  globalThis.window.supabaseClient = mockClient({
    organizations: {
      maybeSingle: () => Promise.resolve({ data: { id: ORG_ID }, error: null })
    },
    properties: {
      single: (chain) => {
        insertedRow = chain._inserted;
        const mockData = {
          ...insertedRow,
          id: 'prop-new-1',
          slug: insertedRow.slug,
          status: insertedRow.status,
          name_en: null, name_es: null, location: null,
          reference: null, cover_image: null, property_type: null,
          price: null, currency: null,
          created_at: '2026-01-01', updated_at: '2026-01-01',
          published_at: null,
          experience_revision_id: null
        };
        return Promise.resolve({ data: mockData, error: null });
      }
    }
  });

  adminStore.clearCache();
  const result = await adminStore.createProperty({
    slug: 'test-prop',
    label: 'Test Property',
    brand: 'TestBrand',
    subtitle: 'A test',
    referencePrice: 500000,
    defaultRegion: 'Madrid',
    defaultPropertyType: 'resale',
    agentId: null
  });

  assert.ok(insertedRow, 'insert was not called');
  assert.equal(insertedRow.slug, 'test-prop');
  assert.equal(insertedRow.status, 'draft');
  assert.equal(insertedRow.is_default, false);
  assert.equal(insertedRow.organization_id, ORG_ID);
  assert.equal(insertedRow.content.slug, 'test-prop');
  assert.equal(insertedRow.content.label, 'Test Property');
  assert.equal(insertedRow.content.brand, 'TestBrand');
  assert.equal(insertedRow.content.referencePrice, 500000);
  assert.equal(insertedRow.content.defaultRegion, 'Madrid');
  assert.ok(result.id, 'result should have an id');
});

await test('createProperty sets content.defaultPropertyType from param', async () => {
  let insertedRow = null;

  globalThis.window.supabaseClient = mockClient({
    organizations: {
      maybeSingle: () => Promise.resolve({ data: { id: 'org-1' }, error: null })
    },
    properties: {
      single: (chain) => {
        insertedRow = chain._inserted;
        return Promise.resolve({
          data: { ...insertedRow, id: 'prop-2', name_en: null, name_es: null,
            location: null, reference: null, cover_image: null, property_type: null,
            price: null, currency: null, created_at: '2026-01-01', updated_at: '2026-01-01',
            published_at: null, experience_revision_id: null },
          error: null
        });
      }
    }
  });

  adminStore.clearCache();
  await adminStore.createProperty({
    slug: 'test-new', label: 'New Build', defaultPropertyType: 'new'
  });

  assert.equal(insertedRow.content.defaultPropertyType, 'new');
});

await test('createProperty throws on missing organization', async () => {
  globalThis.window.supabaseClient = mockClient({
    organizations: {
      maybeSingle: () => Promise.resolve({ data: null, error: null })
    }
  });

  adminStore.clearCache();
  await assert.rejects(
    () => adminStore.createProperty({ slug: 'no-org', label: 'No Org' }),
    /No organization found/
  );
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 3 — Store: savePropertyStatus / savePropertyMeta
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[3] Store: savePropertyStatus / savePropertyMeta');

/* M6.5a: every real (non-empty) update() now also filters on
   updated_at and reads back via .select('updated_at') for the
   optimistic-concurrency check — the mock's `then` handler must
   return a 1-row array, not `data: null`, or the store would
   misread a normal successful save as a 0-row conflict. */
await test('savePropertyStatus updates status and sets published_at for published', async () => {
  let updatedPatch = null;
  let eqSlug = null;
  let eqUpdatedAt = null;

  globalThis.window.supabaseClient = mockClient({
    properties: {
      then: (chain) => {
        updatedPatch = chain._updated;
        eqSlug = chain._eq?.slug;
        eqUpdatedAt = chain._eq?.updated_at;
        return Promise.resolve({ data: [{ updated_at: '2026-01-02T00:00:00Z' }], error: null });
      }
    }
  });

  await adminStore.savePropertyStatus('test-slug', 'published', '2026-01-01T00:00:00Z');

  assert.ok(updatedPatch, 'update was not called');
  assert.equal(updatedPatch.status, 'published');
  assert.ok(updatedPatch.published_at, 'published_at should be set');
  assert.equal(eqSlug, 'test-slug');
  assert.equal(eqUpdatedAt, '2026-01-01T00:00:00Z', 'the expectedUpdatedAt passed in must reach the .eq() filter');
});

await test('savePropertyStatus does NOT set published_at for draft', async () => {
  let updatedPatch = null;

  globalThis.window.supabaseClient = mockClient({
    properties: {
      then: (chain) => {
        updatedPatch = chain._updated;
        return Promise.resolve({ data: [{ updated_at: '2026-01-02T00:00:00Z' }], error: null });
      }
    }
  });

  await adminStore.savePropertyStatus('test-slug', 'draft', '2026-01-01T00:00:00Z');

  assert.equal(updatedPatch.status, 'draft');
  assert.equal(updatedPatch.published_at, undefined);
});

await test('savePropertyStatus throws ConflictError and does not touch the cache when 0 rows match', async () => {
  globalThis.window.supabaseClient = mockClient({
    properties: {
      then: () => Promise.resolve({ data: [], error: null })
    }
  });

  await assert.rejects(
    () => adminStore.savePropertyStatus('test-slug', 'published', 'stale-timestamp'),
    (e) => e instanceof adminStore.ConflictError
  );
});

await test('savePropertyMeta only allows display_order, is_default, agent_id', async () => {
  let updatedPatch = null;

  globalThis.window.supabaseClient = mockClient({
    properties: {
      then: (chain) => {
        updatedPatch = chain._updated;
        return Promise.resolve({ data: [{ updated_at: '2026-01-02T00:00:00Z' }], error: null });
      }
    }
  });

  await adminStore.savePropertyMeta('test-slug', {
    display_order: 3,
    is_default: true,
    agent_id: 'agent-1',
    status: 'published',
    slug: 'hacked'
  }, '2026-01-01T00:00:00Z');

  assert.ok(updatedPatch, 'update was not called');
  assert.equal(updatedPatch.display_order, 3);
  assert.equal(updatedPatch.is_default, true);
  assert.equal(updatedPatch.agent_id, 'agent-1');
  assert.equal(updatedPatch.status, undefined, 'status should not be in meta patch');
  assert.equal(updatedPatch.slug, undefined, 'slug should not be in meta patch');
});

/* Review finding A (M6.5a): savePropertyStatus's own eqUpdatedAt check
   above doesn't cover savePropertyMeta separately — same helper
   function, but a copy-paste regression in either call site would go
   uncaught without its own explicit assertion. */
await test('savePropertyMeta: the expectedUpdatedAt argument reaches the .eq("updated_at", ...) filter', async () => {
  let eqSlug = null;
  let eqUpdatedAt = null;

  globalThis.window.supabaseClient = mockClient({
    properties: {
      then: (chain) => {
        eqSlug = chain._eq?.slug;
        eqUpdatedAt = chain._eq?.updated_at;
        return Promise.resolve({ data: [{ updated_at: '2026-01-02T00:00:00Z' }], error: null });
      }
    }
  });

  await adminStore.savePropertyMeta('test-slug', { display_order: 1 }, '2026-01-01T00:00:00Z');

  assert.equal(eqSlug, 'test-slug');
  assert.equal(eqUpdatedAt, '2026-01-01T00:00:00Z', 'the expectedUpdatedAt passed in must reach the .eq() filter');
});

await test('savePropertyMeta skips empty patch', async () => {
  let updateCalled = false;

  globalThis.window.supabaseClient = mockClient({
    properties: {
      then: (chain) => {
        if (chain._updated) updateCalled = true;
        return Promise.resolve({ data: [{ updated_at: '2026-01-02T00:00:00Z' }], error: null });
      }
    }
  });

  await adminStore.savePropertyMeta('test-slug', { status: 'published' }, '2026-01-01T00:00:00Z');
  assert.ok(!updateCalled, 'update should not be called for disallowed keys only');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 4 — Workspace: status transitions map
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[4] Workspace: status transitions');

await test('workspace defines valid status transitions', async () => {
  const src = readFile('admin/admin-workspace.js');
  assert.ok(src.includes('STATUS_TRANSITIONS'), 'missing STATUS_TRANSITIONS');

  assert.ok(src.includes("draft:"), 'missing draft transitions');
  assert.ok(src.includes("in_production:"), 'missing in_production transitions');
  assert.ok(src.includes("ready:"), 'missing ready transitions');
  assert.ok(src.includes("published:"), 'missing published transitions');
  assert.ok(src.includes("archived:"), 'missing archived transitions');
});

await test('workspace requires confirmation for publish and archive', async () => {
  const src = readFile('admin/admin-workspace.js');
  assert.ok(src.includes('CONFIRM_STATUSES'), 'missing CONFIRM_STATUSES');
  assert.ok(src.includes("'published'"), 'published not in confirm set');
  assert.ok(src.includes("'archived'"), 'archived not in confirm set');
});

await test('workspace has confirmation UI with cancel', async () => {
  const src = readFile('admin/admin-workspace.js');
  assert.ok(src.includes('__wsConfirmStatus'), 'missing confirm handler');
  assert.ok(src.includes('__wsCancelStatus'), 'missing cancel handler');
  assert.ok(src.includes('pendingStatus'), 'missing pendingStatus state');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 5 — Properties UI: create form
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[5] Properties UI: create form');

await test('properties.js has slug validation regex', async () => {
  const src = readFile('admin/admin-properties.js');
  assert.ok(src.includes('SLUG_RE'), 'missing SLUG_RE');
  assert.ok(src.includes('[a-z0-9]'), 'SLUG_RE should enforce lowercase');
});

await test('properties.js checks slug uniqueness before create', async () => {
  const src = readFile('admin/admin-properties.js');
  assert.ok(src.includes('already exists'), 'missing slug uniqueness check');
});

await test('properties.js has create form with required fields', async () => {
  const src = readFile('admin/admin-properties.js');
  assert.ok(src.includes('cp_slug'), 'missing slug field');
  assert.ok(src.includes('cp_label'), 'missing label field');
  assert.ok(src.includes('cp_brand'), 'missing brand field');
  assert.ok(src.includes('cp_region'), 'missing region field');
  assert.ok(src.includes('cp_type'), 'missing type field');
  assert.ok(src.includes('cp_price'), 'missing price field');
});

await test('properties.js navigates to workspace after create', async () => {
  const src = readFile('admin/admin-properties.js');
  assert.ok(src.includes("navigate('workspace'"), 'missing navigate to workspace');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 6 — Admin injection gate on modified files
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[6] Admin injection gate (modified files)');

const MODIFIED_FILES = [
  'admin/admin-property-store.js',
  'admin/admin-properties.js',
  'admin/admin-workspace.js'
];

const INJECTION_PATTERNS = [
  /document\.write\s*\(/,
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /setTimeout\s*\(\s*['"`]/,
  /setInterval\s*\(\s*['"`]/
];

for (const file of MODIFIED_FILES) {
  await test(file + ': no injection patterns', async () => {
    const src = readFile(file);
    for (const pat of INJECTION_PATTERNS) {
      assert.ok(!pat.test(src), 'injection pattern found: ' + pat);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   GROUP 7 — Protected files unchanged
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[7] Protected files exist');

const PROTECTED = [
  'index.html',
  'analytics.js',
  'property-loader.js',
  'experience-shell.js',
  'consent.js',
  'admin/admin-core.js',
  'admin/admin-ui.js',
  'admin/admin-router.js',
  'admin/admin-content-editor.js',
  'admin/admin-assets-editor.js',
  'admin/admin-knowledge-editor.js'
];

for (const file of PROTECTED) {
  await test(file + ' exists (not removed)', async () => {
    assert.ok(exists(file), file + ' is missing');
  });
}

/* ═══════════════════════════════════════════════════════════════
   GROUP 8 — Revisions tab: graceful migration 005 handling
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[8] Revisions tab: migration 005 gate');

await test('workspace handles missing experience_revisions table gracefully', async () => {
  const src = readFile('admin/admin-workspace.js');
  assert.ok(src.includes('experience_revisions'), 'should reference experience_revisions');
  assert.ok(src.includes('Migration 005 not applied'), 'should show migration 005 message');
  assert.ok(src.includes('does not exist'), 'should handle table-not-found error');
});

await test('migration 005 SQL file exists and is NOT applied marker', async () => {
  assert.ok(exists('docs/migrations/005_experience_revisions.sql'), 'migration 005 SQL missing');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 9 — Bug 1 regression: loadProperty must self-heal against a
   missing experience_revision_id column on its own, independent of
   whether loadIndex() ever ran first (Workspace deep-link / refresh).
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[9] loadProperty resilience — Bug 1 regression');

await test('loadProperty succeeds on a cold deep-link when experience_revision_id is missing (no prior loadIndex)', async () => {
  // Fresh module instance so hasRevisionColumn starts unknown (null),
  // exactly like a freshly loaded page navigating straight to
  // #workspace/slug — loadIndex() (Propiedades) never ran.
  const fresh = await import('../admin/admin-property-store.js?fresh-bug1-' + Math.random());

  globalThis.window.supabaseClient = mockClient({
    properties: {
      // ensureRevisionColumnKnown()'s probe: select('experience_revision_id').limit(1),
      // awaited via the bare thenable (no .single()/.maybeSingle() call).
      then: () => Promise.resolve({
        data: null,
        error: { message: 'column properties.experience_revision_id does not exist' }
      }),
      // loadProperty's real query, issued after the probe reports the column missing.
      maybeSingle: (chain) => {
        assert.ok(
          !chain._select.includes('experience_revision_id'),
          'loadProperty must drop experience_revision_id from its own query once detected missing'
        );
        return Promise.resolve({
          data: { id: 'p1', slug: 'villa-coldstart', status: 'draft', content: {}, knowledge: {}, assets: {} },
          error: null
        });
      }
    }
  });

  const data = await fresh.loadProperty('villa-coldstart');

  assert.ok(data, 'loadProperty should return the property despite the missing column');
  assert.equal(data.slug, 'villa-coldstart');
  assert.ok(fresh.isLoaded('villa-coldstart'), 'property should now be cached');
});

await test('once detected missing, the column stays excluded for later loadIndex() calls too (no duplicate probing)', async () => {
  const fresh = await import('../admin/admin-property-store.js?fresh-bug1b-' + Math.random());

  let probeCalls = 0;
  globalThis.window.supabaseClient = mockClient({
    properties: {
      then: (chain) => {
        if (chain._select === 'experience_revision_id') {
          probeCalls++;
          return Promise.resolve({
            data: null,
            error: { message: 'column properties.experience_revision_id does not exist' }
          });
        }
        // The real loadIndex query, run after detection.
        assert.ok(!chain._select.includes('experience_revision_id'), 'loadIndex must drop the missing column');
        return Promise.resolve({ data: [{ id: 'p1', slug: 'villa-a' }], error: null });
      },
      maybeSingle: (chain) => {
        assert.ok(!chain._select.includes('experience_revision_id'));
        return Promise.resolve({
          data: { id: 'p1', slug: 'villa-coldstart', status: 'draft', content: {}, knowledge: {}, assets: {} },
          error: null
        });
      }
    }
  });

  await fresh.loadProperty('villa-coldstart');
  await fresh.loadIndex();

  assert.equal(probeCalls, 1, 'the missing-column probe must run exactly once per session, shared across loadProperty and loadIndex');
});

/* ═══════════════════════════════════════════════════════════════
   GROUP 10 — Bug 2 regression: publishRevision / rollback must keep
   the cached property (== Workspace's currentProperty reference) in
   sync with the real active revision, with no second stale copy.
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[10] publishRevision / rollback state sync — Bug 2 regression');

await test('publishRevision updates experience_revision_id on the SAME cached object (no stale currentProperty)', async () => {
  globalThis.window.supabaseClient = mockClient({
    properties: {
      maybeSingle: () => Promise.resolve({
        data: { id: 'prop-1', slug: 'villa-sync', experience_revision_id: 'rev-old', content: {}, knowledge: {}, assets: {} },
        error: null
      }),
      then: () => Promise.resolve({ data: null, error: null })
    },
    experience_revisions: {
      then: () => Promise.resolve({ data: null, error: null })
    }
  });

  adminStore.clearCache();
  const before = await adminStore.loadProperty('villa-sync');
  assert.equal(before.experience_revision_id, 'rev-old');

  await adminStore.publishRevision('villa-sync', 'rev-new');

  const after = adminStore.getCached('villa-sync');
  assert.strictEqual(after, before,
    'publishRevision must mutate the object already held by any live reference (e.g. Workspace currentProperty), not clear/replace it');
  assert.equal(after.experience_revision_id, 'rev-new',
    'the active revision pointer must be visible immediately, without leaving and re-entering the Workspace');
});

await test('rollback updates experience_revision_id on the SAME cached object (no stale currentProperty)', async () => {
  globalThis.window.supabaseClient = mockClient({
    properties: {
      maybeSingle: () => Promise.resolve({
        data: { id: 'prop-1', slug: 'villa-rollback', experience_revision_id: 'rev-3', content: {}, knowledge: {}, assets: {} },
        error: null
      }),
      then: () => Promise.resolve({ data: null, error: null })
    }
  });

  adminStore.clearCache();
  const before = await adminStore.loadProperty('villa-rollback');
  assert.equal(before.experience_revision_id, 'rev-3');

  await adminStore.rollback('villa-rollback', 'rev-1');

  const after = adminStore.getCached('villa-rollback');
  assert.strictEqual(after, before, 'rollback must mutate the same object in place, not clear/replace it');
  assert.equal(after.experience_revision_id, 'rev-1',
    'the active revision pointer must reflect the rollback immediately, without leaving and re-entering the Workspace');
});

/* ═══════════════════════════════════════════════════════════════ */

console.log('\n══ Admin-M5.X TEST SUMMARY ═══════════════════════════════════');
console.log('  ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
if (failed > 0) {
  console.error('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nRESULT: PASS');
  process.exit(0);
}
