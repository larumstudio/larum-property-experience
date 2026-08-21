/* ── Larum Admin · Property Store ──────────────────────────────
   Lightweight index + lazy full-property loading + in-memory
   cache. The admin never bulk-loads content/knowledge/assets
   for every property; it fetches the index (generated columns
   only) for the list, and loads the full payload on demand
   when entering a workspace.

   This is the admin's data layer, separate from property-loader.js
   which serves the visitor-facing experience.
   ───────────────────────────────────────────────────────────── */

const store = {
  index: [],
  cache: new Map(),
  indexLoaded: false,
  loading: new Set()
};

/* ── Optimistic concurrency (M6.5a) ───────────────────────────
   Every write in this file that can race against another operator
   (properties.content/assets/knowledge/status/meta) keys its UPDATE
   on the row's own `updated_at` — not because the app assigns that
   value, but because migration 001's touch_updated_at() trigger
   already bumps it on every UPDATE, for free, on every table it's
   attached to. Reusing it means zero new schema for the 5 functions
   below (leads needed its own copy of the same column+trigger —
   see docs/migrations/007_leads_updated_at.sql — since `leads` never
   had one).

   ConflictError is the ONE signal that separates "someone else wrote
   this row since I loaded it" from a real Supabase/RLS/network error.
   PostgREST does not treat "UPDATE matched 0 rows" as an error — an
   .update().eq(...) with a stale updated_at returns { error: null,
   data: [] } exactly like a legitimate empty result would. Skipping
   the .select() and the data.length check here would make a real
   conflict indistinguishable from success — the write silently loses
   without ever telling the operator. That is the failure mode this
   whole mechanism exists to prevent, so every caller of the functions
   below must treat "no error" and "0 rows returned" as two separate
   outcomes, never collapse them. */
export const CONFLICT_MESSAGE = 'Este registro cambió mientras lo editabas. Recargá antes de guardar.';

export class ConflictError extends Error {
  constructor(message) {
    super(message || CONFLICT_MESSAGE);
    this.name = 'ConflictError';
  }
}

/* Shared compare-and-swap UPDATE. `table`/`keyColumn` identify the row,
   `expectedUpdatedAt` is what the caller believes `updated_at` still
   is — read fresh from the shared cache at save time (never a value
   captured once when a draft was opened), so sequential saves across
   different tabs in the same session never collide with each other,
   only with a write this session genuinely doesn't know about. Returns
   the row's new `updated_at` on success so the caller can sync its
   own cache; throws ConflictError on a 0-row match, a plain Error on
   any real Supabase error, and a plain Error (never silently ignored)
   on the — expected-impossible, `slug`/`id` are both unique — case of
   more than one row matching. */
async function updateWithConcurrencyCheck(table, keyColumn, keyValue, patch, expectedUpdatedAt) {
  const { data, error } = await window.supabaseClient
    .from(table)
    .update(patch)
    .eq(keyColumn, keyValue)
    .eq('updated_at', expectedUpdatedAt)
    .select('updated_at');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new ConflictError();
  if (data.length > 1) {
    throw new Error(
      'Integrity error: more than one row matched ' + table + '.' + keyColumn + ' = ' + keyValue +
      ' — ' + keyColumn + ' is expected to be unique. The write already happened on the server ' +
      '(this is not a rolled-back conflict) — investigate the table before saving here again.'
    );
  }
  return data[0].updated_at;
}

const BASE_INDEX_COLUMNS = [
  'id', 'slug', 'status',
  'name_en', 'name_es', 'location', 'reference',
  'cover_image', 'property_type', 'price', 'currency',
  'display_order', 'is_default',
  'organization_id', 'agent_id',
  'created_at', 'updated_at', 'published_at'
].join(',');

const REVISION_COL = 'experience_revision_id';

/* Whether the properties table has the experience_revision_id column
   (migration 005). null = not yet determined this session.
   Detected lazily by whichever of loadIndex / loadProperty / createProperty
   runs first — a Workspace deep-link or refresh must work standalone,
   without the Properties list having loaded first. `revisionDetection`
   is the in-flight probe so concurrent first-callers share one round trip
   instead of racing independent detections. */
let hasRevisionColumn = null;
let revisionDetection = null;

function isMissingRevisionColumnError(error) {
  return !!(error && error.message && error.message.includes(REVISION_COL));
}

async function ensureRevisionColumnKnown() {
  if (hasRevisionColumn !== null) return hasRevisionColumn;

  if (!revisionDetection) {
    revisionDetection = window.supabaseClient
      .from('properties')
      .select(REVISION_COL)
      .limit(1)
      .then(({ error }) => {
        if (!error) hasRevisionColumn = true;
        else if (isMissingRevisionColumnError(error)) hasRevisionColumn = false;
        // Any other error (network, auth, ...) is inconclusive: leave
        // hasRevisionColumn null so the next call retries detection, and
        // let the caller's own query surface the real error.
        return hasRevisionColumn;
      })
      .finally(() => { revisionDetection = null; });
  }

  return revisionDetection;
}

function indexColumns() {
  return hasRevisionColumn === false ? BASE_INDEX_COLUMNS : BASE_INDEX_COLUMNS + ',' + REVISION_COL;
}
function fullColumns() {
  return indexColumns() + ',content,knowledge,assets';
}

export async function loadIndex(force) {
  if (store.indexLoaded && !force) return store.index;

  await ensureRevisionColumnKnown();

  const { data, error } = await window.supabaseClient
    .from('properties')
    .select(indexColumns())
    .order('display_order', { ascending: true });

  if (error) throw new Error(error.message);

  store.index = data || [];
  store.indexLoaded = true;
  return store.index;
}

export async function loadProperty(slug) {
  const cached = store.cache.get(slug);
  if (cached) return cached;

  if (store.loading.has(slug)) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (!store.loading.has(slug)) {
          clearInterval(check);
          resolve(store.cache.get(slug) || null);
        }
      }, 50);
    });
  }

  store.loading.add(slug);

  try {
    await ensureRevisionColumnKnown();

    const { data, error } = await window.supabaseClient
      .from('properties')
      .select(fullColumns())
      .eq('slug', slug)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    store.cache.set(slug, data);
    return data;
  } finally {
    store.loading.delete(slug);
  }
}

export function getCached(slug) {
  return store.cache.get(slug) || null;
}

export function getIndex() {
  return store.index;
}

export function isIndexLoaded() {
  return store.indexLoaded;
}

export function isLoaded(slug) {
  return store.cache.has(slug);
}

export function clearCache() {
  store.cache.clear();
}

export async function saveContent(slug, content, expectedUpdatedAt) {
  const newUpdatedAt = await updateWithConcurrencyCheck(
    'properties', 'slug', slug, { content }, expectedUpdatedAt);

  const cached = store.cache.get(slug);
  if (cached) {
    cached.content = JSON.parse(JSON.stringify(content));
    cached.updated_at = newUpdatedAt;
  }
}

export async function saveAssets(slug, assets, expectedUpdatedAt) {
  const newUpdatedAt = await updateWithConcurrencyCheck(
    'properties', 'slug', slug, { assets }, expectedUpdatedAt);

  const cached = store.cache.get(slug);
  if (cached) {
    cached.assets = JSON.parse(JSON.stringify(assets));
    cached.updated_at = newUpdatedAt;
  }
}

export async function saveKnowledge(slug, knowledge, expectedUpdatedAt) {
  const newUpdatedAt = await updateWithConcurrencyCheck(
    'properties', 'slug', slug, { knowledge }, expectedUpdatedAt);

  const cached = store.cache.get(slug);
  if (cached) {
    cached.knowledge = JSON.parse(JSON.stringify(knowledge));
    cached.updated_at = newUpdatedAt;
  }
}

/* ── Revision lifecycle (LPE-09) ─────────────────────────── */

/* Insert a new draft revision from the property's current snapshots.
   Returns the inserted row (includes id and revision_number). */
export async function createRevision(slug, { content, knowledge, assets, createdBy }) {
  const { data: prop, error: propError } = await window.supabaseClient
    .from('properties')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (propError || !prop) throw new Error(propError?.message || `Property "${slug}" not found`);

  const { data: latest, error: latestError } = await window.supabaseClient
    .from('experience_revisions')
    .select('revision_number')
    .eq('property_id', prop.id)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(latestError.message);
  const revisionNumber = (latest?.revision_number || 0) + 1;

  const { data: rev, error } = await window.supabaseClient
    .from('experience_revisions')
    .insert({
      property_id:        prop.id,
      revision_number:    revisionNumber,
      status:             'draft',
      manifest:           {},
      content_snapshot:   content,
      knowledge_snapshot: knowledge,
      assets_snapshot:    assets,
      created_by:         createdBy
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rev;
}

/* Set a revision to published and update the property's publish pointer.
   The property's experience_revision_id becomes the single source of truth
   for which revision visitors see. Mutates the cached property in place
   (same pattern as savePropertyStatus/savePropertyMeta) so any in-memory
   reference — including the Workspace's currentProperty — reflects the
   new pointer immediately, with no stale second copy of the state. */
export async function publishRevision(slug, revisionId) {
  const { data: prop, error: propError } = await window.supabaseClient
    .from('properties')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (propError || !prop) throw new Error(propError?.message || `Property "${slug}" not found`);

  const { error: revError } = await window.supabaseClient
    .from('experience_revisions')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', revisionId)
    .eq('property_id', prop.id);
  if (revError) throw new Error(revError.message);

  const { error: propUpdateError } = await window.supabaseClient
    .from('properties')
    .update({ experience_revision_id: revisionId })
    .eq('id', prop.id);
  if (propUpdateError) throw new Error(propUpdateError.message);

  const cached = store.cache.get(slug);
  if (cached) cached.experience_revision_id = revisionId;
  const idx = store.index.find(r => r.slug === slug);
  if (idx) idx.experience_revision_id = revisionId;
}

/* Atomic rollback: repoint the property's publish pointer to a previous
   revision. The previously active revision retains its status (no mutation).
   Mutates the cached property in place — same reasoning as publishRevision. */
export async function rollback(slug, targetRevisionId) {
  const { data: prop, error: propError } = await window.supabaseClient
    .from('properties')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (propError || !prop) throw new Error(propError?.message || `Property "${slug}" not found`);

  const { error: propUpdateError } = await window.supabaseClient
    .from('properties')
    .update({ experience_revision_id: targetRevisionId })
    .eq('id', prop.id);
  if (propUpdateError) throw new Error(propUpdateError.message);

  const cached = store.cache.get(slug);
  if (cached) cached.experience_revision_id = targetRevisionId;
  const idx = store.index.find(r => r.slug === slug);
  if (idx) idx.experience_revision_id = targetRevisionId;
}

/* ── Audits ───────────────────────────────────────────────── */

export async function loadAudits(propertyId) {
  const { data, error } = await window.supabaseClient
    .from('audits')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function loadAllAudits() {
  const { data, error } = await window.supabaseClient
    .from('audits')
    .select('*, properties!inner(slug, name_en, name_es, cover_image)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function createAudit(audit) {
  const { data, error } = await window.supabaseClient
    .from('audits')
    .insert(audit)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateAudit(id, patch, expectedUpdatedAt) {
  return updateWithConcurrencyCheck('audits', 'id', id, patch, expectedUpdatedAt);
}

export async function deleteAudit(id) {
  const { error } = await window.supabaseClient
    .from('audits')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/* ── Create property (Admin-M5.X) ────────────────────────── */

const INITIAL_CONTENT = {
  slug: '',
  label: '',
  brand: '',
  title: '',
  subtitle: '',
  intro: '',
  shortRef: '',
  referencePrice: 0,
  defaultRegion: '',
  defaultPropertyType: 'resale',
  conciergeIntro: '',
  facts: [],
  experiences: [],
  sequences: [],
  sceneSpaces: [],
  spatial: [],
  spatialNodeDetails: { en: [], es: [] },
  dna: { title: '', intro: '', dimensions: [] },
  setting: { title: '', intro: '', cards: [] },
  copy: {
    identityNote: { en: '', es: '' },
    bandLabel: { en: '', es: '' },
    sequenceTitle: { en: '', es: '' },
    sequenceIntro: { en: '', es: '' },
    filmLabel: { en: '', es: '' },
    spatialTitle: { en: '', es: '' },
    spatialIntro: { en: '', es: '' },
    spatialDetail: { en: '', es: '' },
    detailsTitle: { en: '', es: '' },
    detailsIntro: { en: '', es: '' }
  },
  arrival: {
    en: [['', '', ''], ['', '', ''], ['', '', '']],
    es: [['', '', ''], ['', '', ''], ['', '', '']]
  }
};

const INITIAL_KNOWLEDGE = {
  fallback: { en: '', es: '' },
  property: {
    facts: {},
    systems: {},
    spaces: {}
  },
  surroundings: {},
  intents: [],
  interestSignals: {},
  qualification: []
};

const INITIAL_ASSETS = {
  propertyId: '',
  status: 'draft',
  comment: '',
  authorised: false,
  hero: {
    fallbackImage: '',
    poster: null,
    video: null,
    provenance: { source: '', licence: '', author: '', url: '' }
  },
  bandImage: '',
  bandProvenance: { source: '', licence: '', author: '', url: '' },
  propertyFilm: null,
  spaces: {}
};

export async function createProperty({ slug, label, brand, subtitle, intro, referencePrice, defaultRegion, defaultPropertyType, agentId }) {
  const content = JSON.parse(JSON.stringify(INITIAL_CONTENT));
  content.slug = slug;
  content.label = label || '';
  content.brand = brand || '';
  content.subtitle = subtitle || '';
  content.intro = intro || '';
  content.referencePrice = referencePrice || 0;
  content.defaultRegion = defaultRegion || '';
  content.defaultPropertyType = defaultPropertyType || 'resale';

  const knowledge = JSON.parse(JSON.stringify(INITIAL_KNOWLEDGE));
  const assets = JSON.parse(JSON.stringify(INITIAL_ASSETS));

  const { data: org, error: orgError } = await window.supabaseClient
    .from('organizations')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (orgError) throw new Error('Could not load organization: ' + orgError.message);
  if (!org) throw new Error('No organization found. Seed the database first.');

  const row = {
    slug,
    status: 'draft',
    organization_id: org.id,
    content,
    knowledge,
    assets,
    display_order: store.index.length,
    is_default: false
  };
  if (agentId) row.agent_id = agentId;

  await ensureRevisionColumnKnown();

  const { data, error } = await window.supabaseClient
    .from('properties')
    .insert(row)
    .select(fullColumns())
    .single();

  if (error) throw new Error(error.message);

  store.cache.set(slug, data);
  store.index.push(data);
  return data;
}

/* ── Update property metadata (Admin-M5.X) ───────────────── */

export async function savePropertyStatus(slug, status, expectedUpdatedAt) {
  const patch = { status };
  if (status === 'published') patch.published_at = new Date().toISOString();

  const newUpdatedAt = await updateWithConcurrencyCheck(
    'properties', 'slug', slug, patch, expectedUpdatedAt);

  const cached = store.cache.get(slug);
  if (cached) {
    cached.status = status;
    if (patch.published_at) cached.published_at = patch.published_at;
    cached.updated_at = newUpdatedAt;
  }
  const idx = store.index.find(r => r.slug === slug);
  if (idx) {
    idx.status = status;
    if (patch.published_at) idx.published_at = patch.published_at;
    idx.updated_at = newUpdatedAt;
  }
}

export async function savePropertyMeta(slug, meta, expectedUpdatedAt) {
  const allowed = ['display_order', 'is_default', 'agent_id'];
  const patch = {};
  for (const key of allowed) {
    if (meta[key] !== undefined) patch[key] = meta[key];
  }
  if (!Object.keys(patch).length) return;

  const newUpdatedAt = await updateWithConcurrencyCheck(
    'properties', 'slug', slug, patch, expectedUpdatedAt);

  const cached = store.cache.get(slug);
  if (cached) { Object.assign(cached, patch); cached.updated_at = newUpdatedAt; }
  const idx = store.index.find(r => r.slug === slug);
  if (idx) { Object.assign(idx, patch); idx.updated_at = newUpdatedAt; }
}

/* ── Load agents (for property create/edit) ──────────────── */

export async function loadAgents() {
  const { data, error } = await window.supabaseClient
    .from('agents')
    .select('id, name, slug, agency, status')
    .eq('status', 'active')
    .order('name');

  if (error) throw new Error(error.message);
  return data || [];
}

/* ── Agents module (Admin Hardening Pass) ────────────────────
   loadAgents() above stays exactly as-is — it's the minimal-column,
   active-only fetch that admin-properties.js / admin-workspace.js
   already depend on for the assignment dropdown. These are the fuller
   CRUD operations for the standalone Agentes module: every agent
   regardless of status, and every column the "agents" table exposes
   (migration 001 §2) that a real agent record needs. */

const AGENT_COLUMNS = 'id, name, slug, email, phone, agency, role, photo_url, bio, status, organization_id, auth_user_id, created_at, updated_at';

export async function loadAllAgents() {
  const { data, error } = await window.supabaseClient
    .from('agents')
    .select(AGENT_COLUMNS)
    .order('name');

  if (error) throw new Error(error.message);
  return data || [];
}

export async function loadAgent(id) {
  const { data, error } = await window.supabaseClient
    .from('agents')
    .select(AGENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function createAgent({ name, slug, agency, role, photoUrl, bioEn, bioEs, email, phone, status }) {
  const { data: org, error: orgError } = await window.supabaseClient
    .from('organizations')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (orgError) throw new Error('Could not load organization: ' + orgError.message);
  if (!org) throw new Error('No organization found. Seed the database first.');

  const row = {
    organization_id: org.id,
    name,
    slug: slug || null,
    email: email || null,
    phone: phone || null,
    agency: agency || null,
    role: role || null,
    photo_url: photoUrl || null,
    bio: { en: bioEn || '', es: bioEs || '' },
    status: status || 'active'
  };

  const { data, error } = await window.supabaseClient
    .from('agents')
    .insert(row)
    .select(AGENT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateAgent(id, patch, expectedUpdatedAt) {
  const allowed = ['name', 'slug', 'email', 'phone', 'agency', 'role', 'photo_url', 'bio', 'status'];
  const clean = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) clean[key] = patch[key];
  }
  if (!Object.keys(clean).length) return;

  return updateWithConcurrencyCheck('agents', 'id', id, clean, expectedUpdatedAt);
}

/* ── Invite (M6.2) ────────────────────────────────────────────────
   Calls the server-side endpoint that owns the privileged Supabase
   Admin API credential — this function never sees that credential,
   only the caller's own already-issued session token, which the
   endpoint re-verifies independently server-side (it does not trust
   this call's identity claims). Safe to call again on an
   already-invited agent: the endpoint is idempotent and reports what
   actually happened via `outcome`. */
export async function inviteAgent(agentId) {
  const { data: sessionData } = await window.supabaseClient.auth.getSession();
  const token = sessionData && sessionData.session && sessionData.session.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/admin-invite-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ agentId })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || ('invite_failed_' + res.status));
  return body;
}

/* Read-only — properties.agent_id is the only relationship this reads;
   no new column, no new table (Admin Hardening Pass Phase C). */
export async function loadPropertiesByAgent(agentId) {
  const { data, error } = await window.supabaseClient
    .from('properties')
    .select('id, slug, status, name_en, name_es, location, cover_image, display_order')
    .eq('agent_id', agentId)
    .order('display_order', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/* ── Revision helpers ────────────────────────────────────── */

export async function loadRevisions(slug) {
  const { data: prop, error: propError } = await window.supabaseClient
    .from('properties')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (propError || !prop) throw new Error(propError?.message || `Property "${slug}" not found`);

  const { data, error } = await window.supabaseClient
    .from('experience_revisions')
    .select('*')
    .eq('property_id', prop.id)
    .order('revision_number', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export function getPropertyLabel(row) {
  return row.name_es || row.name_en || row.slug;
}
