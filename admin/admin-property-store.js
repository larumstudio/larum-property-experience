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

export function getPropertyLabel(row) {
  return row.name_es || row.name_en || row.slug;
}
