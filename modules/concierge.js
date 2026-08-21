'use strict';

/* LPE-04 P0 module: concierge.
   Owns the #concierge subtree, chat, grounded LLM/keyword response engine,
   qualification, and status display. conciergeHistory/conciergeEndpointDown
   are concierge-private state (reset per render / per session respectively). */

(function (global) {
  let _ctx = null;
  let _root = null;
  let conciergeHistory = [];
  let conciergeEndpointDown = false;

  /* M6.8: same bilingual-content resolver as app.js's t() — local copy,
     no cross-file import between these classic IIFE modules. */
  function t(v, lang) { return v == null ? '' : typeof v === 'string' ? v : (v[lang] || v.en || v.es || ''); }

  function render(ctx) {
    _ctx = ctx;
    conciergeHistory = [];
    const p = ctx.property;
    const lang = ctx.lang;
    const c = ctx.copy;
    return `<section id="concierge" class="concierge"><div><div class="advisor"><div class="advisor-avatar">A</div><div><div class="mono">${lang==='en'?'Property Concierge':'Concierge de la propiedad'}</div><div style="font-size:12px;margin-top:5px">${lang==='en'?'Private advisor':'Asesor privado'} · ${p.label}</div></div></div><h2>${c.concierge}</h2><p style="font-size:13px;line-height:1.7;max-width:420px">${c.conciergeSub}</p>
<div class="concierge-status" id="conciergeStatus"></div>
<button class="cta" style="color:var(--ink);border-color:var(--ink)" data-action="concierge-focus">${c.explore} <b>↘</b></button></div>
<div class="chat"><div class="messages" id="chatMessages"><div class="bubble">${t(p.conciergeIntro,lang)}</div></div><form class="chat-form"><input id="chatInput" placeholder="${c.placeholder}"/><button>${c.send} ↗</button></form></div></section>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function detectInterestSignals(text) {
    const pack = _ctx.knowledge();
    if (!pack || !pack.interestSignals) return {};
    const lower = text.toLowerCase();
    const detected = {};
    for (const [interest, keywords] of Object.entries(pack.interestSignals)) {
      const match = keywords.some(k => lower.includes(k));
      if (match) detected[interest] = 1;
    }
    return detected;
  }

  function buildConciergeResponse(question) {
    const lower = question.toLowerCase();
    const pack = _ctx.knowledge();
    if (!pack) return { text: '', sceneLinks: [], spaceLinks: [], docLinks: [], intentId: null, confidence: 'unknown' };

    const hit = pack.intents.find(item => item.keywords.some(k => lower.includes(k)));

    if (hit) {
      return {
        text: hit[_ctx.lang],
        sceneLinks: hit.sceneLinks || [],
        spaceLinks: hit.spaceLinks || [],
        docLinks: hit.docLinks || [],
        intentId: hit.id,
        confidence: hit.confidence || 'confirmed',
        followUp: hit.followUp ? hit.followUp[_ctx.lang] : null
      };
    }

    return {
      text: pack.fallback[_ctx.lang],
      sceneLinks: [],
      spaceLinks: [],
      docLinks: [],
      intentId: null,
      confidence: 'fallback',
      followUp: null
    };
  }

  function checkQualification() {
    const pack = _ctx.knowledge();
    if (!pack || !pack.qualification) return null;
    const trig = _ctx.qualification;
    for (const q of pack.qualification) {
      if (LarumAnalytics.shouldQualify(q.trigger) && !trig[q.trigger]) {
        trig[q.trigger] = true;
        return q[_ctx.lang];
      }
    }
    return null;
  }

  async function askConcierge(question) {
    if (conciergeEndpointDown) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property: _ctx.slug, lang: _ctx.lang, question,
          history: conciergeHistory,
          sessionId: (typeof LarumAnalytics !== 'undefined' && LarumAnalytics.getSessionId()) || null
        }),
        signal: controller.signal
      });
      if (r.status === 404 || r.status === 501 || r.status === 503 || r.status === 429) { conciergeEndpointDown = true; return null; }
      if (!r.ok) return null;
      const d = await r.json();
      if (d.error || !d.answer) return null;

      const pack = _ctx.knowledge();
      const validSpaces = new Set(Object.keys(pack?.property?.spaces || {}));
      const validScenes = new Set(_ctx.activeSequences().map(s => s[0]));

      return {
        text: escapeHtml(d.answer),
        confidence: d.confidence === 'confirmed' ? 'confirmed' : 'requires-advisor',
        sceneLinks: (d.scenes || []).filter(s => validScenes.has(s)),
        spaceLinks: (d.spaces || []).filter(s => validSpaces.has(s)),
        docLinks: (d.documents || []).map(x => x === 'calculator' ? 'calculator' : 'documents'),
        followUp: d.followUp ? escapeHtml(d.followUp) : null,
        interests: d.interests || [],
        intentId: 'llm',
        source: 'llm'
      };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  function showConciergeThinking(box) {
    const el = document.createElement('div');
    el.className = 'bubble thinking';
    el.innerHTML = '<i></i><i></i><i></i>';
    box.appendChild(el);
    box.parentElement.scrollTop = box.parentElement.scrollHeight;
    return el;
  }

  function updateStatus() {
    const el = _root.querySelector('#conciergeStatus');
    if (!el) return;
    const top = LarumAnalytics.getTopInterests(3);
    const questions = LarumAnalytics.state.questionCount;
    if (top.length === 0 && questions === 0) {
      el.innerHTML = '';
      return;
    }
    const lang = _ctx.lang;
    const interestLabels = {
      privacy: lang==='en'?'Privacy':'Privacidad',
      family: lang==='en'?'Family':'Familia',
      architecture: lang==='en'?'Architecture':'Arquitectura',
      city_life: lang==='en'?'City life':'Vida urbana',
      investment: lang==='en'?'Investment':'Inversión',
      technology: lang==='en'?'Technology':'Tecnología',
      outdoor_living: lang==='en'?'Outdoor life':'Vida exterior',
      entertaining: lang==='en'?'Entertaining':'Reuniones',
      wellness: lang==='en'?'Wellness':'Bienestar'
    };
    let html = '<div class="concierge-interests">';
    html += `<div class="concierge-interest-label">${lang==='en'?'Detected interests':'Intereses detectados'}</div>`;
    html += top.map(([k, v]) => `<span class="interest-tag">${interestLabels[k] || k}</span>`).join('');
    html += '</div>';
    el.innerHTML = html;
  }

  async function chat(e) {
    if (e) e.preventDefault();
    const input = _root.querySelector('#chatInput');
    const v = input.value.trim();
    if (!v) return;
    const safe = v.replace(/</g, '&lt;');

    const box = _root.querySelector('#chatMessages');
    box.insertAdjacentHTML('beforeend', `<div class="bubble user">${safe}</div>`);
    input.value = '';
    const thinking = showConciergeThinking(box);

    let response = null;
    try { response = await askConcierge(v); } catch (_) { response = null; }
    if (!response) response = buildConciergeResponse(v);

    thinking.remove();

    const interests = response.interests?.length
      ? Object.fromEntries(response.interests.map(i => [i, 1]))
      : detectInterestSignals(v);

    conciergeHistory.push({ role: 'user', content: v }, { role: 'assistant', content: response.text });
    if (conciergeHistory.length > 8) conciergeHistory = conciergeHistory.slice(-8);

    LarumAnalytics.track('concierge_question', { question: v, intentId: response.intentId, interests });

    const lang = _ctx.lang;
    let responseHtml = `<div class="bubble">${response.text}`;

    if (response.confidence === 'requires-advisor') {
      responseHtml += `<div class="confidence-note">${lang==='en'?'⚡ Best confirmed by the advisor':'⚡ Mejor confirmado por el asesor'}</div>`;
    }

    if (response.sceneLinks.length) {
      responseHtml += `<div class="response-links"><span class="response-link-label">${lang==='en'?'Explore':'Explora'}:</span>`;
      responseHtml += response.sceneLinks.map(s => `<button class="response-link" data-action="link-scene" data-value="${s}">${s}</button>`).join('');
      responseHtml += `</div>`;
    }

    if (response.spaceLinks.length) {
      responseHtml += `<div class="response-links">`;
      responseHtml += response.spaceLinks.map(s => `<button class="response-link" data-action="link-space" data-value="${s}">${s} ↗</button>`).join('');
      responseHtml += `</div>`;
    }

    if (response.docLinks.length) {
      responseHtml += `<div class="response-links">`;
      responseHtml += response.docLinks.map(d => {
        if (d === 'calculator') return `<button class="response-link" data-action="link-doc" data-value="calculator">${lang==='en'?'Acquisition calculator':'Calculadora de adquisición'} ↗</button>`;
        if (d === 'documents') return `<button class="response-link" data-action="link-doc" data-value="documents">${lang==='en'?'Documents':'Documentos'} ↗</button>`;
        return '';
      }).join('');
      responseHtml += `</div>`;
    }

    if (response.followUp) {
      responseHtml += `<div class="follow-up">${response.followUp}</div>`;
    }

    responseHtml += `</div>`;

    box.insertAdjacentHTML('beforeend', responseHtml);
    box.parentElement.scrollTop = box.parentElement.scrollHeight;

    const qualMsg = checkQualification();
    if (qualMsg) {
      setTimeout(() => {
        box.insertAdjacentHTML('beforeend', `<div class="bubble qualification">${qualMsg}</div>`);
        box.parentElement.scrollTop = box.parentElement.scrollHeight;
      }, 1200);
    }

    updateStatus();
  }

  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!t) return;
    const a = t.getAttribute('data-action');
    if (a === 'concierge-focus') {
      const inp = _root.querySelector('#chatInput');
      if (inp) inp.focus();
    } else if (a === 'link-scene') {
      const name = t.getAttribute('data-value');
      const seqs = _ctx.activeSequences();
      const idx = seqs.findIndex(s => s[0] === name);
      if (idx >= 0) {
        _ctx.navigate('sequence');
        setTimeout(() => _ctx.selectSequence(idx), 600);
      }
    } else if (a === 'link-space') {
      _ctx.openSpace(t.getAttribute('data-value'));
    } else if (a === 'link-doc') {
      const v = t.getAttribute('data-value');
      _ctx.navigate(v === 'calculator' ? 'calculator' : 'documents');
    }
  }

  function onSubmit(e) {
    chat(e);
  }

  function mount(root, ctx) {
    _ctx = ctx;
    _root = root;
    const form = root.querySelector('.chat-form');
    if (form) form.addEventListener('submit', onSubmit);
    root.addEventListener('click', onClick);
    updateStatus();
  }

  function update(ctx) {
    _ctx = ctx;
    return false;
  }

  function destroy() {
    if (_root) {
      _root.removeEventListener('click', onClick);
      const form = _root.querySelector('.chat-form');
      if (form) form.removeEventListener('submit', onSubmit);
    }
    _root = null;
  }

  const Module = { id: 'concierge', render, mount, update, destroy, actions: {} };

  global.LarumModules = global.LarumModules || {};
  global.LarumModules[Module.id] = Module;
  if (typeof module !== 'undefined' && module.exports) module.exports = Module;
})(typeof window !== 'undefined' ? window : globalThis);
