'use strict';

/* LPE-04 P0 module: property-dna.
   Owns the `.dna-section` subtree, the accordion toggle, and its own state.
   Render is pure (no inline handlers); mount binds a delegated click listener.
   The scroll reveal of `.dna-section` stays engine-owned (initExperience). */

(function (global) {
  let _ctx = null;
  let _root = null;
  let openDnaIndex = -1;

  function render(ctx) {
    _ctx = ctx;
    openDnaIndex = -1;
    const p = ctx.property;
    const lang = ctx.lang;
    const dims = ctx.dnaDimensions();
    return `<section class="dna-section"><div class="dna-head"><div><div class="mono">02 · ${lang==='en'?'Property DNA':'ADN de la propiedad'}</div><h2>${p.dna?.title||p.title.replace('\n',' ')}</h2></div><p>${p.dna?.intro||p.intro}</p></div><div class="dna-grid">${dims.map((d,i)=>`<div class="dna-item"><button class="dna-trigger" data-action="dna-toggle" data-index="${i}" aria-expanded="false" aria-controls="dnaNote${i}"><div class="dna-top"><span>0${i+1}</span><b>${d.label}</b><strong>${d.score}</strong></div><div class="dna-bar"><i style="width:${d.score}%"></i></div></button><div class="dna-note" id="dnaNote${i}"><p>${d.note?.[lang]||''}</p></div></div>`).join('')}</div></section>`;
  }

  function toggleDna(i) {
    const items = _root ? [..._root.querySelectorAll('.dna-item')] : [];
    const wasOpen = openDnaIndex === i;
    items.forEach((el, n) => {
      const open = !wasOpen && n === i;
      el.classList.toggle('open', open);
      const t = el.querySelector('.dna-trigger');
      if (t) t.setAttribute('aria-expanded', String(open));
    });
    openDnaIndex = wasOpen ? -1 : i;
    if (!wasOpen) {
      const d = _ctx.dnaDimensions()[i];
      _ctx.track('dna_open', { name: d && d.label, score: d && d.score });
    }
  }

  function onClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest('[data-action="dna-toggle"]') : null;
    if (!btn) return;
    toggleDna(Number(btn.getAttribute('data-index')));
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

  const Module = { id: 'property-dna', render, mount, update, destroy, actions: {} };

  global.LarumModules = global.LarumModules || {};
  global.LarumModules[Module.id] = Module;
  if (typeof module !== 'undefined' && module.exports) module.exports = Module;
})(typeof window !== 'undefined' ? window : globalThis);
