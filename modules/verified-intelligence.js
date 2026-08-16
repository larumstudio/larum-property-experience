'use strict';

/* LPE-04 P0 module: verified-intelligence.
   Render-only today (no interactive behavior). Extracted for the boundary —
   it owns #details. mount/destroy are intentional no-ops. */

(function (global) {
  let _ctx = null;
  let _root = null;

  function render(ctx) {
    _ctx = ctx;
    const p = ctx.property;
    const lang = ctx.lang;
    return `<section id="details" class="section light"><div class="grid"><div><div class="mono">06 · ${lang==='en'?'Verified details':'Datos verificados'}</div><h2>${ctx.pc('detailsTitle')}</h2></div><div><p>${ctx.pc('detailsIntro')}</p><div class="facts">${p.facts.map(f=>`<div class="fact"><strong>${f[0]}</strong><span>${f[1]}</span></div>`).join('')}</div></div></div></section>`;
  }

  function mount(root, ctx) {
    _ctx = ctx;
    _root = root;
  }

  function update(ctx) {
    _ctx = ctx;
    return false;
  }

  function destroy() {
    _root = null;
  }

  const Module = { id: 'verified-intelligence', render, mount, update, destroy, actions: {} };

  global.LarumModules = global.LarumModules || {};
  global.LarumModules[Module.id] = Module;
  if (typeof module !== 'undefined' && module.exports) module.exports = Module;
})(typeof window !== 'undefined' ? window : globalThis);
