'use strict';

/* LPE-06 Asset Resolver. Walks the §5.1 chain:
     approved requested variant (declared only — skip)
   → approved base asset
   → approved fallback slot
   → placeholder fixture
   → text/structural fallback
   Consumes LPE-01 adaptAssets (unchanged) for normalization. Never throws,
   never mutates rawAssets. Variants are declared, not produced/selected. */

function _adapters() {
  if (typeof LarumDomainAdapters !== 'undefined') return LarumDomainAdapters;
  if (typeof require === 'function') {
    try { return require('./adapters'); } catch (e) { return null; }
  }
  return null;
}
function _contracts() {
  if (typeof LarumAssetContracts !== 'undefined') return LarumAssetContracts;
  if (typeof require === 'function') {
    try { return require('./asset-contracts'); } catch (e) { return null; }
  }
  return null;
}

function _url(rec) {
  const s = rec.source || {};
  return s.url || s.video || s.image || s.poster || s.fallbackImage || null;
}
function _provenance(rec) {
  return (rec.source && rec.source.provenance) || null;
}
function _expiry(rec) {
  const p = _provenance(rec);
  if (!p) return null;
  return p.expiry || (p.rights && p.rights.expiry) || null;
}
function _expired(rec) {
  const exp = _expiry(rec);
  if (!exp) return false;
  const t = Date.parse(exp);
  return !isNaN(t) && t < Date.now();
}
/* §4.5 rights rule — authorised-based, NOT status-based. The flat
   assets.json.authorised flag is the source of truth. adaptAssets copies it
   into source.authorised for hero/band/film records but NOT for space-*
   records, so the resolver reads the property-level flag directly (the exact
   field §4.5 references). Mapping is identity: authorised===true -> clear path,
   authorised!==true -> placeholder. No status enum is involved. */
function _rights(rec, authorised) {
  if (authorised === true) {
    if (!_provenance(rec)) return { clear: false, reason: 'missing-provenance' };
    if (_expired(rec)) return { clear: false, reason: 'expired' };
    return { clear: true, reason: null };
  }
  return { clear: false, reason: 'placeholder' };
}

function resolve(manifest, slug, rawAssets) {
  const adapters = _adapters();
  const contracts = _contracts();
  const raw = rawAssets || {};
  const authorised = raw.authorised === true;

  const norm = adapters && adapters.adaptAssets ? adapters.adaptAssets(raw, slug) : { assets: [] };

  const bySlot = {};
  for (const rec of norm.assets) {
    if (!rec.slotId) continue;
    (bySlot[rec.slotId] = bySlot[rec.slotId] || []).push(rec);
  }
  function best(slotId) {
    const recs = (bySlot[slotId] || []).slice().sort((a, b) => (a.fallbackPriority || 0) - (b.fallbackPriority || 0));
    return recs.find(r => _url(r)) || null;
  }

  const contractList = contracts ? contracts.listContracts() : [];
  const contractById = {};
  for (const id of contractList) {
    const c = contracts.getContract(id);
    if (c) contractById[id] = c;
  }
  /* Map a concrete dynamic slot (space-terrace) back to its wildcard contract (space-*). */
  function contractFor(id) {
    if (contractById[id]) return contractById[id];
    const base = String(id).split('-')[0];
    if (base === 'space' || base === 'documents') return contractById[`${base}-*`] || null;
    return null;
  }

  /* Expand dynamic slots from the flat assets payload. */
  const slotIds = [];
  for (const id of contractList) {
    if (id === 'space-*') {
      for (const key of Object.keys(raw.spaces || {})) slotIds.push('space-' + key);
    } else if (id === 'documents-*') {
      for (const key of Object.keys(raw.documents || {})) slotIds.push('documents-' + key);
    } else {
      slotIds.push(id);
    }
  }

  const slots = {};
  const flagged = [];

  function emitVideoFlag(id, rec) {
    if (rec.kind === 'video' && !(rec.source && (rec.source.poster || rec.source.fallbackImage))) {
      flagged.push({ slotId: id, reason: 'no-poster' });
    }
  }

  function fromRecord(id, rec, fallbackUsed) {
    const rights = _rights(rec, authorised);
    emitVideoFlag(id, rec);
    if (!rights.clear) flagged.push({ slotId: id, reason: rights.reason });
    return {
      status: rights.clear ? rec.status : 'placeholder',
      url: _url(rec),
      kind: rec.kind,
      variant: 'base',
      fallbackUsed,
      rights
    };
  }

  function resolveSlot(id, depth) {
    const c = contractFor(id);
    const rec = best(id);

    /* approved base */
    if (rec && _rights(rec, authorised).clear) {
      return fromRecord(id, rec, null);
    }
    /* approved fallback slot */
    if (c && c.fallbackSlotIds && c.fallbackSlotIds.length && depth < 2) {
      for (const fb of c.fallbackSlotIds) {
        const fr = best(fb);
        if (fr && _rights(fr, authorised).clear) return fromRecord(id, fr, fb);
      }
    }
    /* placeholder fixture */
    if (rec) {
      return fromRecord(id, rec, null);
    }
    /* non-approved fallback (deeper chain) */
    if (c && c.fallbackSlotIds && c.fallbackSlotIds.length && depth < 2) {
      for (const fb of c.fallbackSlotIds) {
        const r = resolveSlot(fb, depth + 1);
        if (r.status !== 'missing') {
          return { status: r.status, url: r.url, kind: r.kind, variant: 'base', fallbackUsed: fb, rights: r.rights };
        }
      }
    }
    /* text/structural fallback */
    return { status: 'missing', url: null, kind: null, variant: null, fallbackUsed: 'content', rights: { clear: false, reason: 'missing' } };
  }

  for (const id of slotIds) slots[id] = resolveSlot(id, 0);

  const requiredMissing = [];
  for (const id of contractList) {
    if (id === 'space-*' || id === 'documents-*') continue;
    const c = contractById[id];
    if (!c || !c.required) continue;
    if (!slots[id]) slots[id] = resolveSlot(id, 0);
    if (slots[id].status === 'missing') requiredMissing.push(id);
  }

  return { slots, requiredMissing, flagged };
}

const LarumAssetResolver = { resolve };

if (typeof window !== 'undefined') window.LarumAssetResolver = LarumAssetResolver;
if (typeof module !== 'undefined' && module.exports) module.exports = LarumAssetResolver;
