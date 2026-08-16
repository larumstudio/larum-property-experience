'use strict';

/* LPE-06 Asset Contracts. Canonical, family-neutral slot contracts for the
   current runtime. Each contract satisfies schemas/asset-contract.schema.json.
   This is a contract registry — not a module registry (LPE-04's "frames are
   never modules" still holds for the module registry). */

/* Full contract fields per asset-contract.schema.json:
   schemaVersion, id, slotId, moduleId, kind, required, acceptedSources,
   minWidth, preferredAspectRatios, variants, fallbackSlotIds, rightsPolicy,
   composition. */

const S = {
  agency: ['existing_agency', 'ai_enhancement', 'placeholder'],
  hero: ['existing_agency', 'ai_enhancement', 'placeholder'],
  film: ['existing_agency', 'human_production'],
  plan: ['existing_agency', 'new_digital']
};

function contract(id, slotId, moduleId, kind, required, acceptedSources, variants, fallbackSlotIds, composition) {
  return {
    schemaVersion: '1.0',
    id,
    slotId,
    moduleId,
    kind,
    required,
    acceptedSources,
    minWidth: 0,
    preferredAspectRatios: [],
    variants,
    fallbackSlotIds,
    rightsPolicy: 'agency-authorised',
    composition: composition || {}
  };
}

const CONTRACTS = [
  contract('hero', 'hero', 'hero', 'image', true, S.hero, { desktop: true, mobile: true }, ['band-image'], { textSafeArea: {} }),
  contract('band-image', 'band-image', 'image-band', 'image', true, S.agency, { desktop: true }, [], {}),
  contract('property-film', 'property-film', 'lived-sequence', 'video', false, S.film, { desktop: true }, [], {}),
  contract('space-*', 'space-*', 'spatial-zones', 'image', false, S.agency, { desktop: true }, ['band-image'], {}),
  contract('hero-poster', 'hero-poster', 'hero', 'image', false, S.hero, { desktop: true, mobile: true }, [], {}),
  contract('hero-motion', 'hero-motion', 'hero', 'video', false, S.film, { desktop: true }, [], {}),
  contract('documents-*', 'documents-*', 'documents-private-room', 'document', false, ['existing_agency'], {}, [], {}),
  contract('plan-primary', 'plan-primary', 'spatial-zones', 'image', false, S.plan, { desktop: true }, [], {}),
  contract('plan-zone-map', 'plan-zone-map', 'spatial-zones', 'svg', false, S.plan, { desktop: true }, [], {}),
  contract('depth-map', 'depth-map', 'lived-sequence', 'depth_map', false, ['existing_agency', 'new_digital'], { desktop: true }, [], {})
];

const BY_ID = {};
for (const c of CONTRACTS) BY_ID[c.id] = c;

const FRAMES = ['hero', 'identity', 'image-band', 'explore', 'calculator'];

function getContract(slotId) {
  return BY_ID[slotId] || null;
}

function listContracts() {
  return CONTRACTS.map(c => c.id);
}

function contractsForModule(moduleId) {
  return CONTRACTS.filter(c => c.moduleId === moduleId);
}

/* Required contracts by VISIBLE modules/frames. Does NOT read
   manifest.assetContractIds (still unused at runtime). Family-neutral. */
function requiredContractIds(manifest) {
  const ids = [];
  const add = c => { if (c.required && ids.indexOf(c.id) === -1) ids.push(c.id); };
  for (const c of CONTRACTS) {
    if (!c.required) continue;
    if (FRAMES.indexOf(c.moduleId) !== -1) {
      add(c);
    } else if (typeof LarumModuleRegistry !== 'undefined' && LarumModuleRegistry.moduleVisible(manifest, c.moduleId)) {
      add(c);
    }
  }
  return ids;
}

function dynamicSlot(base, key) {
  return `${base}-${key}`;
}

const LarumAssetContracts = {
  getContract, listContracts, contractsForModule, requiredContractIds, dynamicSlot,
  CONTRACTS, BY_ID
};

if (typeof window !== 'undefined') window.LarumAssetContracts = LarumAssetContracts;
if (typeof module !== 'undefined' && module.exports) module.exports = LarumAssetContracts;
