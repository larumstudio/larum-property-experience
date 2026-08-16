'use strict';

/* LPE-03 Module Registry. The ONLY place that knows slot/glue/chapter/menu.
   Every MODULE_IDS entry has one complete descriptor (LPE-03 §4.1).
   railChapterIds / menuTargets are derived FROM descriptors, never hardcoded. */

function _adapters() {
  if (typeof LarumDomainAdapters !== 'undefined') return LarumDomainAdapters;
  if (typeof require === 'function') {
    try { return require('./adapters'); } catch (e) { return null; }
  }
  return null;
}

const MODULE_IDS = (_adapters() && _adapters().MODULE_IDS) || [
  'arrival', 'property-dna', 'lived-sequence', 'spatial-zones', 'verified-intelligence',
  'setting-lifestyle', 'documents-private-room', 'concierge', 'enquiry-handoff'
];

/* Closed glue set. No new glue ids.
   Frame ids (not modules): hero, identity, image-band, explore, calculator. */
const BINDINGS = {
  arrival: {
    id: 'arrival', slot: 'overlay', glue: null,
    chapter: false, chapterId: null, menu: false, menuId: null,
    slice: null, legacyId: null
  },
  'property-dna': {
    id: 'property-dna', slot: 'scroll', glue: 'image-band',
    chapter: false, chapterId: null, menu: false, menuId: null,
    slice: 'property-dna', legacyId: null
  },
  'lived-sequence': {
    id: 'lived-sequence', slot: 'scroll', glue: 'explore',
    chapter: true, chapterId: 'sequence', menu: true, menuId: 'sequence',
    slice: 'lived-sequence', legacyId: 'sequence'
  },
  'spatial-zones': {
    id: 'spatial-zones', slot: 'scroll', glue: null,
    chapter: true, chapterId: 'spatial', menu: true, menuId: 'spatial',
    slice: 'spatial-zones', legacyId: 'spatial'
  },
  'verified-intelligence': {
    id: 'verified-intelligence', slot: 'scroll', glue: null,
    chapter: false, chapterId: null, menu: false, menuId: null,
    slice: 'verified-intelligence', legacyId: 'details'
  },
  'setting-lifestyle': {
    id: 'setting-lifestyle', slot: 'scroll', glue: null,
    chapter: false, chapterId: null, menu: false, menuId: null,
    slice: 'setting-lifestyle', legacyId: 'setting'
  },
  'documents-private-room': {
    id: 'documents-private-room', slot: 'scroll', glue: 'calculator',
    chapter: false, chapterId: null, menu: true, menuId: 'documents',
    slice: 'documents-private-room', legacyId: 'documents'
  },
  concierge: {
    id: 'concierge', slot: 'scroll', glue: null,
    chapter: true, chapterId: 'concierge', menu: true, menuId: 'concierge',
    slice: 'concierge', legacyId: 'concierge'
  },
  'enquiry-handoff': {
    id: 'enquiry-handoff', slot: 'overlay', glue: null,
    chapter: false, chapterId: null, menu: false, menuId: null,
    slice: null, legacyId: null
  }
};

function get(id) {
  return BINDINGS[id] || null;
}

function requireModule(id) {
  const d = get(id);
  if (!d) throw new Error('Unknown module id: ' + id);
  return d;
}

function isKnownModule(id) {
  return MODULE_IDS.indexOf(id) !== -1;
}

function scrollModules() {
  return MODULE_IDS.filter(id => BINDINGS[id] && BINDINGS[id].slot === 'scroll');
}

function overlayModules() {
  return MODULE_IDS.filter(id => BINDINGS[id] && BINDINGS[id].slot === 'overlay');
}

function moduleVisible(manifest, id) {
  const list = (manifest && manifest.modules) || [];
  const item = list.find(m => m.id === id);
  return !!(item && item.visible);
}

/* Scroll modules in compose order, visible only. Rail/menu read visibility;
   compose (below) must still emit glue for a hidden parent (LPE-02 §3). */
function visibleScrollModules(manifest) {
  const modules = ((manifest && manifest.modules) || []).slice().sort((a, b) => a.order - b.order);
  return modules.filter(m => {
    const d = BINDINGS[m.id];
    return d && d.slot === 'scroll' && m.visible;
  });
}

function composePlan(manifest) {
  const modules = ((manifest && manifest.modules) || []).slice().sort((a, b) => a.order - b.order);
  const plan = [
    { type: 'frame', id: 'hero' },
    { type: 'frame', id: 'identity' }
  ];
  for (const m of modules) {
    const bind = BINDINGS[m.id];
    if (!bind || bind.slot !== 'scroll') continue;
    if (m.visible) plan.push({ type: 'module', id: m.id });
    if (bind.glue) plan.push({ type: 'glue', id: bind.glue, parent: m.id });
  }
  return plan;
}

function railChapterIds(manifest) {
  const ids = ['hero', 'identity'];
  for (const m of visibleScrollModules(manifest)) {
    const d = BINDINGS[m.id];
    if (d.chapter && d.chapterId) ids.push(d.chapterId);
  }
  return ids;
}

function menuTargets(manifest) {
  const items = [{ id: 'identity', always: true }];
  for (const m of visibleScrollModules(manifest)) {
    const d = BINDINGS[m.id];
    if (d.menu && d.menuId) items.push({ id: d.menuId });
  }
  /* Pinned calculator: immediately after documents, else after spatial,
     else right after identity. */
  const docsIdx = items.findIndex(t => t.id === 'documents');
  const spatialIdx = items.findIndex(t => t.id === 'spatial');
  let insertAt;
  if (docsIdx >= 0) insertAt = docsIdx + 1;
  else if (spatialIdx >= 0) insertAt = spatialIdx + 1;
  else insertAt = 1;
  items.splice(insertAt, 0, { id: 'calculator', always: true });
  return items;
}

function legacyManifest() {
  const adapters = _adapters();
  if (adapters && adapters.deriveManifest) return adapters.deriveManifest('legacy');
  return {
    schemaVersion: '1.0',
    revisionId: 'legacy-legacy',
    propertyId: 'legacy',
    family: 'villa-estate',
    themeId: 'villa-estate-default',
    modules: MODULE_IDS.map((id, i) => ({ id, instanceId: `${id}-01`, visible: true, order: (i + 1) * 10, config: {} })),
    navigation: { chapters: MODULE_IDS.slice(), defaultEntry: 'arrival-01' },
    ctaPolicy: {},
    motionPolicy: { enabled: true, reducedMotionFallback: 'static-composed' },
    fallbackPolicy: {},
    assetContractIds: []
  };
}

const LarumModuleRegistry = {
  MODULE_IDS, BINDINGS, get, require: requireModule, isKnownModule,
  scrollModules, overlayModules, moduleVisible, composePlan,
  railChapterIds, menuTargets, legacyManifest
};

if (typeof window !== 'undefined') window.LarumModuleRegistry = LarumModuleRegistry;
if (typeof module !== 'undefined' && module.exports) module.exports = LarumModuleRegistry;
