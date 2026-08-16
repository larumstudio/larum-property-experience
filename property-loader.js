/* ── Larum Property Experience™ — Property Loader ──────────────────
   Single source of truth per property. Replaces all embedded-*.js.

   Architecture:
   - Registry:  properties/index.json  → { default, order, rules }
   - Property:  properties/{slug}/content.json | knowledge.json | assets.json
   - Global:    contact-config.json, purchase-config.json
   - Loader merges everything and exposes it through accessors.

   Adding a property = drop a folder in properties/ and add its slug to
   properties/index.json. No code changes.

   Three runtime sources, tried in order:
   - db      → Supabase `properties`, the canonical source since Phase 1.
               Anonymous visitors see published rows only; a signed-in
               operator sees drafts too, which is what makes preview work
               through the real experience instead of a separate build.
   - files   → properties/*.json over http(s). Authoring and local dev.
   - pack    → window.LARUM_PACK from property-pack.js. Offline (file://)
               and the last line of defence if everything else is down.

   Override with ?source=db|files|pack — editing a JSON file locally must
   not silently lose to a published row in the database.
   ─────────────────────────────────────────────────────────────────── */

const LarumLoader = (() => {
  'use strict';

  const data = {
    properties: {},    // slug → { content, knowledge, assets, experience } — loaded on demand (db) or all at once (files/pack)
    index: {},         // slug → { slug, status, is_default, display_order, label } — all published rows, db path only
    status: {},        // slug → lifecycle status (database source only)
    registry: null,    // { default, order, rules }
    contact: null,
    purchase: null,
    ready: false,
    source: null,      // 'db' | 'files' | 'pack'
    errors: [],        // problems with the source that actually loaded
    notes: []          // why an earlier source was skipped — diagnostics only
  };

  /* ── Auto-load: database → files → offline pack ── */

  async function autoLoad(basePath) {
    basePath = basePath || '.';
    const only = _wantedSource();
    const online = location.protocol !== 'file:';

    if (online && (!only || only === 'db')) {
      try {
        if (await loadFromDb(basePath)) { data.source = 'db'; return true; }
      } catch (e) {
        _note(`Database unavailable (${e.message})`);
      }
      if (only === 'db') { data.ready = true; return false; }
    }

    if (online && (!only || only === 'files')) {
      _reset();
      try {
        const registry = await _fetchJSON(`${basePath}/properties/index.json`);
        const ok = await loadFromFiles(registry, basePath);
        if (ok) { data.source = 'files'; return true; }
        _note('File load incomplete — falling back to offline pack');
      } catch (e) {
        _note(`Registry unavailable (${e.message}) — falling back to offline pack`);
      }
      if (only === 'files') { data.ready = true; return false; }
    }

    if (!only || only === 'pack') {
      if (window.LARUM_PACK) {
        _reset();
        const ok = loadFromPack(window.LARUM_PACK);
        if (ok) { data.source = 'pack'; return true; }
      } else {
        data.errors.push('No offline pack found. Run `node build-pack.js` or serve over http://');
      }
    }

    data.ready = true;
    return false;
  }

  /* ── Load from Supabase: the canonical source ──
     Row-level security does the filtering, not this code: an anonymous
     visitor is served published properties only, while a signed-in
     operator receives drafts as well — which is what lets the admin
     preview an unpublished property through the real experience instead
     of maintaining a second one. */

  async function loadFromDb(basePath) {
    const client = (typeof window !== 'undefined') && window.supabaseClient;
    if (!client) { _note('No Supabase client on the page'); return false; }

    _reset();

    /* LPE-08: two-query strategy — light index first, then a single-property payload. */
    const indexOk = await loadIndex();
    if (!indexOk) return false;

    const defaultSlug = data.registry.default;
    const propOk = await loadProperty(defaultSlug);
    if (!propOk) { _note(`Failed to load default property "${defaultSlug}"`); return false; }

    /* Global configuration stays in files: it is not per-property, it
       changes once a year, and putting it in the database would add a
       round trip to every visit for nothing. */
    const [rules, contact, purchase] = await Promise.all([
      _fetchJSON(`${basePath}/properties/index.json`).then(r => r.rules || {}).catch(() => ({})),
      _fetchJSON(`${basePath}/contact-config.json`).catch(() => _defaultContact()),
      _fetchJSON(`${basePath}/purchase-config.json`).catch(() => _defaultPurchase())
    ]);

    data.registry.rules = rules;
    data.contact = contact;
    data.purchase = purchase;
    data.ready = true;
    return true;
  }

  /* ── LPE-08: light index query — slug + status + label only, no JSONB payload ── */

  async function loadIndex() {
    const client = (typeof window !== 'undefined') && window.supabaseClient;
    if (!client) { _note('No Supabase client for index'); return false; }

    const { data: rows, error } = await client
      .from('properties')
      .select('slug,status,is_default,display_order,label:content->>label')
      .order('display_order', { ascending: true });

    if (error) { _note(`Supabase index: ${error.message}`); return false; }
    if (!rows || !rows.length) { _note('Supabase has no properties yet'); return false; }

    data.index = {};
    const order = [];
    let fallbackDefault = null;

    for (const row of rows) {
      /* A row with no label is a draft with no content — skip it. */
      if (!row.slug || !row.label) continue;
      data.index[row.slug] = {
        slug: row.slug,
        status: row.status || 'published',
        is_default: !!row.is_default,
        display_order: row.display_order,
        label: row.label
      };
      data.status[row.slug] = row.status || 'published';
      order.push(row.slug);
      if (row.is_default) fallbackDefault = row.slug;
    }

    if (!order.length) { _note('Supabase index returned only empty rows'); return false; }

    data.registry = { default: fallbackDefault || order[0], order, rules: {} };
    return true;
  }

  /* ── LPE-08: on-demand full payload for a single property — idempotent ── */

  async function loadProperty(slug) {
    if (!slug) return false;
    /* Idempotent: if the property is already fully loaded, skip the network call. */
    if (hasProperty(slug)) return true;

    const client = (typeof window !== 'undefined') && window.supabaseClient;
    if (!client) { _note('No Supabase client for property load'); return false; }

    const { data: row, error } = await client
      .from('properties')
      .select('slug,status,content,knowledge,assets')
      .eq('slug', slug)
      .maybeSingle();

    if (error) { _note(`Supabase property "${slug}": ${error.message}`); return false; }
    if (!row || !row.content || !Object.keys(row.content).length) {
      _note(`Property "${slug}" returned no content`);
      return false;
    }

    data.properties[slug] = {
      content: row.content,
      knowledge: row.knowledge || {},
      assets: row.assets || {},
      experience: null
    };
    data.status[slug] = row.status || 'published';
    return true;
  }

  /* ── Load from separate JSON files ── */

  async function loadFromFiles(registry, basePath) {
    basePath = basePath || '.';
    data.registry = _normaliseRegistry(registry);

    const tasks = [];
    for (const slug of data.registry.order) {
      for (const part of ['content', 'knowledge', 'assets']) {
        tasks.push(
          _fetchJSON(`${basePath}/properties/${slug}/${part}.json`)
            .then(d => { _ensureProp(slug); data.properties[slug][part] = d; })
            .catch(e => data.errors.push(`${slug}/${part}: ${e.message}`))
        );
      }
      tasks.push(
        _fetchJSON(`${basePath}/properties/${slug}/experience.json`)
          .then(d => { _ensureProp(slug); data.properties[slug].experience = d; })
          .catch(() => { /* optional derived snapshot — missing is not an error */ })
      );
    }

    tasks.push(
      _fetchJSON(`${basePath}/contact-config.json`)
        .then(d => { data.contact = d; })
        .catch(() => { data.contact = _defaultContact(); })
    );
    tasks.push(
      _fetchJSON(`${basePath}/purchase-config.json`)
        .then(d => { data.purchase = d; })
        .catch(() => { data.purchase = _defaultPurchase(); })
    );

    await Promise.allSettled(tasks);
    data.ready = true;
    return data.errors.length === 0;
  }

  /* ── Load from the generated offline pack ── */

  function loadFromPack(pack) {
    try {
      data.registry = _normaliseRegistry(pack.registry, Object.keys(pack.properties || {}));
      for (const [slug, prop] of Object.entries(pack.properties || {})) {
        data.properties[slug] = {
          content: prop.content || {},
          knowledge: prop.knowledge || {},
          assets: prop.assets || {},
          experience: prop.experience || null
        };
      }
      data.contact = pack.contact || _defaultContact();
      data.purchase = pack.purchase || _defaultPurchase();
      data.ready = true;
      return true;
    } catch (e) {
      data.errors.push(`Pack load error: ${e.message}`);
      return false;
    }
  }

  /* ── Accessors ── */

  /* Returns only LOADED slugs in registry order.
     With lazy load (db path) this is a subset of getIndexSlugs(). */
  function getPropertySlugs() {
    const order = data.registry?.order || [];
    const loaded = Object.keys(data.properties).filter(hasProperty);
    return [
      ...order.filter(s => loaded.includes(s)),
      ...loaded.filter(s => !order.includes(s))
    ];
  }

  /* LPE-08: boolean — is this slug fully loaded (content non-empty)? */
  function hasProperty(slug) {
    const p = data.properties[slug];
    return !!(p && p.content && Object.keys(p.content).length);
  }

  /* LPE-08: canonical slug order from the light index (all published slugs). */
  function getIndexSlugs() {
    return data.registry?.order || [];
  }

  /* LPE-08: label from the light index — works before payload is loaded.
     Falls back to content.label (files/pack source) then null. */
  function getIndexLabel(slug) {
    return data.index[slug]?.label
      || data.properties[slug]?.content?.label
      || null;
  }

  function getDefaultSlug() {
    const slugs = getPropertySlugs();
    const wanted = data.registry?.default;
    return slugs.includes(wanted) ? wanted : slugs[0] || null;
  }

  function getContent(slug)   { return data.properties[slug]?.content   || null; }
  function getKnowledge(slug) { return data.properties[slug]?.knowledge || null; }
  function getAssets(slug)    { return data.properties[slug]?.assets    || null; }
  function getContact()       { return data.contact; }
  function getPurchase()      { return data.purchase; }
  function getRules()         { return data.registry?.rules || {}; }
  function getSource()        { return data.source; }
  function isReady()          { return data.ready; }
  function getErrors()        { return data.errors.slice(); }
  function getNotes()         { return data.notes.slice(); }
  function getStatus(slug)    { return data.status[slug] || null; }

  function getPropertyLabel(slug) {
    return data.properties[slug]?.content?.label
      || data.index[slug]?.label
      || slug;
  }

  /* Flat maps, keyed by slug — the shape the experience engine consumes. */
  function getContentMap()   { return _map('content'); }
  function getKnowledgeMap() { return _map('knowledge'); }
  function getAssetsMap()    { return _map('assets'); }

  /* ── Validation: what's missing for a property to be demo-ready ── */

  function validate(slug) {
    const prop = data.properties[slug];
    if (!prop) return { valid: false, issues: [`Property "${slug}" not found`], warnings: [] };

    const issues = [];    // blocks the demo
    const warnings = [];  // ships, but not final
    const c = prop.content || {};
    const k = prop.knowledge || {};
    const a = prop.assets || {};

    /* Content — identity */
    for (const f of ['label', 'brand', 'title', 'subtitle', 'intro', 'shortRef', 'conciergeIntro']) {
      if (!c[f]) issues.push(`content: missing ${f}`);
    }

    /* Content — narrative structure */
    if (!c.sequences || c.sequences.length < 3) issues.push('content: need at least 3 sequences (day moments)');
    if (!c.sceneSpaces || c.sceneSpaces.length !== (c.sequences || []).length) issues.push('content: sceneSpaces must have one entry per sequence');
    if (!c.spatial || c.spatial.length < 2) issues.push('content: need at least 2 spatial zones');
    if (!c.facts || c.facts.length < 3) issues.push('content: need at least 3 facts');
    if (!c.experiences || c.experiences.length < 3) issues.push('content: need at least 3 experiences');
    if (!c.dna?.dimensions?.length) issues.push('content: missing DNA dimensions');
    if (!c.setting?.cards?.length) issues.push('content: missing setting cards');

    /* Every DNA score must carry the line that justifies it, in both languages */
    for (const d of c.dna?.dimensions || []) {
      const label = Array.isArray(d) ? d[0] : d.label;
      if (Array.isArray(d)) { issues.push(`content: DNA "${label}" still uses the old array form — needs {label, score, note}`); continue; }
      if (!d.label || d.score == null) issues.push('content: a DNA dimension is missing label or score');
      for (const lg of ['en', 'es']) {
        if (!d.note?.[lg]) issues.push(`content: DNA "${label}" has no ${lg} note`);
      }
    }

    /* Every Setting card must point at a block the knowledge base can render */
    const surroundingKeys = Object.keys(k.surroundings || {});
    for (const card of c.setting?.cards || []) {
      const title = Array.isArray(card) ? card[0] : card.title;
      if (Array.isArray(card)) { issues.push(`content: setting card "${title}" still uses the old array form — needs {title, line, source}`); continue; }
      if (!card.title || !card.line) issues.push('content: a setting card is missing title or line');
      if (!card.source) { issues.push(`content: setting card "${title}" has no source`); continue; }
      if (card.source !== 'verification' && !surroundingKeys.includes(card.source)) {
        issues.push(`content: setting card "${title}" points at surroundings.${card.source}, which does not exist`);
      }
    }

    /* Content — spatial detail per zone */
    for (const lg of ['en', 'es']) {
      const nd = c.spatialNodeDetails?.[lg];
      if (!nd || nd.length !== (c.spatial || []).length) {
        issues.push(`content: spatialNodeDetails.${lg} must have one line per spatial zone`);
      }
    }

    /* Content — bilingual copy blocks */
    const copyKeys = ['identityNote', 'bandLabel', 'sequenceTitle', 'sequenceIntro', 'filmLabel',
                      'spatialTitle', 'spatialIntro', 'spatialDetail', 'detailsTitle', 'detailsIntro'];
    for (const key of copyKeys) {
      for (const lg of ['en', 'es']) {
        if (!c.copy?.[key]?.[lg]) issues.push(`content: missing copy.${key}.${lg}`);
      }
    }

    /* Content — arrival sequence */
    for (const lg of ['en', 'es']) {
      const ar = c.arrival?.[lg];
      if (!ar || ar.length !== 3) issues.push(`content: arrival.${lg} must have exactly 3 chapters`);
      else if (ar.some(s => s.length !== 3 || s.some(x => !x))) issues.push(`content: arrival.${lg} chapters need [eyebrow, title, text]`);
    }

    /* Content — calculator */
    if (!c.referencePrice) issues.push('content: missing referencePrice (calculator default)');
    if (!c.defaultRegion) issues.push('content: missing defaultRegion (calculator default)');
    else if (data.purchase && !data.purchase.regions?.[c.defaultRegion]) {
      warnings.push(`content: defaultRegion "${c.defaultRegion}" has no rates in purchase-config.json`);
    }

    /* Knowledge */
    if (!k.property?.facts) issues.push('knowledge: missing property facts');
    if (!k.intents || k.intents.length < 6) issues.push('knowledge: need at least 6 concierge intents');
    if (!k.surroundings) issues.push('knowledge: missing surroundings data');
    if (!k.interestSignals) issues.push('knowledge: missing interest signals');
    if (!k.qualification) issues.push('knowledge: missing qualification triggers');
    if (!k.fallback?.en || !k.fallback?.es) issues.push('knowledge: missing bilingual fallback response');

    /* Knowledge — every space referenced by the narrative must be described */
    const spaces = k.property?.spaces || {};
    if (Object.keys(spaces).length < 5) issues.push('knowledge: need at least 5 space descriptions');
    const referenced = new Set((c.sceneSpaces || []).flatMap(s => s[1] || []));
    for (const name of referenced) {
      if (!spaces[name]) issues.push(`knowledge: space "${name}" is used in sceneSpaces but has no description`);
      else if (!spaces[name].descriptionEs) warnings.push(`knowledge: space "${name}" has no Spanish description`);
    }

    /* Assets */
    const heroImage = a.hero?.fallbackImage || c.image;
    if (!heroImage) issues.push('assets: no hero image');
    if (!a.bandImage && !c.band) issues.push('assets: no band image');
    if (/placeholder/.test(heroImage || '')) warnings.push('assets: hero is still a generated placeholder');
    else if (a.authorised !== true) warnings.push('assets: stand-in photography — not yet authorised by the agency');
    if (!a.propertyFilm) warnings.push('assets: no property film');

    /* Stand-ins must say where they came from, so nothing untraceable ships */
    if (a.authorised !== true) {
      if (a.hero?.fallbackImage && !a.hero.provenance) warnings.push('assets: hero has no provenance recorded');
      if (a.bandImage && !a.bandProvenance) warnings.push('assets: band image has no provenance recorded');
    }

    /* Facts confirmation status */
    const facts = k.property?.facts || {};
    const unconfirmed = Object.entries(facts).filter(([, v]) => v.status !== 'confirmed');
    if (unconfirmed.length) {
      warnings.push(`knowledge: ${unconfirmed.length} fact(s) not confirmed by the agency (${unconfirmed.map(([n]) => n).join(', ')})`);
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
      summary: {
        slug,
        label: c.label || slug,
        sequences: c.sequences?.length || 0,
        spaces: Object.keys(spaces).length,
        intents: k.intents?.length || 0,
        confirmedFacts: Object.values(facts).filter(f => f.status === 'confirmed').length,
        totalFacts: Object.keys(facts).length,
        assetState: /placeholder/.test(heroImage || '') ? 'placeholder'
                  : a.authorised === true ? 'authorised' : 'stand-in',
        spaceImages: Object.keys(a.spaces || {}).length
      }
    };
  }

  function validateAll() {
    const results = {};
    for (const slug of getPropertySlugs()) results[slug] = validate(slug);
    return results;
  }

  /* ── Export the offline pack shape (used by build-pack.js) ── */

  /* LPE-01 normalized domain accessors. The legacy runtime remains the
     default; adapters are optional and loaded only when available. */
  function _domainAdapters() {
    if (typeof LarumDomainAdapters !== 'undefined') return LarumDomainAdapters;
    if (typeof require === 'function') {
      try { return require('./schemas/adapters'); } catch (e) { return null; }
    }
    return null;
  }
  function getNormalized(slug) {
    const adapter = _domainAdapters();
    const prop = data.properties[slug];
    return adapter && prop ? adapter.adaptProperty(slug, prop) : null;
  }
  function validateNormalized(slug) {
    const adapter = _domainAdapters();
    const normalized = getNormalized(slug);
    return adapter && normalized ? adapter.validateNormalized(normalized) : { valid: false, issues: ['LPE-01 adapters unavailable'], warnings: [] };
  }

  function _deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function getManifest(slug) {
    const adapter = _domainAdapters();
    const derived = adapter && adapter.deriveManifest ? adapter.deriveManifest(slug) : null;
    const file = data.properties[slug] && data.properties[slug].experience;
    if (file && derived && _deepEqual(file, derived) && adapter.validateManifest(file).valid) return file;
    if (derived && adapter.validateManifest(derived).valid) return derived;
    if (typeof LarumModuleRegistry !== 'undefined' && LarumModuleRegistry.legacyManifest) {
      return LarumModuleRegistry.legacyManifest();
    }
    return derived;
  }

  function getModuleRegistry() {
    if (typeof LarumModuleRegistry !== 'undefined') return LarumModuleRegistry;
    if (typeof require === 'function') {
      try { return require('./schemas/module-registry'); } catch (e) { return null; }
    }
    return null;
  }

  function exportPack() {
    const pack = { registry: data.registry, properties: {}, contact: data.contact, purchase: data.purchase };
    for (const [slug, prop] of Object.entries(data.properties)) {
      pack.properties[slug] = {
        content: prop.content,
        knowledge: prop.knowledge,
        assets: prop.assets,
        experience: prop.experience || (getManifest(slug) || null)
      };
    }
    return pack;
  }

  /* ── Internals ── */

  function _map(part) {
    const out = {};
    for (const slug of getPropertySlugs()) out[slug] = data.properties[slug][part];
    return out;
  }

  function _normaliseRegistry(registry, fallbackOrder) {
    const r = registry || {};
    const order = Array.isArray(r.order) && r.order.length ? r.order : (fallbackOrder || []);
    return { default: r.default || order[0] || null, order, rules: r.rules || {} };
  }

  function _ensureProp(slug) {
    if (!data.properties[slug]) data.properties[slug] = { content: {}, knowledge: {}, assets: {} };
  }

  /* Fallback diagnostics, kept out of `errors`: a source that was skipped
     is not a fault of the source that then loaded cleanly. Mixing them
     made `loadFromFiles` report failure because the database attempt had
     already pushed a line into the same array. */
  function _note(msg) {
    data.notes.push(msg);
  }

  function _wantedSource() {
    try {
      const q = new URLSearchParams(location.search).get('source');
      return ['db', 'files', 'pack'].indexOf(q) !== -1 ? q : null;
    } catch (e) {
      return null;
    }
  }

  function _reset() {
    data.properties = {};
    data.index = {};
    data.status = {};
    data.registry = null;
    data.contact = null;
    data.purchase = null;
    data.ready = false;
    data.errors = [];
  }

  async function _fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  function _defaultContact() {
    return { defaultEmail: 'contacto@larumstudio.com', properties: {}, mode: 'mailto', endpoint: null };
  }

  function _defaultPurchase() {
    return {
      defaults: {
        resale: { notary: 0.5, registry: 0.3, legal: 1.0, agency: 0, other: 0 },
        new: { vat: 10, ajd: 1.5, notary: 0.5, registry: 0.3, legal: 1.0, agency: 0, other: 0 }
      },
      regions: {}
    };
  }

  return {
    autoLoad, loadFromDb, loadFromFiles, loadFromPack,
    loadIndex, loadProperty, hasProperty,
    getPropertySlugs, getDefaultSlug, getContent, getKnowledge, getAssets,
    getContentMap, getKnowledgeMap, getAssetsMap,
    getContact, getPurchase, getPropertyLabel, getRules, getSource, getStatus,
    getIndexSlugs, getIndexLabel,
    isReady, getErrors, getNotes, validate, validateAll, getNormalized, validateNormalized,
    getManifest, getModuleRegistry, exportPack
  };
})();

if (typeof window !== 'undefined') window.LarumLoader = LarumLoader;
if (typeof module !== 'undefined' && module.exports) module.exports = LarumLoader;

