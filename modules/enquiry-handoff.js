'use strict';

/* LPE-04 P0 module: enquiry-handoff.
   Owns the #enquiryOverlay subtree, form submission, lead storage, and mailto
   fallback. Analytics summary / Supabase are shared services (not modules). */

(function (global) {
  let _ctx = null;
  let _root = null;

  function render(ctx) {
    _ctx = ctx;
    const p = ctx.property;
    const lang = ctx.lang;
    return `<div id="enquiryOverlay" class="enquiry-overlay" aria-hidden="true"><button class="menu-close" data-action="enquiry-close">Close ×</button><div class="enquiry-box"><div class="mono">${lang==='en'?'Private enquiry':'Consulta privada'} · ${p.label}</div><h2>${lang==='en'?'Begin a private conversation.':'Inicia una conversación privada.'}</h2><p>${lang==='en'?'Tell the property advisor what matters to you. We will prepare the right next step.':'Cuéntale al asesor qué es importante para ti. Prepararemos el siguiente paso.'}</p>
<div class="enquiry-context" id="enquiryContext"></div>
<div id="advisorSummaryBox" class="advisor-summary-box"></div>
<form><input required name="name" placeholder="${lang==='en'?'Full name':'Nombre completo'}"/><input required type="email" name="email" placeholder="${lang==='en'?'Email address':'Email'}"/><select name="interest"><option>${lang==='en'?'What interests you most?':'¿Qué te interesa más?'}</option><option>${lang==='en'?'Living here':'Vivir aquí'}</option><option>${lang==='en'?'Privacy and retreat':'Privacidad y retiro'}</option><option>${lang==='en'?'Entertaining':'Reuniones'}</option><option>${lang==='en'?'Architecture and design':'Arquitectura y diseño'}</option><option>${lang==='en'?'Investment':'Inversión'}</option></select><textarea name="message" placeholder="${lang==='en'?'Anything you would like the advisor to know?':'¿Algo que quieras que el asesor sepa?'}"></textarea><button class="cta" type="submit">${lang==='en'?'Request private contact':'Solicitar contacto privado'} <b>↗</b></button></form><div id="enquirySuccess" class="enquiry-success" aria-live="polite"></div></div></div>`;
  }

  function open() {
    if (!_ctx.isVisible('enquiry-handoff')) return;
    const overlay = _root;
    if (!overlay) return;

    const contextText = LarumAnalytics.buildContextualEnquiry();
    const contextEl = _root.querySelector('#enquiryContext');
    if (contextEl) contextEl.textContent = contextText || (_ctx.entryPath() ? `Entry: ${_ctx.entryPath()}` : '');

    const summaryBox = _root.querySelector('#advisorSummaryBox');
    if (summaryBox && LarumAnalytics.isQualified()) {
      const summary = LarumAnalytics.buildAdvisorSummary();
      const c = _ctx.copy;
      const lang = _ctx.lang;
      let html = `<div class="summary-head">${c.advisorSummary}</div>`;
      html += `<p class="summary-intro">${c.summaryIntro}</p>`;
      if (summary.scenesExplored.length) {
        html += `<div class="summary-row"><span>${lang==='en'?'Scenes explored':'Escenas exploradas'}</span><strong>${summary.scenesExplored.join(' · ')}</strong></div>`;
      }
      if (summary.spacesExplored.length) {
        html += `<div class="summary-row"><span>${lang==='en'?'Spaces explored':'Espacios explorados'}</span><strong>${summary.spacesExplored.join(' · ')}</strong></div>`;
      }
      if (summary.detectedInterests.length) {
        html += `<div class="summary-row"><span>${lang==='en'?'Detected interests':'Intereses detectados'}</span><strong>${summary.detectedInterests.map(i=>i.interest.replace(/_/g,' ')).join(' · ')}</strong></div>`;
      }
      if (summary.conciergeQuestions.length) {
        html += `<div class="summary-row"><span>${lang==='en'?'Questions asked':'Preguntas realizadas'}</span><strong>${summary.conciergeQuestions.length}</strong></div>`;
      }
      if (summary.calculatorUsed) {
        html += `<div class="summary-row"><span>${lang==='en'?'Acquisition calculator':'Calculadora de adquisición'}</span><strong>${lang==='en'?'Yes':'Sí'}</strong></div>`;
      }
      if (summary.filmWatched) {
        html += `<div class="summary-row"><span>${lang==='en'?'Property film':'Film de la propiedad'}</span><strong>${lang==='en'?'Watched':'Visto'}</strong></div>`;
      }
      summaryBox.innerHTML = html;
      summaryBox.classList.add('visible');
    }

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function close() {
    const o = _root;
    if (!o) return;
    o.classList.remove('open');
    o.setAttribute('aria-hidden', 'true');
  }

  function submit(e) {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    const cfg = _ctx.contactConfig.properties[_ctx.slug] || {};
    const to = cfg.email || _ctx.contactConfig.defaultEmail;

    const summary = LarumAnalytics.buildAdvisorSummary();
    const subject = `Private enquiry — ${_ctx.property.label}`;
    const body = [
      `Property: ${_ctx.property.label}`,
      `Name: ${data.get('name')}`,
      `Email: ${data.get('email')}`,
      `Interest: ${data.get('interest')}`,
      `Message: ${data.get('message')||''}`,
      `Language: ${_ctx.lang}`,
      ``,
      `── V2 Advisor Summary ──`,
      `Entry path: ${summary.entryPath || 'direct'}`,
      `Scenes explored: ${summary.scenesExplored.join(', ') || 'none'}`,
      `Spaces explored: ${summary.spacesExplored.join(', ') || 'none'}`,
      `Detected interests: ${summary.detectedInterests.map(i=>i.interest).join(', ') || 'none'}`,
      `Questions asked: ${summary.totalQuestions}`,
      `Calculator used: ${summary.calculatorUsed ? 'Yes' : 'No'}`,
      `Film watched: ${summary.filmWatched ? 'Yes' : 'No'}`,
      `Qualified lead: ${summary.qualified ? 'Yes' : 'No'}`,
      `Duration: ${summary.durationMinutes} min`,
      summary.conciergeQuestions.length ? `Conversation: ${summary.conciergeQuestions.join(' | ')}` : ''
    ].filter(Boolean).join('\n');

    const stored = sendLeadToSupabase({
      property: _ctx.slug,
      lang: _ctx.lang,
      session_id: summary.sessionId || null,
      name: data.get('name'),
      email: data.get('email'),
      interest: data.get('interest'),
      message: data.get('message') || '',
      entry_path: summary.entryPath || null,
      scenes_explored: summary.scenesExplored,
      spaces_explored: summary.spacesExplored,
      detected_interests: summary.detectedInterests,
      qualified: summary.qualified,
      calculator_used: summary.calculatorUsed,
      film_watched: summary.filmWatched,
      duration_minutes: summary.durationMinutes,
      concierge_questions: summary.conciergeQuestions
    });

    if (_ctx.contactConfig.endpoint) {
      fetch(_ctx.contactConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property: _ctx.slug,
          lang: _ctx.lang,
          contact: { name: data.get('name'), email: data.get('email'), interest: data.get('interest'), message: data.get('message') },
          summary
        })
      }).then(r => {
        if (r.ok) showEnquirySuccess(data.get('name'));
        else fallbackMailto(to, subject, body, data.get('name'));
      }).catch(() => fallbackMailto(to, subject, body, data.get('name')));
    } else {
      stored.then(ok => {
        if (ok) showEnquirySuccess(data.get('name'));
        else fallbackMailto(to, subject, body, data.get('name'));
      });
    }

    LarumAnalytics.track('enquiry', { name: data.get('name'), email: data.get('email'), interest: data.get('interest') });
  }

  async function sendLeadToSupabase(leadData) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
    try {
      let { error } = await supabaseClient.from('leads').insert([leadData]);
      if (error && (error.code === 'PGRST204' || /session_id/.test(error.message || ''))) {
        const { session_id, ...withoutSession } = leadData;
        console.warn('[Larum] leads.session_id missing — storing the lead without it. Run docs/supabase-fix-rls.sql.');
        ({ error } = await supabaseClient.from('leads').insert([withoutSession]));
      }
      if (error) {
        console.error(
          '[Larum] Lead NOT stored — Supabase rejected it:', error.message,
          error.code === '42501'
            ? '\nRow-level security is blocking inserts. Run docs/supabase-fix-rls.sql in the Supabase SQL editor.'
            : ''
        );
        return false;
      }
      console.log('[Larum] Lead stored in Supabase');
      return true;
    } catch (e) {
      console.error('[Larum] Lead NOT stored — connection error:', e.message);
      return false;
    }
  }

  function fallbackMailto(to, subject, body, name) {
    if (to) window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showEnquirySuccess(name);
  }

  function showEnquirySuccess(name) {
    _root.querySelector('#enquirySuccess').textContent = _ctx.lang === 'en'
      ? `Thank you, ${name}. Your enquiry has been prepared for the property advisor with a full summary of your experience.`
      : `Gracias, ${name}. Tu consulta ha sido preparada para el asesor con un resumen completo de tu experiencia.`;
  }

  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('[data-action="enquiry-close"]') : null;
    if (!t) return;
    close();
  }

  function onSubmit(e) {
    submit(e);
  }

  function mount(root, ctx) {
    _ctx = ctx;
    _root = root;
    const form = root.querySelector('form');
    if (form) form.addEventListener('submit', onSubmit);
    root.addEventListener('click', onClick);
  }

  function update(ctx) {
    _ctx = ctx;
    return false;
  }

  function destroy() {
    if (_root) {
      _root.removeEventListener('click', onClick);
      const form = _root.querySelector('form');
      if (form) form.removeEventListener('submit', onSubmit);
    }
    _root = null;
  }

  const Module = { id: 'enquiry-handoff', render, mount, update, destroy, actions: { open, close, submit } };

  global.LarumModules = global.LarumModules || {};
  global.LarumModules[Module.id] = Module;
  if (typeof module !== 'undefined' && module.exports) module.exports = Module;
})(typeof window !== 'undefined' ? window : globalThis);
