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

const INDEX_COLUMNS = [
  'id', 'slug', 'status',
  'name_en', 'name_es', 'location', 'reference',
  'cover_image', 'property_type', 'price', 'currency',
  'display_order', 'is_default',
  'organization_id', 'agent_id',
  'experience_revision_id',
  'created_at', 'updated_at', 'published_at'
].join(',');

const FULL_COLUMNS = INDEX_COLUMNS + ',content,knowledge,assets';

export async function loadIndex(force) {
  if (store.indexLoaded && !force) return store.index;

  const { data, error } = await window.supabaseClient
    .from('properties')
    .select(INDEX_COLUMNS)
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
    const { data, error } = await window.supabaseClient
      .from('properties')
      .select(FULL_COLUMNS)
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

export async function saveContent(slug, content) {
  const { error } = await window.supabaseClient
    .from('properties')
    .update({ content })
    .eq('slug', slug);

  if (error) throw new Error(error.message);

  const cached = store.cache.get(slug);
  if (cached) {
    cached.content = JSON.parse(JSON.stringify(content));
  }
}

export async function saveAssets(slug, assets) {
  const { error } = await window.supabaseClient
    .from('properties')
    .update({ assets })
    .eq('slug', slug);

  if (error) throw new Error(error.message);

  const cached = store.cache.get(slug);
  if (cached) {
    cached.assets = JSON.parse(JSON.stringify(assets));
  }
}

export async function saveKnowledge(slug, knowledge) {
  const { error } = await window.supabaseClient
    .from('properties')
    .update({ knowledge })
    .eq('slug', slug);

  if (error) throw new Error(error.message);

  const cached = store.cache.get(slug);
  if (cached) {
    cached.knowledge = JSON.parse(JSON.stringify(knowledge));
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
   for which revision visitors see. Clears the in-memory cache. */
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

  store.cache.delete(slug);
  const idx = store.index.find(r => r.slug === slug);
  if (idx) idx.experience_revision_id = revisionId;
}

/* Atomic rollback: repoint the property's publish pointer to a previous
   revision. The previously active revision retains its status (no mutation).
   Clears the in-memory cache so the next load reflects the rollback. */
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

  store.cache.delete(slug);
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

export async function updateAudit(id, patch) {
  const { error } = await window.supabaseClient
    .from('audits')
    .update(patch)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deleteAudit(id) {
  const { error } = await window.supabaseClient
    .from('audits')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export function getPropertyLabel(row) {
  return row.name_es || row.name_en || row.slug;
}
