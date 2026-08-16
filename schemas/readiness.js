'use strict';

/* LPE-07 Readiness Model. Deterministic: same input → deep-equal output.
   Consumes existing validators; never re-implements their rules.
   READY = no blockers. Does not imply final production quality. */

function _loader() {
  if (typeof LarumLoader !== 'undefined') return LarumLoader;
  if (typeof require === 'function') { try { return require('../property-loader'); } catch (e) { return null; } }
  return null;
}
function _adapters() {
  if (typeof LarumDomainAdapters !== 'undefined') return LarumDomainAdapters;
  if (typeof require === 'function') { try { return require('./adapters'); } catch (e) { return null; } }
  return null;
}
function _contracts() {
  if (typeof LarumAssetContracts !== 'undefined') return LarumAssetContracts;
  if (typeof require === 'function') { try { return require('./asset-contracts'); } catch (e) { return null; } }
  return null;
}
function _resolver() {
  if (typeof LarumAssetResolver !== 'undefined') return LarumAssetResolver;
  if (typeof require === 'function') { try { return require('./asset-resolver'); } catch (e) { return null; } }
  return null;
}

/* §2.1 Module axis: 9 MODULE_IDS in registry order, then 5 frames (14 total). */
const _MODULE_IDS_9 = [
  'arrival', 'property-dna', 'lived-sequence', 'spatial-zones',
  'verified-intelligence', 'setting-lifestyle', 'documents-private-room',
  'concierge', 'enquiry-handoff'
];
const _FRAME_IDS_5 = ['hero', 'identity', 'image-band', 'explore', 'calculator'];
const _MODULE_AXIS = _MODULE_IDS_9.concat(_FRAME_IDS_5);

/* Map slotId → moduleId via contract registry. Handles wildcards. */
function _slotToModule(slotId) {
  const contracts = _contracts();
  if (!contracts) return null;
  const c = contracts.getContract(slotId);
  if (c) return c.moduleId;
  const base = String(slotId).split('-')[0];
  const wc = contracts.getContract(base + '-*');
  return wc ? wc.moduleId : null;
}

/* §3.3 Attribution: origin string → moduleId.
   Returns: string (known module/frame), null (top-level/property-level, known), undefined (unclassified). */
function _attributeModule(origin, slug) {
  /* Strip optional "slug · " prefix that validateNormalized adds to its messages. */
  const core = origin.replace(/^[^·]+ · /, '');

  /* Explicitly null-attributed — property-level, no single module */
  if (/^Property ".+" not found/.test(core)) return null;
  if (/assets\.fallbackSlotIds: circular fallback/.test(core)) return null;
  if (/^experience\.modules(?:\.id)?:/.test(core)) return null;

  /* identity */
  if (/^content: missing (label|brand|title|subtitle|intro|shortRef)$/.test(core)) return 'identity';
  if (/^content: missing copy\.identityNote/.test(core)) return 'identity';

  /* concierge */
  if (/^content: missing conciergeIntro/.test(core)) return 'concierge';
  if (/knowledge: need at least 6 concierge intents|knowledge: missing interest signals|knowledge: missing qualification triggers|knowledge: missing bilingual fallback response/.test(core)) return 'concierge';

  /* lived-sequence */
  if (/^content: need at least 3 sequences|^content: sceneSpaces must have/.test(core)) return 'lived-sequence';
  if (/^content: missing copy\.(sequenceTitle|sequenceIntro|filmLabel)/.test(core)) return 'lived-sequence';
  if (/^content\.scenes/.test(core)) return 'lived-sequence';
  if (/^assets: no property film/.test(core)) return 'lived-sequence';

  /* spatial-zones */
  if (/^content: need at least 2 spatial zones|^content: spatialNodeDetails/.test(core)) return 'spatial-zones';
  if (/^content: missing copy\.spatial/.test(core)) return 'spatial-zones';
  if (/^content\.zones/.test(core)) return 'spatial-zones';
  if (/^content\.spaces: duplicate IDs/.test(core)) return 'spatial-zones';
  if (/^knowledge: need at least 5 space descriptions|^knowledge: space "/.test(core)) return 'spatial-zones';

  /* verified-intelligence */
  if (/^content: need at least 3 facts/.test(core)) return 'verified-intelligence';
  if (/^content: missing copy\.details/.test(core)) return 'verified-intelligence';
  if (/^knowledge: missing property facts/.test(core)) return 'verified-intelligence';
  if (/^knowledge: \d+ fact\(s\) not confirmed|^knowledge: fact .+ is not confirmed|^knowledge: confirmed fact .+ has no source/.test(core)) return 'verified-intelligence';
  if (/^knowledge\.property\.facts\.[^.]+\.status: invalid status/.test(core)) return 'verified-intelligence';

  /* explore */
  if (/^content: need at least 3 experiences/.test(core)) return 'explore';

  /* property-dna */
  if (/^content: missing DNA dimensions|^content: DNA "|^content: a DNA dimension/.test(core)) return 'property-dna';

  /* setting-lifestyle */
  if (/^content: missing setting cards|^content: setting card "|^content: a setting card/.test(core)) return 'setting-lifestyle';
  if (/^knowledge: missing surroundings data/.test(core)) return 'setting-lifestyle';

  /* image-band */
  if (/^content: missing copy\.bandLabel/.test(core)) return 'image-band';
  if (/^assets: no band image|^assets: band image has no provenance recorded/.test(core)) return 'image-band';

  /* arrival */
  if (/^content: arrival\./.test(core)) return 'arrival';

  /* calculator */
  if (/^content: missing referencePrice|^content: missing defaultRegion|^content: defaultRegion ".+" has no rates/.test(core)) return 'calculator';

  /* hero */
  if (/^assets: no hero image|^assets: hero is still a generated placeholder|^assets: stand-in photography|^assets: hero has no provenance recorded/.test(core)) return 'hero';

  /* Normalized slot-level messages: extract slotId from the message text */
  const assetSlot = core.match(/^assets: (\S+) (?:is placeholder|has no poster)/);
  if (assetSlot) return _slotToModule(assetSlot[1]);

  /* Normalized assets.<assetId>.<field> — strip slug prefix to get slotId */
  const assetField = core.match(/^assets\.([^.]+)\./);
  if (assetField) {
    const assetId = assetField[1];
    const slotId = (slug && assetId.startsWith(slug + '-'))
      ? assetId.slice(slug.length + 1)
      : assetId;
    return _slotToModule(slotId);
  }

  return undefined; // unclassified
}

/* §1 Deterministic ordering: blockers → warnings → infos → unclassified; lex by origin within group. */
function _sortItems(items) {
  const rank = { blocker: 0, warning: 1, info: 2 };
  return items.slice().sort((a, b) => {
    const ra = a.unclassified ? 3 : (rank[a.severity] != null ? rank[a.severity] : 3);
    const rb = b.unclassified ? 3 : (rank[b.severity] != null ? rank[b.severity] : 3);
    if (ra !== rb) return ra - rb;
    return a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0;
  });
}

/* Primary export: readiness(slug, parts) → report.
   parts = { content, knowledge, assets, experience? } — read-only.
   Callers must pre-load the loader with the property data OR rely on the auto-load below. */
function readiness(slug, parts) {
  if (typeof parts !== 'object' || parts === null) {
    throw new TypeError('readiness: parts must be an object');
  }

  const loader = _loader();
  const adapters = _adapters();
  const contracts = _contracts();
  const resolver = _resolver();

  /* Auto-load parts into the loader if the slug is not already there.
     This keeps the function self-contained for Admin and test contexts. */
  if (loader) {
    const probe = loader.validate(slug);
    const notFound = (probe.issues || []).some(function(i) { return /not found/.test(i); });
    if (notFound) {
      loader.loadFromPack({
        registry: { order: [slug], default: slug },
        properties: {
          [slug]: {
            content:  parts.content  || null,
            knowledge: parts.knowledge || null,
            assets:   parts.assets   || null
          }
        }
      });
    }
  }

  /* Run all four validators (consumed, never re-implemented). */
  const loaderResult = loader
    ? loader.validate(slug)
    : { valid: true, issues: [], warnings: [] };

  const normalized = adapters ? adapters.adaptProperty(slug, parts) : null;
  const normalizedResult = (adapters && normalized)
    ? adapters.validateNormalized(normalized)
    : { valid: true, issues: [], warnings: [] };

  /* Use deriveManifest; parts.experience is not consumed by the admin store. */
  const manifest = adapters ? adapters.deriveManifest(slug) : null;
  const manifestResult = (adapters && manifest)
    ? adapters.validateManifest(manifest)
    : { valid: true, issues: [] };

  const resolverResult = (resolver && manifest)
    ? resolver.resolve(manifest, slug, parts.assets || {})
    : { slots: {}, requiredMissing: [], flagged: [] };

  /* §5 Family is informational only; no classification varies by family. */
  const family = adapters ? adapters.familyFor(slug) : 'villa-estate';

  /* Build the flat item list from every source. */
  const allItems = [];

  function _addItems(msgs, severity, source) {
    for (var i = 0; i < (msgs || []).length; i++) {
      var origin = msgs[i];
      var mod = _attributeModule(origin, slug);
      allItems.push({
        severity: severity,
        origin: origin,
        source: source,
        moduleId: mod === undefined ? null : mod,
        slotId: null,
        unclassified: mod === undefined
      });
    }
  }

  _addItems(loaderResult.issues,       'blocker', 'loader');
  _addItems(loaderResult.warnings,     'warning', 'loader');
  _addItems(normalizedResult.issues,   'blocker', 'normalized');
  _addItems(normalizedResult.warnings, 'warning', 'normalized');

  /* validateManifest issues → BLOCKER, property-level (moduleId: null). */
  for (var mi = 0; mi < (manifestResult.issues || []).length; mi++) {
    allItems.push({
      severity: 'blocker',
      origin: manifestResult.issues[mi],
      source: 'manifest',
      moduleId: null,
      slotId: null,
      unclassified: false
    });
  }

  /* resolver.requiredMissing → BLOCKER per slot. */
  var requiredMissing = resolverResult.requiredMissing || [];
  for (var ri = 0; ri < requiredMissing.length; ri++) {
    var rmSlot = requiredMissing[ri];
    allItems.push({
      severity: 'blocker',
      origin: 'resolver: required slot "' + rmSlot + '" is missing',
      source: 'resolver',
      moduleId: _slotToModule(rmSlot),
      slotId: rmSlot,
      unclassified: false
    });
  }

  /* resolver.flagged → WARNING per slot. */
  var flagged = resolverResult.flagged || [];
  for (var fi = 0; fi < flagged.length; fi++) {
    var f = flagged[fi];
    allItems.push({
      severity: 'warning',
      origin: 'resolver: slot "' + f.slotId + '" ' + f.reason,
      source: 'resolver',
      moduleId: _slotToModule(f.slotId),
      slotId: f.slotId,
      unclassified: false
    });
  }

  /* §2.4 Expand slot list in contract order for INFO generation and SlotReports.
     Wildcard contracts (space-*, documents-*) expand from rawAssets keys. */
  var contractList = contracts ? contracts.listContracts() : [];
  var rawAssets = parts.assets || {};
  var slotList = [];
  for (var ci = 0; ci < contractList.length; ci++) {
    var cid = contractList[ci];
    if (cid === 'space-*') {
      var spaceKeys = Object.keys(rawAssets.spaces || {}).slice().sort();
      for (var sk = 0; sk < spaceKeys.length; sk++) slotList.push('space-' + spaceKeys[sk]);
    } else if (cid === 'documents-*') {
      var docKeys = Object.keys(rawAssets.documents || {}).slice().sort();
      for (var dk = 0; dk < docKeys.length; dk++) slotList.push('documents-' + docKeys[dk]);
    } else {
      slotList.push(cid);
    }
  }

  /* §3.5 INFO for each non-required slot whose resolver status is 'missing'.
     Deliberate double-reporting for property-film (loader also warns). */
  var resolvedSlots = resolverResult.slots || {};
  for (var si = 0; si < slotList.length; si++) {
    var infoSlotId = slotList[si];
    var infoBase = infoSlotId.split('-')[0];
    var infoContract = contracts
      ? (contracts.getContract(infoSlotId) || contracts.getContract(infoBase + '-*'))
      : null;
    if (!infoContract || infoContract.required) continue;
    var infoSlot = resolvedSlots[infoSlotId];
    if (!infoSlot || infoSlot.status === 'missing') {
      allItems.push({
        severity: 'info',
        origin: 'optional slot "' + infoSlotId + '" has no asset',
        source: 'resolver',
        moduleId: _slotToModule(infoSlotId),
        slotId: infoSlotId,
        unclassified: false
      });
    }
  }

  /* §2.2 Per-module reports (14 modules in axis order). INFO does not set 'warn'. */
  var modules = _MODULE_AXIS.map(function(id) {
    var modItems = allItems.filter(function(item) {
      return item.moduleId === id && !item.unclassified;
    });
    var blockers = _sortItems(modItems.filter(function(i) { return i.severity === 'blocker'; }));
    var warnings = _sortItems(modItems.filter(function(i) { return i.severity === 'warning'; }));
    var infos    = _sortItems(modItems.filter(function(i) { return i.severity === 'info'; }));
    var status   = blockers.length ? 'blocked' : warnings.length ? 'warn' : 'ready';
    return { id: id, blockers: blockers, warnings: warnings, infos: infos, status: status };
  });

  /* §2.3 Per-slot reports in slot-axis order. */
  var slots = slotList.map(function(slotId) {
    var slotBase = slotId.split('-')[0];
    var slotContract = contracts
      ? (contracts.getContract(slotId) || contracts.getContract(slotBase + '-*'))
      : null;
    var slot = resolvedSlots[slotId] || {
      status: 'missing', rights: { clear: false, reason: 'missing' }, fallbackUsed: null
    };
    var state = slot.status === 'missing'      ? 'missing'
              : slot.status === 'placeholder'  ? 'placeholder'
              : 'approved';
    var slotItems = allItems.filter(function(item) {
      return item.slotId === slotId && !item.unclassified;
    });
    return {
      slotId:       slotId,
      moduleId:     slotContract ? slotContract.moduleId : null,
      required:     slotContract ? slotContract.required : false,
      state:        state,
      rights:       slot.rights || { clear: false, reason: 'missing' },
      fallbackUsed: slot.fallbackUsed || null,
      blockers: _sortItems(slotItems.filter(function(i) { return i.severity === 'blocker'; })),
      warnings: _sortItems(slotItems.filter(function(i) { return i.severity === 'warning'; })),
      infos:    _sortItems(slotItems.filter(function(i) { return i.severity === 'info'; }))
    };
  });

  /* §1 Rollups: module-attributed items in module order, then top-level (moduleId:null), lex sorted. */
  function _buildRollup(severity) {
    var modItems = [];
    for (var m = 0; m < modules.length; m++) {
      var list = severity === 'blocker' ? modules[m].blockers
               : severity === 'warning' ? modules[m].warnings
               : modules[m].infos;
      for (var k = 0; k < list.length; k++) modItems.push(list[k]);
    }
    var topLevel = _sortItems(allItems.filter(function(i) {
      return i.moduleId === null && !i.unclassified && i.severity === severity;
    }));
    return modItems.concat(topLevel);
  }

  return {
    slug:          slug,
    family:        family,
    modules:       modules,
    slots:         slots,
    blockers:      _buildRollup('blocker'),
    warnings:      _buildRollup('warning'),
    infos:         _buildRollup('info'),
    unclassified:  _sortItems(allItems.filter(function(i) { return i.unclassified; }))
  };
}

const LarumReadiness = { readiness: readiness };

if (typeof window !== 'undefined') window.LarumReadiness = LarumReadiness;
if (typeof module !== 'undefined' && module.exports) module.exports = LarumReadiness;
