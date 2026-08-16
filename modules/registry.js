'use strict';

/* LPE-04 module catalog. Assembles window.LarumModules + window.LARUM_MODULES.
   The 6 P0 module files register themselves into window.LarumModules; this file
   owns the flag map and resolveModule(id) so app.js and tests share one source
   of truth for "is this module live?".
   No module lives here. Frames (hero/identity/image-band/explore/calculator)
   and P1 modules (spatial-zones/setting-lifestyle/documents-private-room) are
   never registered, so resolveModule returns null for them. */

(function (global) {
  global.LarumModules = global.LarumModules || {};

  /* Per-module feature flag, on by default (LPE-04 §4.6). Set any id to false
     (before app.js loads) to fall back to the retained legacy renderer. */
  global.LARUM_MODULES = global.LARUM_MODULES || {
    'enquiry-handoff': true,
    arrival: true,
    'property-dna': true,
    'lived-sequence': true,
    'verified-intelligence': true,
    concierge: true
  };

  function resolveModule(id) {
    const mods = global.LarumModules || {};
    const flags = global.LARUM_MODULES || {};
    const mod = mods[id];
    if (!mod) return null;
    if (flags[id] === false) return null;
    return mod;
  }

  const Catalog = {
    resolveModule,
    modules: function () { return global.LarumModules; },
    flags: function () { return global.LARUM_MODULES; }
  };

  global.LarumModuleCatalog = Catalog;
  if (typeof module !== 'undefined' && module.exports) module.exports = Catalog;
})(typeof window !== 'undefined' ? window : globalThis);
