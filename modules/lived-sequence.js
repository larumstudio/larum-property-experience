'use strict';

/* LPE-04 P0 module: lived-sequence.
   Owns the #sequence subtree: sequence dots, scene links, film trigger.
   Cross-module: opens spaces via ctx.openSpace, film via ctx.openFilm,
   fallback navigation via ctx.navigate. */

(function (global) {
  let _ctx = null;
  let _root = null;

  function render(ctx) {
    _ctx = ctx;
    const p = ctx.property;
    const lang = ctx.lang;
    const seqs = ctx.activeSequences();
    const scenes = ctx.activeScenes();
    return `<section id="sequence" class="living-sequence"><div class="sequence-head"><div><div class="mono">03 · ${lang==='en'?'A day here':'Un día aquí'}</div><h2>${ctx.pc('sequenceTitle')}</h2></div><p>${ctx.pc('sequenceIntro')}</p></div><div class="sequence-stage" id="sequenceStage" style="background-image:linear-gradient(90deg,rgba(12,13,11,.62),rgba(12,13,11,.08)),url('${p.band}')"><div class="sequence-copy"><div class="mono" id="sequenceTime">${seqs[0][1]}</div><h3 id="sequenceTitle">${seqs[0][0]}</h3><p id="sequenceText">${seqs[0][2]}</p></div><div class="sequence-controls">${seqs.map((s,i)=>`<button class="sequence-dot ${i===0?'active':''}" data-action="seq-select" data-index="${i}"><span>0${i+1}</span><b>${s[0]}</b></button>`).join('')}</div></div><div class="scene-links" id="sceneLinks">${scenes[0][1].map((space,i)=>`<button class="scene-link" data-action="scene-link" data-space="${space}"><span>0${i+1}</span>${space}<b>↗</b></button>`).join('')}</div><button class="film-trigger" data-action="film-trigger">${ctx.pc('filmLabel')} <b>▷</b></button></section>`;
  }

  function selectSequence(i) {
    const s = _ctx.activeSequences()[i];
    if (!s) return;
    if (!_ctx.visited.includes(s[0])) _ctx.visited.push(s[0]);
    _ctx.track('scene_open', { name: s[0] });
    const stage = _root.querySelector('#sequenceStage');
    _root.querySelector('#sequenceTime').textContent = s[1];
    _root.querySelector('#sequenceTitle').textContent = s[0];
    _root.querySelector('#sequenceText').textContent = s[2];
    _root.querySelectorAll('.sequence-dot').forEach((el, n) => el.classList.toggle('active', n === i));
    _root.querySelector('#sceneLinks').innerHTML = _ctx.activeScenes()[i][1].map((space, n) => `<button class="scene-link" data-action="scene-link" data-space="${space}"><span>0${n+1}</span>${space}<b>↗</b></button>`).join('');
    stage.classList.remove('sequence-change'); void stage.offsetWidth; stage.classList.add('sequence-change');
  }

  function navigateToScene(sceneName) {
    const seqs = _ctx.activeSequences();
    const idx = seqs.findIndex(s => s[0] === sceneName);
    if (idx >= 0) {
      _ctx.navigate('sequence');
      setTimeout(() => selectSequence(idx), 600);
    }
  }

  function triggerFilm() {
    if (_ctx.activeAssets().propertyFilm) _ctx.openFilm();
    else _ctx.navigate('concierge');
  }

  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!t) return;
    const a = t.getAttribute('data-action');
    if (a === 'seq-select') selectSequence(Number(t.getAttribute('data-index')));
    else if (a === 'scene-link') _ctx.openSpace(t.getAttribute('data-space'));
    else if (a === 'film-trigger') triggerFilm();
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

  const Module = {
    id: 'lived-sequence', render, mount, update, destroy,
    actions: { select: selectSequence, navigateToScene: navigateToScene }
  };

  global.LarumModules = global.LarumModules || {};
  global.LarumModules[Module.id] = Module;
  if (typeof module !== 'undefined' && module.exports) module.exports = Module;
})(typeof window !== 'undefined' ? window : globalThis);
