'use strict';

/* LPE-04 P0 module: arrival.
   Owns the #arrivalOverlay subtree, the arrival step state, and its listeners.
   Cross-module: ctx.navigate for the identity/sequence fallback. */

(function (global) {
  let _ctx = null;
  let _root = null;
  let arrivalIndex = 0;

  function render(ctx) {
    _ctx = ctx;
    const lang = ctx.lang;
    return `<div id="arrivalOverlay" class="arrival-overlay" aria-hidden="true"><div class="arrival-backdrop"></div><div class="arrival-progress"><span class="arrival-step active">01</span><i></i><span class="arrival-step">02</span><i></i><span class="arrival-step">03</span></div><button class="arrival-close" data-action="arrival-close">Close ×</button><div class="arrival-content"><div class="eyebrow" id="arrivalEyebrow">Arrival</div><h2 id="arrivalTitle"></h2><p id="arrivalText"></p><button class="arrival-next" data-action="arrival-next">${lang==='en'?'Continue':'Continuar'} <b>↘</b></button></div></div>`;
  }

  function open() {
    if (!_ctx.isVisible('arrival')) { _ctx.navigate('sequence'); return; }
    if (!_root) { _ctx.navigate('sequence'); return; }
    arrivalIndex = 0;
    _root.classList.add('open');
    _root.setAttribute('aria-hidden', 'false');
    updateArrival();
  }

  function close() {
    const o = _root;
    if (!o) return;
    o.classList.remove('open');
    o.setAttribute('aria-hidden', 'true');
  }

  function next() {
    if (arrivalIndex < 2) { arrivalIndex++; updateArrival(); }
    else { close(); _ctx.navigate('identity'); }
  }

  function updateArrival() {
    const p = _ctx.property;
    const scenes = _ctx.model('arrival')?.[_ctx.lang] || [];
    const s = scenes[arrivalIndex];
    if (!s) return;
    _root.querySelector('#arrivalEyebrow').textContent = `0${arrivalIndex+1} · ${s[0]}`;
    _root.querySelector('#arrivalTitle').textContent = s[1];
    _root.querySelector('#arrivalText').textContent = s[2];
    _root.querySelectorAll('.arrival-step').forEach((el, i) => el.classList.toggle('active', i === arrivalIndex));
    _root.querySelector('.arrival-backdrop').style.backgroundImage = `linear-gradient(90deg,rgba(12,13,11,.76),rgba(12,13,11,.24)),url('${p.image}')`;
  }

  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!t) return;
    const a = t.getAttribute('data-action');
    if (a === 'arrival-close') close();
    else if (a === 'arrival-next') next();
  }

  function mount(root, ctx) {
    _ctx = ctx;
    _root = root;
    root.addEventListener('click', onClick);
  }

  function update(ctx) {
    _ctx = ctx;
    return false;
  }

  function destroy() {
    if (_root) { _root.removeEventListener('click', onClick); }
    _root = null;
  }

  const Module = { id: 'arrival', render, mount, update, destroy, actions: { open, next, close } };

  global.LarumModules = global.LarumModules || {};
  global.LarumModules[Module.id] = Module;
  if (typeof module !== 'undefined' && module.exports) module.exports = Module;
})(typeof window !== 'undefined' ? window : globalThis);
