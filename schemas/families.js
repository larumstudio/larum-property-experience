'use strict';

/* LPE-05 Family recipes. Three visual/narrative recipes in one engine.
   Villa is the reference implementation and equals the current :root look.
   This file is the single source app.js reads to resolve a family id.
   Declared-but-deferred (NOT applied in LPE-05): tokens.spacing.rhythm,
   motionPreset, ctaVocabulary. Only `family` is consumed at runtime. */

function _modIds() {
  if (typeof LarumModuleRegistry !== 'undefined' && LarumModuleRegistry.MODULE_IDS) return LarumModuleRegistry.MODULE_IDS;
  return [
    'arrival', 'property-dna', 'lived-sequence', 'spatial-zones', 'verified-intelligence',
    'setting-lifestyle', 'documents-private-room', 'concierge', 'enquiry-handoff'
  ];
}

/* Local alias, not "MODULE_IDS": schemas/adapters/index.js already declares
   a global MODULE_IDS in this same classic-script scope (index.html loads
   both), and a second top-level `const MODULE_IDS` here throws a
   SyntaxError that aborts the whole page. */
const FAMILY_MODULE_IDS = _modIds();

const FAMILIES = {
  'villa-estate': {
    familyId: 'villa-estate',
    themeId: 'villa-estate-default',
    tokens: {
      colors: { ink: '#161714', paper: '#e9e6de', line: 'rgba(233,230,222,.28)', soft: '#b7b5ad', accent: '#c5ab75' },
      typography: { display: "Georgia,'Times New Roman',serif", mono: "'Courier New',Courier,monospace" },
      spacing: { rhythm: 1 }
    },
    defaultModules: FAMILY_MODULE_IDS.slice(),
    motionPreset: 'slow-cinematic',
    ctaVocabulary: { primary: 'private-viewing', secondary: 'ask-advisor' }
  },
  'urban-apartment': {
    familyId: 'urban-apartment',
    themeId: 'urban-apartment-default',
    tokens: {
      colors: { ink: '#1a1d1f', paper: '#eef0ee', line: 'rgba(20,22,24,.16)', soft: '#858b88', accent: '#8a98a0' },
      typography: { display: "'Helvetica Neue',Helvetica,Arial,sans-serif", mono: "'Courier New',Courier,monospace" },
      spacing: { rhythm: 0.9 }
    },
    defaultModules: FAMILY_MODULE_IDS.slice(),
    motionPreset: 'editorial',
    ctaVocabulary: { primary: 'request-details', secondary: 'ask-advisor' }
  },
  'metropolitan-luxury': {
    familyId: 'metropolitan-luxury',
    themeId: 'metropolitan-luxury-default',
    tokens: {
      colors: { ink: '#0e0f0f', paper: '#ece7dd', line: 'rgba(236,231,221,.24)', soft: '#9c9a92', accent: '#b9a26a' },
      typography: { display: "'Helvetica Neue',Helvetica,Arial,sans-serif", mono: "'Courier New',Courier,monospace" },
      spacing: { rhythm: 1.05 }
    },
    /* Metropolitan emphasizes proof ahead of spatial zones (BLUEPRINT §05). */
    defaultModules: ['arrival', 'property-dna', 'lived-sequence', 'verified-intelligence', 'spatial-zones', 'setting-lifestyle', 'documents-private-room', 'concierge', 'enquiry-handoff'],
    motionPreset: 'typographic',
    ctaVocabulary: { primary: 'request-dossier', secondary: 'private-conversation' }
  }
};

const FAMILY_IDS = ['villa-estate', 'urban-apartment', 'metropolitan-luxury'];
const DEFAULT_FAMILY = 'villa-estate';

function getFamily(id) {
  return FAMILIES[id] || null;
}

function getTheme(familyId, themeId) {
  const f = FAMILIES[familyId];
  if (!f) return null;
  if (themeId && themeId !== `${familyId}-default`) return null;
  return f;
}

function defaultFamily() {
  return DEFAULT_FAMILY;
}

function listFamilies() {
  return FAMILY_IDS.slice();
}

function resolve(familyId) {
  return FAMILIES[familyId] || FAMILIES[DEFAULT_FAMILY];
}

const LarumFamilies = { getFamily, getTheme, defaultFamily, listFamilies, resolve, FAMILIES, FAMILY_IDS, DEFAULT_FAMILY };

if (typeof window !== 'undefined') window.LarumFamilies = LarumFamilies;
if (typeof module !== 'undefined' && module.exports) module.exports = LarumFamilies;
