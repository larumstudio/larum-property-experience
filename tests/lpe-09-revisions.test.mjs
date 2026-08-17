/**
 * LPE-09 · Revisions / Publish / Rollback
 *
 * Test targets:
 *   • schemas/property.schema.json       — new optional fields present
 *   • schemas/experience-revision.schema.json — new optional fields + additionalProperties
 *   • property-loader.js                 — ?source=db-v2 path, loadFromDbV2, loadPropertyRevision
 *   • admin/admin-property-store.js      — createRevision, publishRevision, rollback call sequences
 *
 * Uses createRequire so CJS property-loader.js can be loaded from this ESM file.
 * Admin store is a browser ESM module; window.supabaseClient is mocked via globalThis.
 */

import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/* ── Bootstrap globals (admin store + property-loader use window / location) ── */
globalThis.location = { protocol: 'https:', search: '' };
globalThis.window   = {};

/* ── Load modules ── */
const LarumLoader = require('../property-loader.js');

/* Dynamic import of browser ESM module — window must be set first (it is). */
const adminStore = await import('../admin/admin-property-store.js');

/* ── Helpers ── */
const readJSON = f => JSON.parse(readFileSync(join(root, f), 'utf8'));

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

/* ── Mock client factories ──────────────────────────────────────────── */

/**
 * Multi-table mock for the db-v2 loader path.
 *
 *   indexRows   — rows returned by the properties index query (includes
 *                 experience_revision_id for the db-v2 select)
 *   revisionMap — { revisionId: { content_snapshot, knowledge_snapshot, assets_snapshot } }
 *   fallbackMap — { slug: { slug, status, content, knowledge, assets } }
 *   opts        — { indexError, revisionError: { id: msg }, propertyError: { slug: msg } }
 */
function makeDbV2Client(indexRows, revisionMap, fallbackMap, opts) {
  opts = opts || {};
  const calls = { index: 0, revision: {}, property: {} };

  const client = {
    get calls() { return calls; },
    from(table) {
      const filters = {};
      let isSingle = false;

      const q = {
        select()  { return q; },
        order()   { return q; },
        limit()   { return q; },
        eq(c, v)  { filters[c] = v; return q; },
        maybeSingle() { isSingle = true; return q; },
        then(resolve) {
          let result;

          if (table === 'experience_revisions' && filters.id) {
            const id = filters.id;
            calls.revision[id] = (calls.revision[id] || 0) + 1;
            const err = opts.revisionError && opts.revisionError[id]
              ? { message: opts.revisionError[id] } : null;
            result = { data: err ? null : (revisionMap[id] || null), error: err };

          } else if (table === 'properties' && isSingle && filters.slug) {
            const s = filters.slug;
            calls.property[s] = (calls.property[s] || 0) + 1;
            const err = opts.propertyError && opts.propertyError[s]
              ? { message: opts.propertyError[s] } : null;
            result = { data: err ? null : (fallbackMap[s] || null), error: err };

          } else {
            /* properties index query (no slug filter, no maybeSingle) */
            calls.index++;
            const err = opts.indexError ? { message: opts.indexError } : null;
            result = { data: err ? null : indexRows, error: err };
          }

          return Promise.resolve(result).then(resolve);
        }
      };
      return q;
    }
  };
  return client;
}

/**
 * Recording mock for admin store operations.
 * Each call consumes one entry from the responses array in order.
 * Captures each operation for later assertion.
 */
function makeAdminMock(responses) {
  const calls = [];
  let idx = 0;

  const client = {
    get calls() { return calls; },
    from(table) {
      const op = { table, method: 'select', filters: {}, data: null, single: false };
      const q = {
        select(cols)  { op.cols = cols; return q; },
        insert(data)  { op.method = 'insert'; op.data = data; return q; },
        update(data)  { op.method = 'update'; op.data = data; return q; },
        eq(c, v)      { op.filters[c] = v; return q; },
        order()       { return q; },
        limit()       { return q; },
        maybeSingle() { op.single = true; return q; },
        single()      { op.single = true; return q; },
        then(resolve) {
          calls.push(Object.assign({}, op, { filters: Object.assign({}, op.filters) }));
          const resp = responses[idx++] || { data: null, error: null };
          resolve(resp);
        }
      };
      return q;
    }
  };
  return client;
}

/* ── Fixture data ─────────────────────────────────────────────────── */

const CONTENT  = readJSON('properties/madrid/content.json');
const KNOWLEDGE = readJSON('properties/madrid/knowledge.json');
const ASSETS   = readJSON('properties/madrid/assets.json');

const REVISION_ID_1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const REVISION_ID_2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const PROPERTY_UUID = 'bbbbbbbb-0000-0000-0000-000000000001';

const INDEX_ROWS_WITH_REV = [
  { slug: 'madrid', status: 'published', is_default: true, display_order: 0,
    label: 'Madrid · Goya', experience_revision_id: REVISION_ID_1 },
  { slug: 'marbella', status: 'published', is_default: false, display_order: 1,
    label: 'Nueva Andalucía · Marbella', experience_revision_id: null }
];

const INDEX_ROWS_NO_REV = [
  { slug: 'madrid', status: 'published', is_default: true, display_order: 0,
    label: 'Madrid · Goya', experience_revision_id: null }
];

const REVISION_MAP = {
  [REVISION_ID_1]: {
    content_snapshot:   { label: 'Revision Content', title: { en: 'Rev Title' } },
    knowledge_snapshot: { property: { facts: {} } },
    assets_snapshot:    {}
  }
};

const FALLBACK_MAP = {
  madrid: { slug: 'madrid', status: 'published', content: CONTENT, knowledge: KNOWLEDGE, assets: ASSETS }
};

/* ── Tests: Schema ───────────────────────────────────────────────── */

console.log('\nLPE-09 · Revisions / Publish / Rollback\n');

await test('T-S1 · property.schema.json — has experienceRevisionId and organizationId', () => {
  const schema = readJSON('schemas/property.schema.json');
  assert.ok('experienceRevisionId' in schema.properties, 'experienceRevisionId missing');
  assert.ok('organizationId' in schema.properties, 'organizationId missing');
  assert.equal(schema.properties.experienceRevisionId.type, 'string');
  assert.equal(schema.properties.organizationId.type, 'string');
  assert.ok(!schema.required.includes('experienceRevisionId'), 'must be optional');
  assert.ok(!schema.required.includes('organizationId'), 'must be optional');
});

await test('T-S2 · experience-revision.schema.json — has new optional fields + additionalProperties:false', () => {
  const schema = readJSON('schemas/experience-revision.schema.json');
  assert.strictEqual(schema.additionalProperties, false, 'additionalProperties must stay false');
  for (const f of ['publishedAt', 'changeSummary', 'approvalBy', 'sourceRevisionId', 'validationReport']) {
    assert.ok(f in schema.properties, `${f} missing from schema`);
    assert.ok(!schema.required.includes(f), `${f} must be optional (not in required)`);
  }
  assert.equal(schema.properties.publishedAt.type, 'string');
  assert.equal(schema.properties.publishedAt.format, 'date-time');
  assert.equal(schema.properties.changeSummary.type, 'string');
  assert.equal(schema.properties.approvalBy.type, 'string');
  assert.equal(schema.properties.sourceRevisionId.type, 'string');
  assert.equal(schema.properties.validationReport.type, 'object');
});

await test('T-S3 · experience-revision.schema.json — required fields unchanged', () => {
  const schema = readJSON('schemas/experience-revision.schema.json');
  const required = schema.required;
  for (const f of ['schemaVersion','id','propertyId','revisionNumber','status',
                   'manifest','contentSnapshot','knowledgeSnapshot','assetsSnapshot',
                   'createdBy','createdAt']) {
    assert.ok(required.includes(f), `${f} must remain in required`);
  }
});

/* ── Tests: loader db-v2 path ────────────────────────────────────── */

await test('T1 · loadFromDbV2 — index query fires once and includes experience_revision_id', async () => {
  const client = makeDbV2Client(INDEX_ROWS_WITH_REV, REVISION_MAP, FALLBACK_MAP);
  globalThis.window.supabaseClient = client;
  const ok = await LarumLoader.loadFromDbV2('.');
  assert.ok(ok, 'loadFromDbV2 should return true');
  assert.equal(client.calls.index, 1, 'index query fires exactly once');
});

await test('T2 · loadFromDbV2 — when revision exists, uses content_snapshot (not property content)', async () => {
  const client = makeDbV2Client(INDEX_ROWS_WITH_REV, REVISION_MAP, FALLBACK_MAP);
  globalThis.window.supabaseClient = client;
  await LarumLoader.loadFromDbV2('.');
  const content = LarumLoader.getContent('madrid');
  assert.ok(content, 'content must be loaded');
  assert.equal(content.label, 'Revision Content', 'must come from revision snapshot, not property row');
  assert.equal(client.calls.revision[REVISION_ID_1], 1, 'revision queried exactly once');
  assert.equal(client.calls.property['madrid'] || 0, 0, 'property fallback must NOT be queried when revision succeeds');
});

await test('T3 · loadFromDbV2 — when no revision pointer, falls back to property content', async () => {
  const client = makeDbV2Client(INDEX_ROWS_NO_REV, {}, FALLBACK_MAP);
  globalThis.window.supabaseClient = client;
  await LarumLoader.loadFromDbV2('.');
  assert.ok(LarumLoader.hasProperty('madrid'), 'madrid must be loaded via fallback');
  const content = LarumLoader.getContent('madrid');
  assert.equal(content.label, CONTENT.label, 'content must come from property row fallback');
  assert.equal(client.calls.property['madrid'], 1, 'property fallback query fires once');
});

await test('T4 · loadFromDbV2 — revision unavailable falls back gracefully', async () => {
  const client = makeDbV2Client(INDEX_ROWS_WITH_REV, {}, FALLBACK_MAP,
    { revisionError: { [REVISION_ID_1]: 'revision not found' } });
  globalThis.window.supabaseClient = client;
  const ok = await LarumLoader.loadFromDbV2('.');
  assert.ok(ok, 'must still succeed via fallback');
  assert.ok(LarumLoader.hasProperty('madrid'));
  assert.equal(LarumLoader.getContent('madrid').label, CONTENT.label, 'falls back to property content');
});

await test('T5 · loadPropertyRevision — idempotent (no duplicate revision query)', async () => {
  const client = makeDbV2Client(INDEX_ROWS_WITH_REV, REVISION_MAP, FALLBACK_MAP);
  globalThis.window.supabaseClient = client;
  await LarumLoader.loadFromDbV2('.');
  /* madrid already loaded — second call must be a no-op */
  const ok2 = await LarumLoader.loadPropertyRevision('madrid');
  assert.ok(ok2);
  assert.equal(client.calls.revision[REVISION_ID_1], 1, 'revision queried only once total');
});

await test('T6 · loadPropertyRevision — loads marbella on demand (no revision → fallback)', async () => {
  const client = makeDbV2Client(INDEX_ROWS_WITH_REV, REVISION_MAP,
    Object.assign({}, FALLBACK_MAP, {
      marbella: { slug: 'marbella', status: 'published',
        content: readJSON('properties/marbella/content.json'),
        knowledge: readJSON('properties/marbella/knowledge.json'),
        assets: readJSON('properties/marbella/assets.json') }
    }));
  globalThis.window.supabaseClient = client;
  await LarumLoader.loadFromDbV2('.');
  assert.ok(!LarumLoader.hasProperty('marbella'), 'marbella not loaded at boot');
  const ok = await LarumLoader.loadPropertyRevision('marbella');
  assert.ok(ok, 'on-demand load must succeed');
  assert.ok(LarumLoader.hasProperty('marbella'), 'marbella loaded after on-demand');
  assert.equal(client.calls.property['marbella'], 1, 'marbella loaded via property fallback (no revision)');
});

await test('T7 · loadFromDbV2 — data.source is "db-v2"', async () => {
  const client = makeDbV2Client(INDEX_ROWS_WITH_REV, REVISION_MAP, FALLBACK_MAP);
  globalThis.window.supabaseClient = client;
  await LarumLoader.loadFromDbV2('.');
  assert.equal(LarumLoader.getSource(), null, 'getSource reflects autoLoad source, not direct call');
  /* Verify via autoLoad path */
  globalThis.location = { protocol: 'https:', search: '?source=db-v2' };
  globalThis.window.supabaseClient = makeDbV2Client(INDEX_ROWS_WITH_REV, REVISION_MAP, FALLBACK_MAP);
  const ok = await LarumLoader.autoLoad('.');
  assert.ok(ok);
  assert.equal(LarumLoader.getSource(), 'db-v2', 'source is "db-v2" after autoLoad with ?source=db-v2');
  globalThis.location = { protocol: 'https:', search: '' };
});

await test('T8 · getIndexSlugs / getIndexLabel — work after loadFromDbV2', async () => {
  const client = makeDbV2Client(INDEX_ROWS_WITH_REV, REVISION_MAP, FALLBACK_MAP);
  globalThis.window.supabaseClient = client;
  await LarumLoader.loadFromDbV2('.');
  assert.deepEqual(LarumLoader.getIndexSlugs(), ['madrid', 'marbella']);
  assert.equal(LarumLoader.getIndexLabel('marbella'), 'Nueva Andalucía · Marbella');
});

await test('T9 · db source (?source=db) — unchanged, still uses property content', async () => {
  /* This mock only handles properties, not experience_revisions. */
  globalThis.location = { protocol: 'https:', search: '?source=db' };
  const dbOnlyClient = {
    from() {
      let isSingle = false;
      let slug = null;
      const q = {
        select() { return q; }, order() { return q; }, limit() { return q; },
        eq(c, v) { if (c === 'slug') slug = v; return q; },
        maybeSingle() { isSingle = true; return q; },
        then(resolve) {
          if (isSingle && slug) {
            resolve({ data: FALLBACK_MAP[slug] || null, error: null });
          } else {
            resolve({ data: [{ slug: 'madrid', status: 'published', is_default: true,
              display_order: 0, label: CONTENT.label }], error: null });
          }
        }
      };
      return q;
    }
  };
  globalThis.window.supabaseClient = dbOnlyClient;
  const ok = await LarumLoader.autoLoad('.');
  assert.ok(ok, 'db source must still work');
  assert.equal(LarumLoader.getSource(), 'db');
  assert.ok(LarumLoader.hasProperty('madrid'));
  assert.equal(LarumLoader.getContent('madrid').label, CONTENT.label);
  globalThis.location = { protocol: 'https:', search: '' };
});

/* ── Tests: admin store — call sequences ─────────────────────────── */

await test('T10 · createRevision — correct Supabase call sequence', async () => {
  const newRev = {
    id: REVISION_ID_1, property_id: PROPERTY_UUID, revision_number: 1,
    status: 'draft', manifest: {}, content_snapshot: CONTENT,
    knowledge_snapshot: KNOWLEDGE, assets_snapshot: ASSETS,
    created_by: 'test@larum.com', created_at: new Date().toISOString()
  };

  const mock = makeAdminMock([
    { data: { id: PROPERTY_UUID }, error: null },           // 1. select property id
    { data: null, error: null },                            // 2. select latest revision_number (none)
    { data: newRev, error: null }                           // 3. insert revision
  ]);
  globalThis.window.supabaseClient = mock;

  const result = await adminStore.createRevision('madrid', {
    content: CONTENT, knowledge: KNOWLEDGE, assets: ASSETS, createdBy: 'test@larum.com'
  });

  assert.equal(mock.calls.length, 3, 'exactly 3 Supabase calls');
  /* Call 1: select property id */
  assert.equal(mock.calls[0].table, 'properties');
  assert.equal(mock.calls[0].method, 'select');
  assert.equal(mock.calls[0].filters.slug, 'madrid');
  /* Call 2: select latest revision_number */
  assert.equal(mock.calls[1].table, 'experience_revisions');
  assert.equal(mock.calls[1].filters.property_id, PROPERTY_UUID);
  /* Call 3: insert */
  assert.equal(mock.calls[2].table, 'experience_revisions');
  assert.equal(mock.calls[2].method, 'insert');
  assert.equal(mock.calls[2].data.status, 'draft');
  assert.equal(mock.calls[2].data.revision_number, 1);
  assert.equal(mock.calls[2].data.created_by, 'test@larum.com');
  assert.deepEqual(mock.calls[2].data.content_snapshot, CONTENT);
  /* Return value */
  assert.equal(result.id, REVISION_ID_1);
  assert.equal(result.status, 'draft');
});

await test('T11 · createRevision — revision_number increments from latest', async () => {
  const mock = makeAdminMock([
    { data: { id: PROPERTY_UUID }, error: null },
    { data: { revision_number: 3 }, error: null },   // latest is #3
    { data: { id: REVISION_ID_2, status: 'draft', revision_number: 4 }, error: null }
  ]);
  globalThis.window.supabaseClient = mock;

  await adminStore.createRevision('madrid', {
    content: CONTENT, knowledge: KNOWLEDGE, assets: ASSETS, createdBy: 'test@larum.com'
  });

  assert.equal(mock.calls[2].data.revision_number, 4, 'revision_number = latest + 1');
});

await test('T12 · publishRevision — updates revision status then property pointer', async () => {
  const mock = makeAdminMock([
    { data: { id: PROPERTY_UUID }, error: null },   // 1. select property id
    { data: null, error: null },                    // 2. update revision status
    { data: null, error: null }                     // 3. update property pointer
  ]);
  globalThis.window.supabaseClient = mock;

  await adminStore.publishRevision('madrid', REVISION_ID_1);

  assert.equal(mock.calls.length, 3, 'exactly 3 Supabase calls');
  /* Call 1: select property id */
  assert.equal(mock.calls[0].table, 'properties');
  assert.equal(mock.calls[0].filters.slug, 'madrid');
  /* Call 2: update revision */
  assert.equal(mock.calls[1].table, 'experience_revisions');
  assert.equal(mock.calls[1].method, 'update');
  assert.equal(mock.calls[1].filters.id, REVISION_ID_1);
  assert.equal(mock.calls[1].filters.property_id, PROPERTY_UUID);
  assert.equal(mock.calls[1].data.status, 'published');
  assert.ok(mock.calls[1].data.published_at, 'published_at must be set');
  /* Call 3: update property pointer */
  assert.equal(mock.calls[2].table, 'properties');
  assert.equal(mock.calls[2].method, 'update');
  assert.equal(mock.calls[2].data.experience_revision_id, REVISION_ID_1);
  assert.equal(mock.calls[2].filters.id, PROPERTY_UUID);
});

await test('T13 · rollback — repoints property pointer only (no revision status mutation)', async () => {
  const mock = makeAdminMock([
    { data: { id: PROPERTY_UUID }, error: null },   // 1. select property id
    { data: null, error: null }                     // 2. update property pointer
  ]);
  globalThis.window.supabaseClient = mock;

  await adminStore.rollback('madrid', REVISION_ID_1);

  assert.equal(mock.calls.length, 2, 'exactly 2 Supabase calls (no revision mutation)');
  /* Call 1: select property */
  assert.equal(mock.calls[0].table, 'properties');
  /* Call 2: repoint property to target revision */
  assert.equal(mock.calls[1].table, 'properties');
  assert.equal(mock.calls[1].method, 'update');
  assert.equal(mock.calls[1].data.experience_revision_id, REVISION_ID_1);
  assert.equal(mock.calls[1].filters.id, PROPERTY_UUID);
});

/* ── Tests: full lifecycle ───────────────────────────────────────── */

await test('T14 · Lifecycle — create → publish → new-draft → publish → rollback', async () => {
  /* Simulates: CURRENT_PUBLISHED → CREATE DRAFT → PUBLISH → NEW PUBLISHED
                → CREATE NEW DRAFT → PUBLISH → ROLLBACK → PREVIOUS PUBLISHED

     We verify the pointer at each stage by inspecting mock call arguments.
  */

  /* State tracker: what is properties.experience_revision_id at each step */
  let pointerNow = null;

  function propertyRow() {
    return { id: PROPERTY_UUID, experience_revision_id: pointerNow };
  }

  /* Step 1: CREATE DRAFT (rev #1) */
  const mock1 = makeAdminMock([
    { data: propertyRow(), error: null },
    { data: null, error: null },   // no existing revisions
    { data: { id: REVISION_ID_1, status: 'draft', revision_number: 1 }, error: null }
  ]);
  globalThis.window.supabaseClient = mock1;
  const rev1 = await adminStore.createRevision('madrid', {
    content: CONTENT, knowledge: KNOWLEDGE, assets: ASSETS, createdBy: 'op@larum.com'
  });
  assert.equal(rev1.status, 'draft', 'new revision is draft');
  assert.equal(pointerNow, null, 'pointer still null after create');

  /* Step 2: PUBLISH rev #1 */
  const mock2 = makeAdminMock([
    { data: propertyRow(), error: null },
    { data: null, error: null },   // update revision status
    { data: null, error: null }    // update property pointer
  ]);
  globalThis.window.supabaseClient = mock2;
  await adminStore.publishRevision('madrid', REVISION_ID_1);
  /* Verify the update was called with revision #1 id */
  assert.equal(mock2.calls[2].data.experience_revision_id, REVISION_ID_1);
  pointerNow = REVISION_ID_1;  // simulate the DB update

  /* Step 3: CREATE NEW DRAFT (rev #2) */
  const mock3 = makeAdminMock([
    { data: propertyRow(), error: null },
    { data: { revision_number: 1 }, error: null },  // latest is #1
    { data: { id: REVISION_ID_2, status: 'draft', revision_number: 2 }, error: null }
  ]);
  globalThis.window.supabaseClient = mock3;
  const rev2 = await adminStore.createRevision('madrid', {
    content: CONTENT, knowledge: KNOWLEDGE, assets: ASSETS, createdBy: 'op@larum.com'
  });
  assert.equal(rev2.status, 'draft');
  assert.equal(rev2.revision_number, 2);
  assert.equal(pointerNow, REVISION_ID_1, 'pointer unchanged after new draft');

  /* Step 4: PUBLISH rev #2 */
  const mock4 = makeAdminMock([
    { data: propertyRow(), error: null },
    { data: null, error: null },
    { data: null, error: null }
  ]);
  globalThis.window.supabaseClient = mock4;
  await adminStore.publishRevision('madrid', REVISION_ID_2);
  assert.equal(mock4.calls[2].data.experience_revision_id, REVISION_ID_2);
  pointerNow = REVISION_ID_2;

  /* Step 5: ROLLBACK to rev #1 */
  const mock5 = makeAdminMock([
    { data: propertyRow(), error: null },
    { data: null, error: null }   // repoint
  ]);
  globalThis.window.supabaseClient = mock5;
  await adminStore.rollback('madrid', REVISION_ID_1);
  assert.equal(mock5.calls[1].data.experience_revision_id, REVISION_ID_1,
    'pointer rolled back to rev #1');
  /* Verify: NO revision status mutation in rollback */
  const revMutations = mock5.calls.filter(c =>
    c.table === 'experience_revisions' && c.method === 'update');
  assert.equal(revMutations.length, 0, 'rollback must not mutate any revision status');
  pointerNow = REVISION_ID_1;

  assert.equal(pointerNow, REVISION_ID_1, 'final pointer is rev #1 (previous published)');
});

await test('T15 · Regression — existing lpe-08 db path unaffected', async () => {
  /* Verify loadFromDb still works the same as in lpe-08 tests. */
  const dbClient = {
    from() {
      let isSingle = false;
      let slug = null;
      const q = {
        select() { return q; }, order() { return q; }, limit() { return q; },
        eq(c, v) { if (c === 'slug') slug = v; return q; },
        maybeSingle() { isSingle = true; return q; },
        then(resolve) {
          if (isSingle && slug) {
            resolve({ data: FALLBACK_MAP[slug] || null, error: null });
          } else {
            resolve({ data: [{ slug: 'madrid', status: 'published', is_default: true,
              display_order: 0, label: CONTENT.label }], error: null });
          }
        }
      };
      return q;
    }
  };
  globalThis.window.supabaseClient = dbClient;
  const ok = await LarumLoader.loadFromDb('.');
  assert.ok(ok, 'loadFromDb must still work');
  assert.ok(LarumLoader.hasProperty('madrid'));
  assert.equal(LarumLoader.getContent('madrid').label, CONTENT.label);
});

await test('T16 · Regression — pack path unaffected', () => {
  const pack = {
    registry: { order: ['madrid'], default: 'madrid', rules: {} },
    properties: { madrid: { content: CONTENT, knowledge: KNOWLEDGE, assets: ASSETS } },
    contact: null, purchase: null
  };
  globalThis.window.supabaseClient = null;
  const ok = LarumLoader.loadFromPack(pack);
  assert.ok(ok, 'loadFromPack must work');
  assert.ok(LarumLoader.hasProperty('madrid'));
  assert.equal(LarumLoader.getContent('madrid').label, CONTENT.label);
});

await test('T17 · ?source=db-v2 does not fall through to db/files/pack', async () => {
  /* When db-v2 fails, autoLoad should return false and leave no property loaded. */
  globalThis.location = { protocol: 'https:', search: '?source=db-v2' };
  globalThis.window.supabaseClient = makeDbV2Client([], {}, {}, { indexError: 'forced failure' });
  const ok = await LarumLoader.autoLoad('.');
  assert.ok(!ok, 'must return false when db-v2 explicitly requested but fails');
  /* The loader must not have loaded any property from a fallback source. */
  assert.equal(LarumLoader.getIndexSlugs().length, 0, 'no slugs in index after failed db-v2');
  assert.ok(!LarumLoader.hasProperty('madrid'), 'no property loaded from fallback');
  globalThis.location = { protocol: 'https:', search: '' };
});

await test('T18 · createRevision — throws on property not found', async () => {
  const mock = makeAdminMock([
    { data: null, error: { message: 'property not found' } }
  ]);
  globalThis.window.supabaseClient = mock;
  await assert.rejects(
    () => adminStore.createRevision('does-not-exist', {
      content: {}, knowledge: {}, assets: {}, createdBy: 'test@larum.com'
    }),
    /property not found/
  );
});

await test('T19 · publishRevision — throws on revision update error', async () => {
  const mock = makeAdminMock([
    { data: { id: PROPERTY_UUID }, error: null },
    { data: null, error: { message: 'revision update failed' } }
  ]);
  globalThis.window.supabaseClient = mock;
  await assert.rejects(
    () => adminStore.publishRevision('madrid', REVISION_ID_1),
    /revision update failed/
  );
});

await test('T20 · rollback — throws on property update error', async () => {
  const mock = makeAdminMock([
    { data: { id: PROPERTY_UUID }, error: null },
    { data: null, error: { message: 'rollback update failed' } }
  ]);
  globalThis.window.supabaseClient = mock;
  await assert.rejects(
    () => adminStore.rollback('madrid', REVISION_ID_1),
    /rollback update failed/
  );
});

/* ── Final report ──────────────────────────────────────────────── */
console.log(`\n${passed + failed} tests  ·  ${passed} passed  ·  ${failed} failed\n`);
if (failed) process.exit(1);
