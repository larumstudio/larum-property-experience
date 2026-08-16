'use strict';

const MODULE_IDS = ['arrival','property-dna','lived-sequence','spatial-zones','verified-intelligence','setting-lifestyle','documents-private-room','concierge','enquiry-handoff'];
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const slug = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
const idFor = (prefix, value, index) => `${prefix}-${slug(value)}-${index + 1}`;
const locales = value => ({ en: value?.en || '', es: value?.es || '' });

const FAMILY_BY_SLUG = {
  madrid: 'urban-apartment',
  marbella: 'villa-estate',
  _template: 'villa-estate'
};

function familyFor(propertySlug) {
  return FAMILY_BY_SLUG[propertySlug] || 'villa-estate';
}

function adaptContent(raw, propertySlug) {
  const c = clone(raw || {});
  const scenes = (c.sequences || []).map((s, i) => ({
    id: idFor('scene', s[0], i), label: s[0] || '', time: s[1] || null,
    description: s[2] || '', spaceIds: ((c.sceneSpaces || [])[i]?.[1] || []).map((x, n) => idFor('space', x, n)), assetSlotIds: []
  }));
  const allSpaces = [];
  (c.sceneSpaces || []).forEach(sc => (sc[1] || []).forEach((name, i) => {
    if (!allSpaces.some(x => x.name === name)) allSpaces.push({ name, id: idFor('space', name, allSpaces.length) });
  }));
  const spaces = allSpaces.map((x, i) => ({ id: x.id, name: x.name, type: null, zoneId: null, description: x.name, descriptionByLocale: locales({}) }));
  const spaceId = name => allSpaces.find(x => x.name === name)?.id || idFor('space', name, allSpaces.length);
  scenes.forEach((scene, i) => { scene.spaceIds = ((c.sceneSpaces || [])[i]?.[1] || []).map(spaceId); });
  const zones = (c.spatial || []).map((z, i) => ({ id: idFor('zone', z[1], i), label: z[1] || '', description: z[2] || '', spaceIds: [], planAnchor: null }));
  const dna = c.dna || {};
  const dimensions = (dna.dimensions || []).map((d, i) => ({ id: idFor('dna', d.label, i), label: d.label || '', score: d.score ?? null, noteByLocale: locales(d.note), evidenceIds: [] }));
  return {
    schemaVersion: '1.0', identity: { label:c.label||'', brand:c.brand||'', title:c.title||'', subtitle:c.subtitle||'', intro:c.intro||'', shortRef:c.shortRef||'', conciergeIntro:c.conciergeIntro||'' },
    dna: { title:dna.title||'', intro:dna.intro||'', dimensions }, scenes, spaces, zones,
    factsDisplay: clone(c.facts || []), copyByLocale: clone(c.copy || {}),
    legacy: { slug: propertySlug, sequences: clone(c.sequences || []), sceneSpaces: clone(c.sceneSpaces || []), spatial: clone(c.spatial || []) }
  };
}

function adaptKnowledge(raw) {
  const k = clone(raw || {});
  const facts = {};
  for (const [key, fact] of Object.entries(k.property?.facts || {})) facts[key] = { id:key, ...clone(fact) };
  const spaces = {};
  for (const [name, space] of Object.entries(k.property?.spaces || {})) spaces[slug(name)] = { id:slug(name), name, ...clone(space) };
  return { schemaVersion:'1.0', fallback:clone(k.fallback || {}), property:{ ...clone(k.property || {}), facts, spaces }, surroundings:clone(k.surroundings || {}), intents:clone(k.intents || []), interestSignals:clone(k.interestSignals || {}), qualification:clone(k.qualification || []), legacy:clone(k) };
}

function assetRecord(propertySlug, slotId, kind, source, status, priority) {
  return { schemaVersion:'1.0', id:`${propertySlug}-${slotId}`, slotId, kind, status, source:clone(source || {}), fallbackPriority:priority, fallbackSlotIds:[] };
}
function adaptAssets(raw, propertySlug) {
  const a = clone(raw || {}), out = [];
  const status = a.status === 'prototype-reference' || a.authorised !== true ? 'placeholder' : 'received';
  const hero = a.hero || {};
  if (hero.video || hero.poster || hero.fallbackImage) out.push(assetRecord(propertySlug, 'hero', hero.video ? 'video' : 'image', { video:hero.video||null, poster:hero.poster||null, url:hero.fallbackImage||hero.poster||null, provenance:hero.provenance||null, authorised:a.authorised === true }, status, 1));
  if (a.bandImage) out.push(assetRecord(propertySlug, 'band-image', 'image', { url:a.bandImage, provenance:a.bandProvenance||null, authorised:a.authorised === true }, status, 2));
  if (a.propertyFilm) out.push(assetRecord(propertySlug, 'property-film', 'video', { url:a.propertyFilm, authorised:a.authorised === true }, status, 3));
  for (const [name, media] of Object.entries(a.spaces || {})) out.push(assetRecord(propertySlug, `space-${slug(name)}`, media?.video ? 'video' : 'image', { name, ...clone(media) }, status, 4));
  return { schemaVersion:'1.0', assets:out, legacy:a };
}

function adaptExperience(propertySlug, family = 'villa-estate') {
  return { schemaVersion:'1.0', revisionId:`${propertySlug}-legacy`, propertyId:propertySlug, family, themeId:`${family}-default`, modules:MODULE_IDS.map((id, i) => ({ id, instanceId:`${id}-01`, visible:true, order:(i+1)*10, config:{} })), navigation:{ chapters:MODULE_IDS.slice(), defaultEntry:'arrival-01' }, ctaPolicy:{}, motionPolicy:{ enabled:true, reducedMotionFallback:'static-composed' }, fallbackPolicy:{}, assetContractIds:[] };
}

function deriveManifest(propertySlug) {
  return adaptExperience(propertySlug, familyFor(propertySlug));
}

function validateManifest(manifest) {
  const issues = [];
  const issue = msg => issues.push(msg);
  if (!manifest || typeof manifest !== 'object') return { valid: false, issues: ['manifest required'] };
  if (manifest.schemaVersion !== '1.0') issue('schemaVersion must be 1.0');
  if (!manifest.revisionId) issue('revisionId required');
  if (!manifest.propertyId) issue('propertyId required');
  if (!['urban-apartment','villa-estate','metropolitan-luxury'].includes(manifest.family)) issue('invalid family');
  if (!manifest.themeId) issue('themeId required');
  if (!manifest.navigation || !Array.isArray(manifest.navigation.chapters) || !manifest.navigation.defaultEntry) issue('navigation required');
  if (!manifest.ctaPolicy || typeof manifest.ctaPolicy !== 'object') issue('ctaPolicy required');
  if (!manifest.motionPolicy || typeof manifest.motionPolicy !== 'object') issue('motionPolicy required');
  if (!manifest.fallbackPolicy || typeof manifest.fallbackPolicy !== 'object') issue('fallbackPolicy required');
  if (!Array.isArray(manifest.assetContractIds)) issue('assetContractIds required');
  if (!Array.isArray(manifest.modules)) issue('modules required');
  else {
    const ids = new Set();
    const orders = new Set();
    const instances = new Set();
    for (const m of manifest.modules) {
      if (!m || typeof m !== 'object') { issue('invalid module item'); continue; }
      if (!MODULE_IDS.includes(m.id)) issue(`unknown module ${m.id}`);
      if (!m.id) issue('module id required');
      else if (ids.has(m.id)) issue('duplicate module id');
      else ids.add(m.id);
      if (!m.instanceId) issue('instanceId required');
      else if (instances.has(m.instanceId)) issue('duplicate instanceId');
      else instances.add(m.instanceId);
      if (typeof m.visible !== 'boolean') issue('visible required');
      if (typeof m.order !== 'number') issue('order required');
      else if (orders.has(m.order)) issue('duplicate order values');
      else orders.add(m.order);
      if (!m.config || typeof m.config !== 'object') issue('config required');
    }
  }
  return { valid: issues.length === 0, issues };
}

function adaptProperty(slug, parts) {
  const p = clone(parts || {});
  return { schemaVersion:'1.0', slug, status:'ready', label:p.content?.label || slug, location:{ display:p.content?.label || slug }, content:adaptContent(p.content, slug), knowledge:adaptKnowledge(p.knowledge), assets:adaptAssets(p.assets, slug), experience:adaptExperience(slug, familyFor(slug)), legacy:p };
}

function validateNormalized(prop) {
  const issues=[], warnings=[];
  const issue = (path, msg) => issues.push(`${prop.slug || 'property'} · ${path}: ${msg}`);
  const c=prop.content||{}, k=prop.knowledge||{}, a=prop.assets||{};
  if (prop.schemaVersion !== '1.0') issue('schemaVersion','must be 1.0');
  if (!['urban-apartment','villa-estate','metropolitan-luxury'].includes(prop.experience?.family)) issue('experience.family','invalid family');
  const unique = (items, path, key='id') => {
    const seen = new Set();
    (items || []).forEach((item, i) => { if (!item?.[key]) issue(`${path}[${i}].${key}`, 'required'); else if (seen.has(item[key])) issue(path, 'duplicate IDs'); else seen.add(item[key]); });
    return seen;
  };
  const sceneIds=unique(c.scenes,'content.scenes'), spaceIds=unique(c.spaces,'content.spaces'), zoneIds=unique(c.zones,'content.zones');
  for (const [i,s] of (c.scenes||[]).entries()) for (const id of s.spaceIds || []) if (!spaceIds.has(id)) issue(`content.scenes[${i}].spaceIds`, `unknown space ${id}`);
  for (const [i,z] of (c.zones||[]).entries()) for (const id of z.spaceIds || []) if (!spaceIds.has(id)) issue(`content.zones[${i}].spaceIds`, `unknown space ${id}`);
  for (const [key,f] of Object.entries(k.property?.facts || {})) {
    if (!['confirmed','pending','requires-advisor','rejected'].includes(f.status)) issue(`knowledge.property.facts.${key}.status`,'invalid status');
    if (f.status === 'confirmed' && !f.source) warnings.push(`${prop.slug} · knowledge: confirmed fact ${key} has no source`);
    if (f.status !== 'confirmed') warnings.push(`${prop.slug} · knowledge: fact ${key} is not confirmed`);
  }
  const assetIds=unique(a.assets,'assets','id');
  for (const asset of a.assets || []) {
    if (!['image','video','image_sequence','svg','document','depth_map'].includes(asset.kind)) issue(`assets.${asset.id}.kind`,'invalid kind');
    if (!['placeholder','received','approved','published','archived'].includes(asset.status)) issue(`assets.${asset.id}.status`,'invalid status');
    if (asset.status === 'placeholder') warnings.push(`${prop.slug} · assets: ${asset.slotId} is placeholder`);
    if (asset.kind === 'video' && !asset.source?.poster && !asset.source?.fallbackImage && !asset.fallbackSlotIds?.length) warnings.push(`${prop.slug} · assets: ${asset.slotId} has no poster or fallback`);
    for (const fallback of asset.fallbackSlotIds || []) if (!assetIds.has(`${prop.slug}-${fallback}`) && !a.assets.some(x=>x.slotId===fallback)) issue(`assets.${asset.id}.fallbackSlotIds`, `unknown fallback ${fallback}`);
  }
  const graph = new Map((a.assets||[]).map(x => [x.slotId, x.fallbackSlotIds || []]));
  function visit(node, stack=[]) { if (stack.includes(node)) { issue('assets.fallbackSlotIds', `circular fallback ${[...stack,node].join(' → ')}`); return; } for (const next of graph.get(node) || []) visit(next, [...stack,node]); }
  for (const node of graph.keys()) visit(node);
  const modules = prop.experience?.modules || []; const moduleIds = new Set(MODULE_IDS);
  const instanceIds=unique(modules,'experience.modules','instanceId'), orders=new Set();
  for (const m of modules) { if (!moduleIds.has(m.id)) issue('experience.modules.id', `unknown module ${m.id}`); if (orders.has(m.order)) issue('experience.modules','duplicate order values'); orders.add(m.order); }
  return { valid:issues.length===0, issues, warnings, normalized:prop };
}

const LarumDomainAdapters = {
  adaptContent, adaptKnowledge, adaptAssets, adaptExperience, adaptProperty,
  validateNormalized, deriveManifest, validateManifest, familyFor, MODULE_IDS
};

if (typeof window !== 'undefined') window.LarumDomainAdapters = LarumDomainAdapters;
if (typeof module !== 'undefined' && module.exports) module.exports = LarumDomainAdapters;
