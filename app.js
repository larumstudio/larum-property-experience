/* ── Larum Property Experience™ V2 — Intelligent Property Experience ── */
/* All V2 features: advanced concierge, analytics, interest detection, advisor summary, scene-linked responses */

/* Every per-property value lives in properties/{slug}/ and arrives through
   LarumLoader. Nothing about a specific residence is hardcoded here. */
let properties={};
let current=null; let lang='en'; let visited=[]; let entryPath='';
/* M6.7c: anti-spam. Page-load timestamp for the minimum-time-to-submit
   heuristic in submitEnquiry() — a real visitor takes at least a few
   seconds to read the form and type into it; a submission arriving
   faster than that is almost certainly scripted. Client-side only, by
   design: leads are inserted directly by the browser (no serverless
   function sits between this form and Supabase), so there is no
   server-side point in this flow to enforce it from instead — this
   deters the ordinary unsophisticated bots that are the realistic
   threat here, not a targeted attacker willing to call the REST API
   directly. */
const APP_LOAD_TS=Date.now();
let contentModel=null; let knowledgeModel=null; let assetsModel=null; let purchaseConfig=null;
/* LPE-08: monotonic token for last-wins on rapid property switches. */
let _switchToken=0;
let contactConfig={defaultEmail:'contacto@larumstudio.com',properties:{},mode:'mailto',endpoint:null};

/* ── V2: Qualification state ── */
let qualificationStep=0;
let qualificationTriggered={after_3:false,interest_detected:false,high_intent:false};

function model(key){return contentModel&&contentModel[current]&&contentModel[current][key]||null}
function activeSequences(){return model('sequences')||[]}
function activeScenes(){return model('sceneSpaces')||[]}
function activeSpatial(){return model('spatial')||[]}
function activeAssets(){return (assetsModel&&assetsModel[current])||{}}

/* Bilingual per-property copy: content.copy.{key}.{lang} */
function pc(key){const c=model('copy');return (c&&c[key]&&c[key][lang])||''}

/* DNA dimensions and Setting cards are authored as objects. Legacy tuples
   still load, so an older property pack does not break. */
function dnaDimensions(){
  return (model('dna')?.dimensions||[]).map(d=>
    Array.isArray(d) ? {label:d[0],score:String(d[1]),note:d[2]||null}
                     : {label:d.label,score:String(d.score),note:d.note||null});
}
function settingCards(){
  return (model('setting')?.cards||[]).map(c=>
    Array.isArray(c) ? {title:c[0],line:c[1],source:null}
                     : {title:c.title,line:c.line,source:c.source||null});
}

/* ── Property DNA: each score opens the line that justifies it ── */

let openDnaIndex=-1;
function toggleDna(i){
  const items=[...document.querySelectorAll('.dna-item')];
  const wasOpen=openDnaIndex===i;
  items.forEach((el,n)=>{
    const open=!wasOpen&&n===i;
    el.classList.toggle('open',open);
    el.querySelector('.dna-trigger')?.setAttribute('aria-expanded',String(open));
  });
  openDnaIndex=wasOpen?-1:i;
  if(!wasOpen){
    const d=dnaDimensions()[i];
    LarumAnalytics.track('dna_open',{name:d?.label,score:d?.score});
  }
}

/* ── The Setting: each card opens what the knowledge base actually knows ── */

let openSettingIndex=-1;
function openSetting(i){
  const box=document.getElementById('settingDetail');
  const cards=[...document.querySelectorAll('.setting-card')];
  if(openSettingIndex===i){
    box.classList.remove('open');box.innerHTML='';
    cards.forEach(c=>c.classList.remove('active'));
    openSettingIndex=-1;
    return;
  }
  const card=settingCards()[i];
  cards.forEach((c,n)=>c.classList.toggle('active',n===i));
  box.innerHTML=buildSettingDetail(card);
  box.classList.add('open');
  openSettingIndex=i;
  LarumAnalytics.track('setting_open',{name:card?.title,source:card?.source});
}

function buildSettingDetail(card){
  const es=lang==='es';
  const pack=knowledgeModel&&knowledgeModel[current];
  const s=pack?.surroundings||{};
  const head=`<div class="detail-head"><div class="mono">${card.title}</div><button class="detail-close" onclick="openSetting(${openSettingIndexOf(card)})">${es?'Cerrar':'Close'} ×</button></div>`;

  if(card.source==='distances')   return head+buildDistances(s.distances,s.transport);
  if(card.source==='verification')return head+buildVerification(s.distances);

  const block=s[card.source];
  if(!block)return head+`<p class="detail-text">${card.line}</p>`;
  return head+`<p class="detail-text">${blockText(block)}</p>`+neighbourhoodLine(s.neighborhood)+statusBadge(block.status);
}

function openSettingIndexOf(card){
  return settingCards().findIndex(c=>c.title===card.title);
}

/* Distances read as a quiet readout, not a map pin. Anything the agency has
   not confirmed says so, in the same breath as the number. */
function buildDistances(distances,transport){
  const es=lang==='es';
  if(!Array.isArray(distances)||!distances.length)return `<p class="detail-text">${es?'Distancias pendientes de confirmar.':'Distances pending confirmation.'}</p>`;
  const rows=distances.map(d=>`<div class="distance-row"><span>${d.place}</span><i></i><strong>${d.distance}</strong>${d.status!=='confirmed'?`<em title="${es?'Pendiente de confirmar por el asesor':'To be confirmed by the advisor'}">${es?'por confirmar':'to confirm'}</em>`:''}</div>`).join('');
  const t=transport?`<p class="detail-text detail-secondary">${blockText(transport)}</p>`:'';
  return `<div class="distance-list">${rows}</div>${t}`;
}

function buildVerification(distances){
  const es=lang==='es';
  const pack=knowledgeModel&&knowledgeModel[current];
  const facts=pack?.property?.facts||{};
  const unconfirmed=Object.entries(facts).filter(([,v])=>v.status!=='confirmed').map(([k])=>k);
  const confirmed=Object.entries(facts).filter(([,v])=>v.status==='confirmed').length;
  const total=Object.keys(facts).length;
  const pendingDistances=(distances||[]).filter(d=>d.status!=='confirmed').length;
  return `<p class="detail-text">${es
      ? 'Esta experiencia distingue lo confirmado de lo que aún no lo está. Nada se presenta como verificado sin serlo.'
      : 'This experience separates what is confirmed from what is not. Nothing is presented as verified unless it is.'}</p>
    <div class="verify-grid">
      <div><strong>${confirmed}/${total}</strong><span>${es?'datos confirmados por la agencia':'facts confirmed by the agency'}</span></div>
      <div><strong>${pendingDistances}</strong><span>${es?'distancias por confirmar':'distances to confirm'}</span></div>
    </div>
    ${unconfirmed.length?`<p class="detail-text detail-secondary">${es?'Pendiente':'Pending'}: ${unconfirmed.join(' · ')}</p>`:''}`;
}

/* surroundings blocks come in several shapes; read whichever applies. */
function blockText(block){
  if(!block)return '';
  if(typeof block==='string')return block;
  if(block[lang])return block[lang];
  if(block.note)return block.note;
  if(block.en)return block.en;
  const parts=Object.values(block).filter(v=>v&&typeof v==='object'&&(v[lang]||v.en)).map(v=>v[lang]||v.en);
  return parts.join(' ');
}

function neighbourhoodLine(n){
  if(!n||!n.name)return '';
  return `<p class="detail-text detail-secondary">${n.name}${n.character?' — '+n.character:''}</p>`;
}

function statusBadge(status){
  if(!status||status==='confirmed')return '';
  const es=lang==='es';
  return `<div class="detail-status">${es?'Pendiente de confirmación por el asesor':'To be confirmed by the property advisor'}</div>`;
}
const copy={en:{menu:'Menu',enquire:'Enquire',scroll:'Scroll to discover',know:'Enter the experience',identity:'A property with a point of view',explore:'Explore the way it lives',concierge:'Ask the property',conciergeSub:'A quiet conversation about the residence, its spaces and the world around it.',send:'Send',placeholder:'Ask a question…',private:'Private prototype · not for publication',advisorSummary:'Your private summary',summaryIntro:'Based on what you have explored, here is what the property advisor will receive:'},es:{menu:'Menú',enquire:'Consultar',scroll:'Desliza para descubrir',know:'Entrar en la experiencia',identity:'Una propiedad con un punto de vista',explore:'Descubre cómo se vive',concierge:'Pregunta a la propiedad',conciergeSub:'Una conversación privada sobre la residencia, sus espacios y el mundo que la rodea.',send:'Enviar',placeholder:'Haz una pregunta…',private:'Prototipo privado · no publicar',advisorSummary:'Tu resumen privado',summaryIntro:'Basándose en lo que has explorado, esto es lo que recibirá el asesor:'}};

/* ════════════════════════════════════════════════════════════════════
   V2: ADVANCED CONCIERGE ENGINE
   ════════════════════════════════════════════════════════════════════ */

function detectInterestSignals(text) {
  const pack = knowledgeModel && knowledgeModel[current];
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
  const pack = knowledgeModel && knowledgeModel[current];
  if (!pack) return { text: '', sceneLinks: [], spaceLinks: [], docLinks: [], intentId: null, confidence: 'unknown' };

  /* Find matching intent */
  const hit = pack.intents.find(item => item.keywords.some(k => lower.includes(k)));

  if (hit) {
    return {
      text: hit[lang],
      sceneLinks: hit.sceneLinks || [],
      spaceLinks: hit.spaceLinks || [],
      docLinks: hit.docLinks || [],
      intentId: hit.id,
      confidence: hit.confidence || 'confirmed',
      followUp: hit.followUp ? hit.followUp[lang] : null
    };
  }

  /* No intent match — use fallback */
  return {
    text: pack.fallback[lang],
    sceneLinks: [],
    spaceLinks: [],
    docLinks: [],
    intentId: null,
    confidence: 'fallback',
    followUp: null
  };
}

function checkQualification() {
  const pack = knowledgeModel && knowledgeModel[current];
  if (!pack || !pack.qualification) return null;

  for (const q of pack.qualification) {
    if (LarumAnalytics.shouldQualify(q.trigger) && !qualificationTriggered[q.trigger]) {
      qualificationTriggered[q.trigger] = true;
      return q[lang];
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════
   V2: RENDER — full page
   ════════════════════════════════════════════════════════════════════ */


/* ── LPE-02: manifest composition (order + visibility only) ── */

function currentManifest(){
  try{
    if(typeof LarumLoader!=='undefined'&&LarumLoader.getManifest){
      const m=LarumLoader.getManifest(current);
      if(m&&typeof LarumDomainAdapters!=='undefined'&&LarumDomainAdapters.validateManifest){
        const v=LarumDomainAdapters.validateManifest(m);
        if(v.valid)return m;
      }else if(m)return m;
    }
  }catch(e){}
  if(typeof LarumModuleRegistry!=='undefined')return LarumModuleRegistry.legacyManifest();
  return {modules:[]};
}
function isModuleVisible(id){
  if(typeof LarumModuleRegistry!=='undefined')return LarumModuleRegistry.moduleVisible(currentManifest(),id);
  return true;
}
/* LPE-03: no composePlan here — the shell owns plan → mainHtml. Rail ids still
   come from the registry; the only local fallback is the two pinned frames. */
function railChapterIds(){
  if(typeof LarumModuleRegistry!=='undefined')return LarumModuleRegistry.railChapterIds(currentManifest());
  return ['hero','identity'];
}

function htmlHero(p,c){
  return `<section id="hero" class="hero">${p.heroVideo?`<video class="hero-video" autoplay muted loop playsinline poster="${p.image}"><source src="${p.heroVideo}" type="video/mp4"></video>`:''}<div class="hero-image" style="background-image:url('${p.image}')"></div><div class="hero-copy"><div class="eyebrow">${p.label} · ${p.brand}</div><h1>${p.title.replace('\n','<br>')}</h1><p>${p.subtitle}</p><div class="hero-proof"><span>04 chapters</span><span>Spatial narrative</span><span>Private concierge</span></div><div class="path-picker"><div class="mono">${lang==='en'?'Choose your way in':'Elige tu camino'}</div><button onclick="choosePath('live')"><b>01</b>${lang==='en'?'Live the day':'Vivir el día'} <span>↘</span></button><button onclick="choosePath('space')"><b>02</b>${lang==='en'?'Understand the space':'Entender el espacio'} <span>↘</span></button><button onclick="choosePath('private')"><b>03</b>${lang==='en'?'Speak privately':'Hablar en privado'} <span>↘</span></button></div><button class="cta" onclick="startArrival()">${c.know}<b>↘</b></button></div><div class="scroll">${c.scroll} ↓</div></section>`;
}
function htmlIdentity(p,c){
  return `<section id="identity" class="section light identity"><div class="grid"><div><div class="mono">01 · ${lang==='en'?'Identity':'Identidad'}</div><h2>${c.identity}</h2></div><div><p class="statement">${p.intro}</p><p>${pc('identityNote')}</p></div></div></section>`;
}
function htmlPropertyDna(p,c){
  return `<section class="dna-section"><div class="dna-head"><div><div class="mono">02 · ${lang==='en'?'Property DNA':'ADN de la propiedad'}</div><h2>${p.dna?.title||p.title.replace('\n',' ')}</h2></div><p>${p.dna?.intro||p.intro}</p></div><div class="dna-grid">${dnaDimensions().map((d,i)=>`<div class="dna-item"><button class="dna-trigger" onclick="toggleDna(${i})" aria-expanded="false" aria-controls="dnaNote${i}"><div class="dna-top"><span>0${i+1}</span><b>${d.label}</b><strong>${d.score}</strong></div><div class="dna-bar"><i style="width:${d.score}%"></i></div></button><div class="dna-note" id="dnaNote${i}"><p>${d.note?.[lang]||''}</p></div></div>`).join('')}</div></section>`;
}
function htmlImageBand(p,c){
  return `<div class="image-band" style="background-image:url('${p.band}')"><div class="image-label">02 · ${pc('bandLabel')}</div></div>`;
}
function htmlLivedSequence(p,c){
  return `<section id="sequence" class="living-sequence"><div class="sequence-head"><div><div class="mono">03 · ${lang==='en'?'A day here':'Un día aquí'}</div><h2>${pc('sequenceTitle')}</h2></div><p>${pc('sequenceIntro')}</p></div><div class="sequence-stage" id="sequenceStage" style="background-image:linear-gradient(90deg,rgba(12,13,11,.62),rgba(12,13,11,.08)),url('${p.band}')"><div class="sequence-copy"><div class="mono" id="sequenceTime">${activeSequences()[0][1]}</div><h3 id="sequenceTitle">${activeSequences()[0][0]}</h3><p id="sequenceText">${activeSequences()[0][2]}</p></div><div class="sequence-controls">${activeSequences().map((s,i)=>`<button class="sequence-dot ${i===0?'active':''}" onclick="selectSequence(${i})"><span>0${i+1}</span><b>${s[0]}</b></button>`).join('')}</div></div><div class="scene-links" id="sceneLinks">${activeScenes()[0][1].map((space,i)=>`<button class="scene-link" onclick="openSpace('${space}')"><span>0${i+1}</span>${space}<b>↗</b></button>`).join('')}</div><button class="film-trigger" onclick="handleFilmTrigger()">${pc('filmLabel')} <b>▷</b></button></section>`;
}
function htmlExplore(p,c){
  return `<section id="explore" class="section dark"><div class="mono">04 · ${c.explore}</div><div class="experiences">${p.experiences.map(e=>`<article class="experience"><div class="number">${e[0]}</div><h3>${e[1]}</h3><p>${e[2]}</p></article>`).join('')}</div></section>`;
}
function htmlSpatial(p,c){
  return `<section id="spatial" class="spatial"><div class="spatial-head"><div><div class="mono">05 · ${lang==='en'?'Spatial intelligence':'Inteligencia espacial'}</div><h2>${pc('spatialTitle')}</h2></div><p>${pc('spatialIntro')}</p></div><div class="spatial-map"><div class="map-lines"></div>${activeSpatial().map((m,i)=>`<button class="map-node ${i===0?'active':''}" onclick="selectMapSpace(${i})"><span>${m[0]}</span><strong>${m[1]}</strong><small>${m[2]}</small></button>`).join('')}</div><div class="spatial-detail" id="spatialDetail">${pc('spatialDetail')}</div></section>`;
}
function htmlDetails(p,c){
  return `<section id="details" class="section light"><div class="grid"><div><div class="mono">06 · ${lang==='en'?'Verified details':'Datos verificados'}</div><h2>${pc('detailsTitle')}</h2></div><div><p>${pc('detailsIntro')}</p><div class="facts">${p.facts.map(f=>`<div class="fact"><strong>${f[0]}</strong><span>${f[1]}</span></div>`).join('')}</div></div></div></section>`;
}
function htmlSetting(p,c){
  return `<section id="setting" class="setting"><div class="setting-head"><div><div class="mono">07 · ${lang==='en'?'The setting':'El entorno'}</div><h2>${p.setting?.title||(lang==='en'?'The world around the property.':'El mundo alrededor de la propiedad.')}</h2></div><p>${p.setting?.intro||''}</p></div><div class="setting-grid">${settingCards().map((card,i)=>`<button class="setting-card ${card.source==='verification'?'verification':''}" onclick="openSetting(${i})"><span>0${i+1}</span><strong>${card.title}</strong><p>${card.line}</p><em class="setting-more">${lang==='en'?'Open':'Abrir'} <b>↗</b></em></button>`).join('')}</div><div class="setting-detail" id="settingDetail" aria-live="polite"></div></section>`;
}
function htmlDocuments(p,c){
  return `<section id="documents" class="documents"><div class="documents-head"><div><div class="mono">07 · ${lang==='en'?'Private documents':'Documentos privados'}</div><h2>${lang==='en'?'The information<br>behind the feeling.':'La información<br>detrás del sentimiento.'}</h2></div><p>${lang==='en'?'When you are ready to go deeper, access the documents that make the residence real: certification, plans and brochure.':'Cuando estés listo para profundizar, accede a los documentos que hacen real la residencia: certificación, planos y brochure.'}</p></div><div class="document-grid"><button class="document-card" onclick="openDocument('Energy performance certificate')"><span>01</span><strong>${lang==='en'?'Energy certificate':'Certificado energético'}</strong><small>${lang==='en'?'Available on request · PDF':'Disponible bajo solicitud · PDF'}</small><b>↗</b></button><button class="document-card" onclick="openDocument('Floor plans')"><span>02</span><strong>${lang==='en'?'Floor plans':'Planos'}</strong><small>${lang==='en'?'Available on request · PDF':'Disponible bajo solicitud · PDF'}</small><b>↗</b></button><button class="document-card" onclick="openDocument('Property brochure')"><span>03</span><strong>${lang==='en'?'Property brochure':'Brochure'}</strong><small>${lang==='en'?'Available on request · PDF':'Disponible bajo solicitud · PDF'}</small><b>↗</b></button></div></section>`;
}
function htmlCalculator(p,c){
  return `<section id="calculator" class="calculator"><div class="calculator-head"><div><div class="mono">08 · ${lang==='en'?'Acquisition envelope':'Envolvente de adquisición'}</div><h2>${lang==='en'?'What does<br>acquiring it involve?':'¿Qué implica<br>adquirirla?'}</h2></div><p>${lang==='en'?'Estimate the total acquisition envelope by adapting the calculation to the autonomous community and type of property.':'Estima la envolvente total de adquisición adaptando el cálculo a la comunidad autónoma y tipo de propiedad.'}</p></div><div class="calculator-grid"><div class="calculator-form"><label>${lang==='en'?'Purchase price':'Precio de compra'} <input id="calcPrice" type="number" value="${p.referencePrice||0}" oninput="calculatePurchase()"></label><label>${lang==='en'?'Autonomous community':'Comunidad autónoma'} <select id="calcRegion" onchange="applyRegionRates()">${regionOptions()}</select></label><label>${lang==='en'?'Property type':'Tipo de propiedad'} <select id="calcType" onchange="calculatePurchase()"><option value="resale"${(model('defaultPropertyType')||'resale')==='resale'?' selected':''}>${lang==='en'?'Resale property':'Segunda mano'}</option><option value="new"${model('defaultPropertyType')==='new'?' selected':''}>${lang==='en'?'New build':'Obra nueva'}</option></select></label><div class="rate-row"><label id="itpLabel">ITP % <input id="calcItp" type="number" value="${rate('itp')}" step="0.1" oninput="calculatePurchase()"></label><label id="vatLabel" class="hidden">VAT % <input id="calcVat" type="number" value="${rate('vat')}" step="0.1" oninput="calculatePurchase()"></label><label id="ajdLabel">AJD % <input id="calcAjd" type="number" value="${rate('ajd')}" step="0.1" oninput="calculatePurchase()"></label></div><div class="rate-row"><label>${lang==='en'?'Notary %':'Notaría %'} <input id="calcNotary" type="number" value="${rate('notary')}" step="0.1" oninput="calculatePurchase()"></label><label>${lang==='en'?'Registry %':'Registro %'} <input id="calcRegistry" type="number" value="${rate('registry')}" step="0.1" oninput="calculatePurchase()"></label></div><div class="rate-row"><label>${lang==='en'?'Legal/advisor %':'Legal/asesor %'} <input id="calcLegal" type="number" value="${rate('legal')}" step="0.1" oninput="calculatePurchase()"></label><label>${lang==='en'?'Other %':'Otros %'} <input id="calcOther" type="number" value="${rate('other')}" step="0.1" oninput="calculatePurchase()"></label></div><small class="calculator-note">${lang==='en'?'Planning estimate only. Rates may depend on brackets, buyer profile, property use and current regional rules. Confirm with a Spanish tax advisor.':'Solo estimación orientativa. Los tipos pueden depender de tramos, perfil del comprador, uso y normativa vigente. Confirmar con un asesor fiscal.'}</small></div><div class="calculator-result"><div class="mono">${lang==='en'?'Estimated acquisition':'Adquisición estimada'}</div><div class="total" id="calcTotal">—</div><div class="result-line"><span>${lang==='en'?'Taxes':'Impuestos'}</span><strong id="calcTaxes">—</strong></div><div class="result-line"><span>${lang==='en'?'Other costs':'Otros gastos'}</span><strong id="calcOtherCosts">—</strong></div><div class="result-line total-line"><span>${lang==='en'?'Above price':'Sobre el precio'}</span><strong id="calcAbove">—</strong></div><button class="cta" onclick="openEnquiry()">${lang==='en'?'Ask the property advisor':'Preguntar al asesor'} <b>↗</b></button></div></div></section>`;
}
function htmlConcierge(p,c){
  return `<section id="concierge" class="concierge"><div><div class="advisor"><div class="advisor-avatar">A</div><div><div class="mono">${lang==='en'?'Property Concierge':'Concierge de la propiedad'}</div><div style="font-size:12px;margin-top:5px">${lang==='en'?'Private advisor':'Asesor privado'} · ${p.label}</div></div></div><h2>${c.concierge}</h2><p style="font-size:13px;line-height:1.7;max-width:420px">${c.conciergeSub}</p>
<div class="concierge-status" id="conciergeStatus"></div>
<button class="cta" style="color:var(--ink);border-color:var(--ink)" onclick="document.querySelector('.chat input').focus()">${c.explore} <b>↘</b></button></div>
<div class="chat"><div class="messages" id="chatMessages"><div class="bubble">${p.conciergeIntro}</div></div><form class="chat-form" onsubmit="chat(event)"><input id="chatInput" placeholder="${c.placeholder}"/><button>${c.send} ↗</button></form></div></section>`;
}
function htmlArrival(p,c){
  return `<div id="arrivalOverlay" class="arrival-overlay" aria-hidden="true"><div class="arrival-backdrop"></div><div class="arrival-progress"><span class="arrival-step active">01</span><i></i><span class="arrival-step">02</span><i></i><span class="arrival-step">03</span></div><button class="arrival-close" onclick="closeArrival()">Close ×</button><div class="arrival-content"><div class="eyebrow" id="arrivalEyebrow">Arrival</div><h2 id="arrivalTitle"></h2><p id="arrivalText"></p><button class="arrival-next" onclick="nextArrival()">${lang==='en'?'Continue':'Continuar'} <b>↘</b></button></div></div>`;
}
function htmlSpace(p,c){
  return `<div id="spaceOverlay" class="space-overlay" aria-hidden="true"><button class="space-close" onclick="closeSpace()">Close ×</button><div class="space-media" id="spaceMedia"></div><div class="space-panel"><div class="mono" id="spaceLabel">${lang==='en'?'Explore the space':'Explorar el espacio'}</div><h2 id="spaceTitle"></h2><p id="spaceDescription"></p><div class="space-meta" id="spaceMeta"></div><button class="cta" style="color:var(--paper);border-color:var(--paper)" onclick="closeSpace();jumpTo('concierge')">${lang==='en'?'Ask the advisor':'Preguntar al asesor'} <b>↗</b></button></div></div>`;
}
function htmlFilm(){
  return `<div id="filmOverlay" class="film-overlay" aria-hidden="true"><button class="film-close" onclick="closeFilm()">Close ×</button><iframe id="filmFrame" class="film-frame" title="Property film" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
}
function htmlEnquiry(p,c){
  return `<div id="enquiryOverlay" class="enquiry-overlay" aria-hidden="true"><button class="menu-close" onclick="closeEnquiry()">Close ×</button><div class="enquiry-box"><div class="mono">${lang==='en'?'Private enquiry':'Consulta privada'} · ${p.label}</div><h2>${lang==='en'?'Begin a private conversation.':'Inicia una conversación privada.'}</h2><p>${lang==='en'?'Tell the property advisor what matters to you. We will prepare the right next step.':'Cuéntale al asesor qué es importante para ti. Prepararemos el siguiente paso.'}</p>
<div class="enquiry-context" id="enquiryContext"></div>
<div id="advisorSummaryBox" class="advisor-summary-box"></div>
<form onsubmit="submitEnquiry(event)"><input type="text" name="company" autocomplete="off" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0"/><input required name="name" placeholder="${lang==='en'?'Full name':'Nombre completo'}"/><input required type="email" name="email" placeholder="${lang==='en'?'Email address':'Email'}"/><select name="interest"><option>${lang==='en'?'What interests you most?':'¿Qué te interesa más?'}</option><option>${lang==='en'?'Living here':'Vivir aquí'}</option><option>${lang==='en'?'Privacy and retreat':'Privacidad y retiro'}</option><option>${lang==='en'?'Entertaining':'Reuniones'}</option><option>${lang==='en'?'Architecture and design':'Arquitectura y diseño'}</option><option>${lang==='en'?'Investment':'Inversión'}</option></select><textarea name="message" placeholder="${lang==='en'?'Anything you would like the advisor to know?':'¿Algo que quieras que el asesor sepa?'}"></textarea><button class="cta" type="submit">${lang==='en'?'Request private contact':'Solicitar contacto privado'} <b>↗</b></button></form><div id="enquirySuccess" class="enquiry-success" aria-live="polite"></div></div></div>`;
}
function htmlFooter(p){
  return `<footer class="footer"><span>Larum Property Experience</span><span>${p.label} · ${p.brand} · 2026</span></footer>`;
}
/* LPE-08: uses the full index (all published slugs) so non-loaded properties
   appear in the switcher and trigger lazy load on first click. */
function htmlSwitcher(){
  return `<div class="switcher">${LarumLoader.getIndexSlugs().map(k=>`<button class="${current===k?'active':''}" onclick="setProperty('${k}')">${(LarumLoader.getIndexLabel(k)||k).split(' · ')[0]}</button>`).join('')}<button onclick="setLang()">${lang==='en'?'ES':'EN'}</button></div>`;
}
/* Bilingual labels stay here (LPE-03 §4.3). Menu ids/order come from the shell. */
const MENU_LABELS={
  identity:{en:'Identity',es:'Identidad'},
  sequence:{en:'A day here',es:'Un día aquí'},
  spatial:{en:'Spatial logic',es:'Lógica espacial'},
  documents:{en:'Documents',es:'Documentos'},
  calculator:{en:'Acquisition cost',es:'Coste de adquisición'},
  concierge:{en:'Private concierge',es:'Concierge privado'}
};

/* ── LPE-04: engine coordinator ─────────────────────────────────────────
   app.js no longer owns the 6 P0 module subtrees. It renders them via the
   module registry, mounts them, and routes cross-module calls through ctx. */

const P0_IDS=['enquiry-handoff','arrival','property-dna','lived-sequence','verified-intelligence','concierge'];

const P0_ROOT={
  'enquiry-handoff':'#enquiryOverlay',
  arrival:'#arrivalOverlay',
  'property-dna':'.dna-section',
  'lived-sequence':'#sequence',
  'verified-intelligence':'#details',
  concierge:'#concierge'
};

let ctx=null;
const _mounted={};

function useModule(id){
  try{
    if(typeof LarumModuleCatalog!=='undefined'&&LarumModuleCatalog.resolveModule)return LarumModuleCatalog.resolveModule(id);
    if(typeof LarumModules!=='undefined'&&LarumModules[id])return LarumModules[id];
  }catch(e){}
  return null;
}

function buildCtx(p,c){
  return {
    slug:current,
    lang:lang,
    copy:c,
    property:p,
    model:model,
    pc:pc,
    activeSequences:activeSequences,
    activeScenes:activeScenes,
    activeSpatial:activeSpatial,
    activeAssets:activeAssets,
    dnaDimensions:dnaDimensions,
    settingCards:settingCards,
    track:function(ev,d,m){LarumAnalytics.track(ev,d,m);},
    navigate:jumpTo,
    selectSequence:selectSequence,
    openSpace:openSpace,
    openFilm:openFilm,
    isVisible:isModuleVisible,
    visited:visited,
    knowledge:function(){return knowledgeModel&&knowledgeModel[current];},
    qualification:qualificationTriggered,
    entryPath:function(){return entryPath;},
    contactConfig:contactConfig,
    actions:{}
  };
}

function destroyModules(){
  for(const id in _mounted){
    try{_mounted[id].mod.destroy();}catch(e){}
    delete _mounted[id];
  }
}

function mountModules(){
  for(const id of P0_IDS){
    const m=useModule(id);
    if(!m)continue;
    const root=document.querySelector(P0_ROOT[id]);
    if(!root)continue;
    /* LPE-10: per-module ctx so ctx.track stamps the owning module_id.
       The shared ctx is copied (methods close over module-scope functions in
       app.js, not over the ctx object), with only `track` re-bound to `id`. */
    const moduleCtx=Object.assign({},ctx,{track:function(ev,d){LarumAnalytics.track(ev,d,id);}});
    m.mount(root,moduleCtx);
    _mounted[id]={mod:m};
  }
}

function render(){
  const p=properties[current],c=copy[lang];
  document.documentElement.lang=lang;

  /* LPE-05: family token layer. Reads only manifest.family; no other recipe
     field is consumed. Flag OFF or missing LarumFamilies → no data-family → :root
     Villa default. */
  const applyFamily = (window.LARUM_FAMILY_APPLY !== false);
  const resolver = (typeof LarumFamilies !== 'undefined') ? LarumFamilies.resolve : null;
  const fam = (applyFamily && resolver) ? resolver(currentManifest().family).familyId : null;
  if (fam) document.documentElement.dataset.family = fam;
  else delete document.documentElement.dataset.family;

  /* The shell is rebuilt, so any open disclosure is gone with it. */
  openDnaIndex=-1;openSettingIndex=-1;
  conciergeHistory=[];

  /* V2: analytics init — LPE-10 consume-when-present. family is available now
     (LPE-05); propertyId/revisionId stay null until LPE-08/09 surface them. */
  LarumAnalytics.init(current, lang, { family: (currentManifest().family || null) });

  /* LPE-04: teardown any previously mounted modules before rebuilding. */
  destroyModules();

  const manifest=currentManifest();
  ctx=buildCtx(p,c);

  /* Render every P0 module once per cycle so each holds a fresh ctx; fall
     back to the retained legacy html* when a flag is off / file absent. */
  const moduleHtml={};
  for(const id of P0_IDS){
    const m=useModule(id);
    moduleHtml[id]=m?m.render(ctx):null;
  }

  const slices={
    hero: htmlHero(p,c),
    identity: htmlIdentity(p,c),
    'property-dna': moduleHtml['property-dna']||htmlPropertyDna(p,c),
    'image-band': htmlImageBand(p,c),
    'lived-sequence': moduleHtml['lived-sequence']||htmlLivedSequence(p,c),
    explore: htmlExplore(p,c),
    'spatial-zones': htmlSpatial(p,c),
    'verified-intelligence': moduleHtml['verified-intelligence']||htmlDetails(p,c),
    'setting-lifestyle': htmlSetting(p,c),
    'documents-private-room': htmlDocuments(p,c),
    calculator: htmlCalculator(p,c),
    concierge: moduleHtml['concierge']||htmlConcierge(p,c)
  };

  /* LPE-03: the shell turns manifest + slices into the page. */
  const page=LarumExperienceShell.compose(manifest,slices);

  const railHtml=`<div class="chapter-rail">${page.railIds.map((id,i)=>`<button${i===0?' class="active"':''} onclick="jumpTo('${id}')" data-ch="${id}"><span>0${i+1}</span></button>`).join('')}</div>`;

  const menuItems=page.menuIds.map(id=>MENU_LABELS[id]?{id,...MENU_LABELS[id]}:null).filter(Boolean);
  const menuHtml=`<div id="menuOverlay" class="menu-overlay" aria-hidden="true"><button class="menu-close" onclick="closeMenu()">Close ×</button><div class="mono">Larum Property Experience</div><h2>${lang==='en'?'Explore<br>the place.':'Explora<br>el lugar.'}</h2>${menuItems.map(it=>`<button onclick="closeMenu();jumpTo('${it.id}')">${lang==='en'?it.en:it.es} <b>↘</b></button>`).join('')}</div>`;

  const arrivalHtml=page.showArrival?(moduleHtml['arrival']||htmlArrival(p,c)):'';
  const enquiryHtml=page.showEnquiry?(moduleHtml['enquiry-handoff']||htmlEnquiry(p,c)):'';

  document.getElementById('app').innerHTML=`
<div class="shell">
<div class="private-note">${c.private}</div>
<header class="topbar"><button class="menu" onclick="openMenu()"><span></span>${c.menu}</button><div class="brand">LARUM<small>PROPERTY EXPERIENCE</small></div><button class="enquire" onclick="openEnquiry()">${c.enquire}</button></header>
${railHtml}
<main>
${page.mainHtml}</main>
${arrivalHtml}
${htmlSpace(p,c)}
${htmlFilm()}
${menuHtml}
${enquiryHtml}
${htmlFooter(p)}
${htmlSwitcher()}
</div>`;

  /* LPE-04: mount P0 modules into their roots, then wire the coordinator. */
  mountModules();
  ctx.actions={
    enquiry: useModule('enquiry-handoff')?useModule('enquiry-handoff').actions:null,
    arrival: useModule('arrival')?useModule('arrival').actions:null,
    sequence: useModule('lived-sequence')?useModule('lived-sequence').actions:null
  };

  /* Concierge status is refreshed by its own mount() when live; the legacy
     path still refreshes it here. */
  if(!useModule('concierge'))updateConciergeStatus();
}


/* ════════════════════════════════════════════════════════════════════
   V2: CONCIERGE STATUS — shows detected interests & qualification level
   ════════════════════════════════════════════════════════════════════ */

function updateConciergeStatus() {
  const el = document.getElementById('conciergeStatus');
  if (!el) return;
  const top = LarumAnalytics.getTopInterests(3);
  const questions = LarumAnalytics.state.questionCount;
  if (top.length === 0 && questions === 0) {
    el.innerHTML = '';
    return;
  }
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
  html += top.map(([k,v])=>`<span class="interest-tag">${interestLabels[k]||k}</span>`).join('');
  html += '</div>';
  el.innerHTML = html;
}

/* ════════════════════════════════════════════════════════════════════
   EXISTING INTERACTIONS
   ════════════════════════════════════════════════════════════════════ */

function selectSequence(i){
  const m=useModule('lived-sequence');
  if(m&&ctx){m.actions.select(i);return;}
  legacySelectSequence(i);
}
function legacySelectSequence(i){
  const s=activeSequences()[i];
  if(!visited.includes(s[0]))visited.push(s[0]);
  LarumAnalytics.track('scene_open', { name: s[0] });
  const stage=document.getElementById('sequenceStage');
  document.getElementById('sequenceTime').textContent=s[1];
  document.getElementById('sequenceTitle').textContent=s[0];
  document.getElementById('sequenceText').textContent=s[2];
  document.querySelectorAll('.sequence-dot').forEach((el,n)=>el.classList.toggle('active',n===i));
  document.getElementById('sceneLinks').innerHTML=activeScenes()[i][1].map((space,n)=>`<button class="scene-link" onclick="openSpace('${space}')"><span>0${n+1}</span>${space}<b>↗</b></button>`).join('');
  stage.classList.remove('sequence-change');void stage.offsetWidth;stage.classList.add('sequence-change');
}

function selectMapSpace(i){
  const m=activeSpatial()[i];
  document.querySelectorAll('.map-node').forEach((el,n)=>el.classList.toggle('active',n===i));
  LarumAnalytics.track('space_open', { name: m[1] });
  const details=model('spatialNodeDetails');
  const text=details?.[lang]?.[i];
  if(text)document.getElementById('spatialDetail').textContent=text;
}

function choosePath(path){entryPath=path;LarumAnalytics.track('entry_path',{path});if(path==='live'){if(isModuleVisible('arrival'))startArrival();else if(document.getElementById('sequence'))jumpTo('sequence')}if(path==='space'){if(document.getElementById('spatial'))jumpTo('spatial')}if(path==='private'){if(isModuleVisible('enquiry-handoff'))openEnquiry()}}

function openDocument(name){
  LarumAnalytics.track('document_request', { name });
  const context=document.getElementById('enquiryContext');
  if(context)context.textContent=lang==='en'?`${name} is available in the approved property pack. It will be downloadable here once the agency authorises the document.`:`${name} estará disponible en el pack aprobado de la propiedad. Podrá descargarse aquí cuando la agencia autorice el documento.`;
  openEnquiry();
}

/* ── Acquisition calculator ──
   Rates come from purchase-config.json; the property picks its own
   starting region via content.defaultRegion. Every field stays editable. */

const MANUAL_REGION='__manual__';

function regionRates(){
  const region=document.getElementById('calcRegion')?.value||model('defaultRegion');
  return (region&&region!==MANUAL_REGION&&purchaseConfig?.regions?.[region])||null;
}

/* Default value for a rate input: regional rate first, then global defaults. */
function calcType(){
  return document.getElementById('calcType')?.value||model('defaultPropertyType')||'resale';
}

function rate(name){
  const type=calcType();
  const region=purchaseConfig?.regions?.[model('defaultRegion')];
  if(region&&region[name]!=null)return region[name];
  const defaults=purchaseConfig?.defaults?.[type]||purchaseConfig?.defaults?.resale||{};
  if(defaults[name]!=null)return defaults[name];
  const fallback={itp:7,vat:10,ajd:1.5,notary:0.5,registry:0.3,legal:1,other:0};
  return fallback[name]??0;
}

/* Only regions with published rates are offered; the rest go through manual entry. */
function regionOptions(){
  const regions=purchaseConfig?.regions||{};
  const withRates=Object.keys(regions).filter(r=>regions[r]?.itp!=null||regions[r]?.ajd!=null);
  const selected=model('defaultRegion');
  const opts=withRates.map(r=>`<option${r===selected?' selected':''}>${r}</option>`).join('');
  return `${opts}<option value="${MANUAL_REGION}">${lang==='en'?'Other / enter manually':'Otra / introducir manualmente'}</option>`;
}

/* Region changed → refill the tax inputs, leaving the other costs untouched. */
function applyRegionRates(){
  const rates=regionRates();
  if(rates){
    const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!=null)el.value=v};
    set('calcItp',rates.itp);
    set('calcAjd',rates.ajd);
  }
  calculatePurchase();
}

function calculatePurchase(){
  const price=Number(document.getElementById('calcPrice')?.value)||0;
  const type=calcType();
  const itp=(Number(document.getElementById('calcItp')?.value)||0)/100;
  const vat=(Number(document.getElementById('calcVat')?.value)||0)/100;
  const ajd=(Number(document.getElementById('calcAjd')?.value)||0)/100;
  const notary=(Number(document.getElementById('calcNotary')?.value)||0)/100;
  const registry=(Number(document.getElementById('calcRegistry')?.value)||0)/100;
  const legal=(Number(document.getElementById('calcLegal')?.value)||0)/100;
  const other=(Number(document.getElementById('calcOther')?.value)||0)/100;
  const taxes=type==='new'?price*(vat+ajd):price*itp;
  const costs=price*(notary+registry+legal+other);
  const above=taxes+costs;
  const total=price+above;
  const fmt=n=>new Intl.NumberFormat(lang==='es'?'es-ES':'en-GB',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=fmt(v)};
  set('calcTaxes',taxes);set('calcOtherCosts',costs);set('calcAbove',above);set('calcTotal',total);
  LarumAnalytics.track('calculator_use', { price, type, total, region: document.getElementById('calcRegion')?.value||null });
}

function updateCalcType(){
  const type=calcType();
  document.getElementById('itpLabel')?.classList.toggle('hidden',type==='new');
  document.getElementById('vatLabel')?.classList.toggle('hidden',type!=='new');
  calculatePurchase();
}

function openMenu(){const o=document.getElementById('menuOverlay');o.classList.add('open');o.setAttribute('aria-hidden','false')}
function closeMenu(){const o=document.getElementById('menuOverlay');o.classList.remove('open');o.setAttribute('aria-hidden','true')}

function openEnquiry(){
  const m=useModule('enquiry-handoff');
  if(m&&ctx){m.actions.open();return;}
  legacyOpenEnquiry();
}
function legacyOpenEnquiry(){
  if(!isModuleVisible('enquiry-handoff'))return;
  const overlay=document.getElementById('enquiryOverlay');
  if(!overlay)return;
  /* V2: build contextual summary */
  const contextText = LarumAnalytics.buildContextualEnquiry();
  const contextEl = document.getElementById('enquiryContext');
  if (contextEl) contextEl.textContent = contextText || (entryPath ? `Entry: ${entryPath}` : '');

  /* V2: show advisor summary if qualified */
  const summaryBox = document.getElementById('advisorSummaryBox');
  if (summaryBox && LarumAnalytics.isQualified()) {
    const summary = LarumAnalytics.buildAdvisorSummary();
    const c = copy[lang];
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

  const o=document.getElementById('enquiryOverlay');
  o.classList.add('open');o.setAttribute('aria-hidden','false');
}

function closeEnquiry(){const o=document.getElementById('enquiryOverlay');if(!o)return;o.classList.remove('open');o.setAttribute('aria-hidden','true')}

function submitEnquiry(e){
  e.preventDefault();
  const form=e.target;
  const data=new FormData(form);

  /* M6.7c: anti-spam — honeypot ("company", hidden off-screen, a real
     visitor never sees or fills it) plus a minimum time-to-submit (a
     real visitor needs at least a moment to read the form and type
     into it). Either signal alone can false-positive in principle;
     together they catch the ordinary scripted bots that are the
     realistic threat here without a CAPTCHA. A caught submission still
     shows success — telling a bot it was detected only teaches it to
     adapt, and does nothing for a real visitor either way. */
  const isSpam = !!data.get('company') || (Date.now()-APP_LOAD_TS) < 800;
  if (isSpam) {
    showEnquirySuccess(data.get('name'));
    return;
  }

  const cfg=contactConfig.properties[current]||{};
  const to=cfg.email||contactConfig.defaultEmail;

  /* V2: Build complete advisor payload */
  const summary = LarumAnalytics.buildAdvisorSummary();
  const subject=`Private enquiry — ${properties[current].label}`;
  const body=[
    `Property: ${properties[current].label}`,
    `Name: ${data.get('name')}`,
    `Email: ${data.get('email')}`,
    `Interest: ${data.get('interest')}`,
    `Message: ${data.get('message')||''}`,
    `Language: ${lang}`,
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

  /* Store first. Only fall back to the visitor's mail client if storage
     failed — mailto depends on them having one configured, which on a
     phone often means the enquiry quietly goes nowhere. */
  const stored = sendLeadToSupabase({
    property: current,
    lang: lang,
    /* Ties the lead to everything the visitor did before filling the form,
       including the part of the visit that happened before they decided to. */
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

  /* V2: If endpoint configured, use fetch; otherwise fallback to mailto */
  if (contactConfig.endpoint) {
    fetch(contactConfig.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property: current,
        lang,
        contact: { name: data.get('name'), email: data.get('email'), interest: data.get('interest'), message: data.get('message') },
        summary
      })
    }).then(r => {
      if (r.ok) showEnquirySuccess(data.get('name'));
      else fallbackMailto(to, subject, body, data.get('name'));
    }).catch(() => fallbackMailto(to, subject, body, data.get('name')));
  } else {
    /* Storage is the primary path. mailto is the safety net, not the plan. */
    stored.then(ok => {
      if (ok) showEnquirySuccess(data.get('name'));
      else fallbackMailto(to, subject, body, data.get('name'));
    });
  }

  LarumAnalytics.track('enquiry', { name: data.get('name'), email: data.get('email'), interest: data.get('interest') });
}

/* Returns true only if the lead is actually stored. A failure here used to
   be logged and swallowed while the visitor was told the enquiry had been
   sent — so an enquiry could be lost with nobody aware of it. */
async function sendLeadToSupabase(leadData) {
  if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
  try {
    let { error } = await supabaseClient.from('leads').insert([leadData]);

    /* `session_id` arrived with the analytics migration. If the column is not
       there yet, the enquiry still matters more than the link to the session. */
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
  document.getElementById('enquirySuccess').textContent = lang==='en'
    ? `Thank you, ${name}. Your enquiry has been prepared for the property advisor with a full summary of your experience.`
    : `Gracias, ${name}. Tu consulta ha sido preparada para el asesor con un resumen completo de tu experiencia.`;
}

function openFilm(){
  const url=activeAssets().propertyFilm;
  if(!url)return;
  document.getElementById('filmFrame').src=url+'?autoplay=1&rel=0';
  const o=document.getElementById('filmOverlay');o.classList.add('open');o.setAttribute('aria-hidden','false');
  LarumAnalytics.track('film_watch', { property: current });
}
function handleFilmTrigger(){if(activeAssets().propertyFilm){openFilm()}else{jumpTo('concierge')}}
function closeFilm(){const o=document.getElementById('filmOverlay');o.classList.remove('open');o.setAttribute('aria-hidden','true');document.getElementById('filmFrame').src=''}

function openSpace(space){
  if(!visited.includes(space))visited.push(space);
  LarumAnalytics.track('space_open', { name: space });
  const p=properties[current],es=lang==='es';

  /* Descriptions come from the knowledge base, in the visitor's language */
  const pack = knowledgeModel && knowledgeModel[current];
  const spaceData = pack?.property?.spaces?.[space];
  const text = (es && spaceData?.descriptionEs) || spaceData?.description || space;

  document.getElementById('spaceTitle').textContent=space;
  document.getElementById('spaceDescription').textContent=text;
  document.getElementById('spaceLabel').textContent=es?'Explorar el espacio':'Explore the space';
  document.getElementById('spaceMeta').innerHTML=`<span>${model('shortRef')||p.label}</span><span>${es?'Imagen / vídeo contextual':'Context image / video'}</span>`;
  /* Per-space photography when the agency has supplied it; the band image
     stands in until then. Adding an entry to assets.spaces is all it takes. */
  const spaceMedia=activeAssets().spaces?.[space];
  const img=spaceMedia?.image||p.band;
  document.getElementById('spaceMedia').style.backgroundImage=`linear-gradient(0deg,rgba(10,11,10,.38),transparent 60%),url('${img}')`;
  const o=document.getElementById('spaceOverlay');o.classList.add('open');o.setAttribute('aria-hidden','false');
}

function closeSpace(){const o=document.getElementById('spaceOverlay');o.classList.remove('open');o.setAttribute('aria-hidden','true')}
/* Navigation must never silently do nothing. Smooth scrolling is not
   guaranteed — it is unavailable in some browsers and settings, and when it
   is, scrollIntoView returns without moving and the chapter rail, the menu
   and every in-page link become dead controls. Ask for smooth, then verify
   and land it. */
function jumpTo(id){
  const el=document.getElementById(id);
  if(!el)return;
  const target=Math.max(0,layoutTop(el));
  const before=window.scrollY;
  try{el.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){}
  setTimeout(()=>{
    const moved=Math.abs(window.scrollY-before)>4;
    const arrived=Math.abs(window.scrollY-target)<12;
    if(!moved&&!arrived)scrollToInstant(target);
  },220);
}
/* Switching property is a cut, not a journey: fade out, swap, land at the
   top already composed. Scrolling the visitor through the outgoing property
   on the way to the top is what made the switch feel broken.
   LPE-08: async path loads the payload on demand; a monotonic token ensures
   only the last switch wins (rapid taps cannot leave a stale property up). */
async function setProperty(p){
  if(p===current)return;

  if(LarumLoader.hasProperty(p)){
    /* Sync path: payload already cached. */
    const done=()=>{
      current=p;render();updateCalcType();calculatePurchase();
      jumpToTop();initExperience({immediate:true});syncUrl();
      requestAnimationFrame(()=>swapVeil().classList.remove('on'));
    };
    if(prefersReducedMotion()){done();return}
    swapVeil().classList.add('on');
    setTimeout(done,190);
    return;
  }

  /* Async path: load payload on demand. */
  const token=++_switchToken;
  const veil=swapVeil();
  veil.classList.add('on');

  const ok=await LarumLoader.loadProperty(p);
  if(_switchToken!==token)return; /* stale — a later switch already won */
  if(!ok){veil.classList.remove('on');return} /* failure — keep current view */

  /* Integrate newly loaded property into live maps. */
  contentModel[p]=LarumLoader.getContent(p);
  knowledgeModel[p]=LarumLoader.getKnowledge(p);
  assetsModel[p]=LarumLoader.getAssets(p);
  properties[p]={key:p,...contentModel[p],...resolveMedia(p)};

  if(_switchToken!==token)return;
  const done=()=>{
    current=p;render();updateCalcType();calculatePurchase();
    jumpToTop();initExperience({immediate:true});syncUrl();
    requestAnimationFrame(()=>swapVeil().classList.remove('on'));
  };
  if(prefersReducedMotion()){done();return}
  setTimeout(done,190);
}

/* A fixed, viewport-sized layer. Fading #app instead would promote the
   entire document to one composited layer and paint it black. */
function swapVeil(){
  let v=document.getElementById('swapVeil');
  if(!v){
    v=document.createElement('div');
    v.id='swapVeil';
    v.className='swap-veil';
    v.setAttribute('aria-hidden','true');
    document.body.appendChild(v);
  }
  return v;
}

function prefersReducedMotion(){
  return window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ── Scroll choreography ──
   Every render() replaces the whole shell, so the previous observer and
   listeners point at detached nodes. They must be torn down or they pile up
   one set per switch and fight each other on every scroll event. */

let _observer=null,_onScroll=null,_onResize=null,_failsafe=null;

function teardownExperience(){
  if(_observer){_observer.disconnect();_observer=null}
  if(_onScroll){window.removeEventListener('scroll',_onScroll);_onScroll=null}
  if(_onResize){window.removeEventListener('resize',_onResize);_onResize=null}
  if(_failsafe){clearTimeout(_failsafe);_failsafe=null}
}

function initExperience(opts){
  teardownExperience();

  const rail=document.querySelector('.chapter-rail');if(!rail)return;
  const sections=railChapterIds().map(id=>document.getElementById(id)).filter(Boolean);
  const dots=[...rail.querySelectorAll('button')];

  /* The DNA grid animates too but is not a chapter: it must not drive the
     rail or analytics. It was previously left out of the observer entirely,
     which left its bars permanently hidden. */
  const extra=[...document.querySelectorAll('.dna-section')];
  const watched=[...sections,...extra];

  const reveal=el=>{
    el.classList.add('is-visible');
    const i=sections.indexOf(el);
    if(i>=0){
      dots.forEach((d,n)=>d.classList.toggle('active',n===i));
      LarumAnalytics.track('chapter_enter',{name:sections[i].id});
    }
  };

  /* A ratio threshold cannot work here: a section taller than the viewport
     can never reach it, so it would stay invisible forever on short windows.
     Trigger on any overlap instead, biased slightly into the viewport. */
  _observer=new IntersectionObserver(
    entries=>entries.forEach(e=>{if(e.isIntersecting)reveal(e.target)}),
    {threshold:0,rootMargin:'0px 0px -12% 0px'}
  );

  /* On a swap the visitor is already looking at the page, so anything on
     screen is marked without replaying the entrance. */
  const immediate=!!(opts&&opts.immediate);
  const vh=window.innerHeight;
  const onScreen=immediate
    ? new Set(watched.filter(s=>{const r=s.getBoundingClientRect();return r.top<vh&&r.bottom>0}))
    : new Set();

  watched.forEach(s=>{
    s.classList.add('reveal');
    /* Already on screen after a swap: mark it composed and suppress the
       entrance, so the visitor never watches it fade in a beat late. */
    if(onScreen.has(s))s.classList.add('is-visible','no-anim');
    _observer.observe(s);
  });

  if(immediate){
    const first=sections.find(s=>onScreen.has(s));
    if(first){
      const i=sections.indexOf(first);
      dots.forEach((d,n)=>d.classList.toggle('active',n===i));
      LarumAnalytics.track('chapter_enter',{name:first.id});
    }
  }

  /* Reveal anything that has come into view. Runs alongside the observer
     rather than trusting it alone. Content is visible without it — the
     entrance is additive — but the rail still needs the signal. */
  const sweep=()=>{
    const h=window.innerHeight;
    watched.forEach(s=>{
      if(s.classList.contains('is-visible'))return;
      const r=s.getBoundingClientRect();
      if(r.top<h&&r.bottom>0)reveal(s);
    });
  };

  /* Hero parallax + reveal sweep, throttled to one write per frame. */
  const hero=document.querySelector('.hero-image');
  let ticking=false;
  _onScroll=()=>{
    if(ticking)return;
    ticking=true;
    requestAnimationFrame(()=>{
      ticking=false;
      if(hero&&window.scrollY<window.innerHeight)hero.style.transform=`scale(1.05) translateY(${window.scrollY*.08}px)`;
      sweep();
    });
  };
  window.addEventListener('scroll',_onScroll,{passive:true});

  /* Last resort: if the observer never fired for whatever reason, show the
     content anyway rather than leaving the visitor looking at a black band. */
  clearTimeout(_failsafe);
  _failsafe=setTimeout(sweep,2500);

  /* Resizing changes what intersects; the observer does not re-run on its
     own, so anything now on screen has to be re-checked. */
  let resizeTimer=null;
  _onResize=()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(sweep,120);
  };
  window.addEventListener('resize',_onResize,{passive:true});
}

let arrivalIndex=0;
function startArrival(){
  const m=useModule('arrival');
  if(m&&ctx){m.actions.open();return;}
  legacyStartArrival();
}
function legacyStartArrival(){if(!isModuleVisible('arrival')){if(document.getElementById('sequence'))jumpTo('sequence');return}const o=document.getElementById('arrivalOverlay');if(!o){if(document.getElementById('sequence'))jumpTo('sequence');return}arrivalIndex=0;o.classList.add('open');o.setAttribute('aria-hidden','false');updateArrival()}
function closeArrival(){const o=document.getElementById('arrivalOverlay');if(!o)return;o.classList.remove('open');o.setAttribute('aria-hidden','true')}
function nextArrival(){if(arrivalIndex<2){arrivalIndex++;updateArrival()}else{closeArrival();jumpTo('identity')}}

function updateArrival(){
  const p=properties[current];
  const scenes=model('arrival')?.[lang]||[];
  const s=scenes[arrivalIndex];
  if(!s)return;
  document.getElementById('arrivalEyebrow').textContent=`0${arrivalIndex+1} · ${s[0]}`;
  document.getElementById('arrivalTitle').textContent=s[1];
  document.getElementById('arrivalText').textContent=s[2];
  document.querySelectorAll('.arrival-step').forEach((el,i)=>el.classList.toggle('active',i===arrivalIndex));
  document.querySelector('.arrival-backdrop').style.backgroundImage=`linear-gradient(90deg,rgba(12,13,11,.76),rgba(12,13,11,.24)),url('${p.image}')`;
}

/* Language changes in place: same property, same scroll position, no
   entrance replay. render() rebuilds the shell, so the choreography has to
   be re-attached or the chapter rail stops tracking. */
function setLang(){
  const anchor=captureAnchor();
  lang=lang==='en'?'es':'en';
  render();
  updateCalcType();calculatePurchase();
  restoreAnchor(anchor);
  initExperience({immediate:true});
  syncUrl();
}

/* Spanish and English copy have different heights, so restoring a raw pixel
   offset drifts. Anchor to the section the visitor is actually looking at.

   Measured with offsetTop, not getBoundingClientRect: unrevealed sections
   carry a translateY(30px) that the rect would include and the layout
   position would not, which is exactly how the drift crept in. */
function layoutTop(el){
  let t=0;
  for(let n=el;n;n=n.offsetParent)t+=n.offsetTop;
  return t;
}

/* The document scrolls smoothly for in-page navigation, so repositioning
   after a re-render has to opt out explicitly or it animates. */
function scrollToInstant(y){
  window.scrollTo({top:Math.max(0,y),left:0,behavior:'instant'});
}
function jumpToTop(){scrollToInstant(0)}

function captureAnchor(){
  if(window.scrollY<4)return null;
  const ids=railChapterIds();
  let best=null;
  for(const id of ids){
    const el=document.getElementById(id);if(!el)continue;
    const offset=window.scrollY-layoutTop(el);
    if(offset>=-8&&(!best||offset<best.offset))best={id,offset};
  }
  return best;
}

function restoreAnchor(anchor){
  if(!anchor)return;
  const el=document.getElementById(anchor.id);
  if(!el)return;
  scrollToInstant(layoutTop(el)+anchor.offset);
}

/* ════════════════════════════════════════════════════════════════════
   V2: ADVANCED CHAT — with scene links, interest detection, qualification
   ════════════════════════════════════════════════════════════════════ */

/* ── Concierge ──
   The LLM concierge understands the question; the knowledge pack still owns
   every fact. If the endpoint is unconfigured, slow or failing, the keyword
   engine answers instead — the visitor never sees an error, and the demo
   works with no API key at all. */

let conciergeHistory=[];
let conciergeEndpointDown=false;   /* one failure is enough — stop retrying this session */

/* Ask the grounded concierge. Returns null on any problem so the caller
   falls back; never throws, never blocks longer than the timeout. */
async function askConcierge(question){
  if(conciergeEndpointDown)return null;

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const r=await fetch('/api/concierge',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        property:current, lang, question,
        history:conciergeHistory,
        /* Ties this turn to the visit in analytics and to any conversation
           row already opened by an earlier question on the same tab. */
        sessionId: (window.LarumAnalytics && LarumAnalytics.getSessionId()) || null
      }),
      signal:controller.signal
    });
    /* The endpoint is absent (404), unimplemented by a plain static server
       (501), or has no API key (503) — none of these fix themselves, so stop
       asking. 429 = rate limited: the visitor has exhausted their budget for
       this session, so hand off to the keyword engine for what remains of it.
       A 400 is about this one question and must not mark it down. */
    if(r.status===404||r.status===501||r.status===503||r.status===429){conciergeEndpointDown=true;return null}
    if(!r.ok)return null;
    const d=await r.json();
    if(d.error||!d.answer)return null;

    /* Only link to things this property actually has — the model is told the
       valid names, but the experience must not trust that blindly. */
    const validSpaces=new Set(Object.keys(knowledgeModel?.[current]?.property?.spaces||{}));
    const validScenes=new Set(activeSequences().map(s=>s[0]));

    return {
      text:escapeHtml(d.answer),
      confidence:d.confidence==='confirmed'?'confirmed':'requires-advisor',
      sceneLinks:(d.scenes||[]).filter(s=>validScenes.has(s)),
      spaceLinks:(d.spaces||[]).filter(s=>validSpaces.has(s)),
      docLinks:(d.documents||[]).map(x=>x==='calculator'?'calculator':'documents'),
      followUp:d.followUp?escapeHtml(d.followUp):null,
      interests:d.interests||[],
      intentId:'llm',
      source:'llm'
    };
  }catch(_){
    return null;   /* timeout, offline, CORS, malformed JSON — all fall back */
  }finally{
    clearTimeout(timeout);
  }
}

/* Model output is rendered as HTML, so it is escaped before it ever reaches
   the DOM. */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showConciergeThinking(box){
  const el=document.createElement('div');
  el.className='bubble thinking';
  el.innerHTML='<i></i><i></i><i></i>';
  box.appendChild(el);
  box.parentElement.scrollTop=box.parentElement.scrollHeight;
  return el;
}

async function chat(e){
  e.preventDefault();
  const input=document.getElementById('chatInput');
  const v=input.value.trim();
  if(!v)return;
  const safe=v.replace(/</g,'&lt;');

  const box=document.getElementById('chatMessages');
  box.insertAdjacentHTML('beforeend',`<div class="bubble user">${safe}</div>`);
  input.value='';
  const thinking=showConciergeThinking(box);

  let response=null;
  try{ response=await askConcierge(v); }catch(_){ response=null; }
  if(!response) response=buildConciergeResponse(v);   /* keyword fallback */

  thinking.remove();

  /* Interests: the concierge reads them from the question when it answers;
     the keyword engine falls back to signal matching. */
  const interests = response.interests?.length
    ? Object.fromEntries(response.interests.map(i=>[i,1]))
    : detectInterestSignals(v);

  conciergeHistory.push({role:'user',content:v},{role:'assistant',content:response.text});
  if(conciergeHistory.length>8) conciergeHistory=conciergeHistory.slice(-8);

  /* Track in analytics */
  LarumAnalytics.track('concierge_question', {
    question: v,
    intentId: response.intentId,
    interests
  });

  /* Build response HTML with scene links, space links, doc links */
  let responseHtml = `<div class="bubble">${response.text}`;

  /* Confidence badge */
  if (response.confidence === 'requires-advisor') {
    responseHtml += `<div class="confidence-note">${lang==='en'?'⚡ Best confirmed by the advisor':'⚡ Mejor confirmado por el asesor'}</div>`;
  }

  /* Scene links */
  if (response.sceneLinks.length) {
    responseHtml += `<div class="response-links"><span class="response-link-label">${lang==='en'?'Explore':'Explora'}:</span>`;
    responseHtml += response.sceneLinks.map(s => `<button class="response-link" onclick="navigateToScene('${s}')">${s}</button>`).join('');
    responseHtml += `</div>`;
  }

  /* Space links */
  if (response.spaceLinks.length) {
    responseHtml += `<div class="response-links">`;
    responseHtml += response.spaceLinks.map(s => `<button class="response-link" onclick="openSpace('${s}')">${s} ↗</button>`).join('');
    responseHtml += `</div>`;
  }

  /* Doc links */
  if (response.docLinks.length) {
    responseHtml += `<div class="response-links">`;
    responseHtml += response.docLinks.map(d => {
      if (d === 'calculator') return `<button class="response-link" onclick="closeChat();jumpTo('calculator')">${lang==='en'?'Acquisition calculator':'Calculadora de adquisición'} ↗</button>`;
      if (d === 'documents') return `<button class="response-link" onclick="closeChat();jumpTo('documents')">${lang==='en'?'Documents':'Documentos'} ↗</button>`;
      return '';
    }).join('');
    responseHtml += `</div>`;
  }

  /* Follow-up prompt */
  if (response.followUp) {
    responseHtml += `<div class="follow-up">${response.followUp}</div>`;
  }

  responseHtml += `</div>`;

  box.insertAdjacentHTML('beforeend', responseHtml);
  box.parentElement.scrollTop = box.parentElement.scrollHeight;

  /* V2: Check qualification triggers */
  const qualMsg = checkQualification();
  if (qualMsg) {
    setTimeout(() => {
      box.insertAdjacentHTML('beforeend', `<div class="bubble qualification">${qualMsg}</div>`);
      box.parentElement.scrollTop = box.parentElement.scrollHeight;
    }, 1200);
  }

  /* Update concierge status */
  updateConciergeStatus();
}

function navigateToScene(sceneName) {
  /* Find which sequence index contains this scene */
  const seqs = activeSequences();
  const idx = seqs.findIndex(s => s[0] === sceneName);
  if (idx >= 0) {
    jumpTo('sequence');
    setTimeout(() => selectSequence(idx), 600);
  }
}

function closeChat() {
  /* Close any overlays if needed */
}

/* ════════════════════════════════════════════════════════════════════
   DATA LOADING — everything comes from LarumLoader (properties/)
   ════════════════════════════════════════════════════════════════════ */

/* Assets win over content for media: the manifest is where a property's
   real photography lands once the agency authorises it. */
function resolveMedia(slug) {
  const a = (assetsModel && assetsModel[slug]) || {};
  const c = (contentModel && contentModel[slug]) || {};
  let image = a.hero?.fallbackImage || c.image || '';
  let heroVideo = a.hero?.video || null;
  let band = a.bandImage || c.band || '';
  /* LPE-06: resolve hero/band through the asset contract resolver when
     available. Flat-field fallback is retained — identical output today
     (the resolver returns the same URLs the flat reader produced). */
  try {
    if (typeof LarumAssetResolver !== 'undefined' && LarumAssetResolver.resolve) {
      const resolved = LarumAssetResolver.resolve(null, slug, a);
      const hero = resolved.slots && resolved.slots['hero'];
      const bandSlot = resolved.slots && resolved.slots['band-image'];
      if (hero && hero.url) image = hero.url;
      if (bandSlot && bandSlot.url) band = bandSlot.url;
      /* heroVideo stays flat: the resolver models one url per slot; the hero
         video overlay remains a flat-field concern (behavior unchanged). */
    }
  } catch (e) {}
  return { image, heroVideo, band };
}

/* ── Shareable state ──
   The URL is the deliverable: an agent copies it from the address bar and
   sends it to their client, who lands on that property, in that language,
   at that chapter. Without this the demo ends and they leave empty-handed. */

/* LPE-08: validates slug against the index (not just loaded properties),
   so ?property=marbella works even before marbella payload is loaded. */
function readStateFromUrl(){
  const q=new URLSearchParams(location.search);
  const slug=q.get('property')||q.get('p');
  const lg=q.get('lang')||q.get('l');
  return {
    slug: slug&&LarumLoader.getIndexSlugs().includes(slug) ? slug : null,
    lang: lg==='es'||lg==='en' ? lg : null,
    chapter: q.get('chapter')||null
  };
}

function syncUrl(){
  const q=new URLSearchParams(location.search);
  q.set('property',current);
  q.set('lang',lang);
  /* `chapter` is an arrival instruction, not state: once the visitor is in,
     it must not travel on into a link they copy for someone else. */
  q.delete('chapter');
  /* Never persist the diagnostic flags into a shared link either. `source`
     forces the loader to read files or the offline pack: useful while
     authoring, wrong in a link an agent sends to a client, who would then
     be served whatever that source happened to contain. */
  q.delete('debug');
  q.delete('source');
  history.replaceState(null,'',location.pathname+'?'+q.toString());
}

function applyLoaderData(){
  contentModel   = LarumLoader.getContentMap();
  knowledgeModel = LarumLoader.getKnowledgeMap();
  assetsModel    = LarumLoader.getAssetsMap();
  contactConfig  = LarumLoader.getContact() || contactConfig;
  purchaseConfig = LarumLoader.getPurchase();

  properties = {};
  for (const slug of LarumLoader.getPropertySlugs()) {
    properties[slug] = { key: slug, ...contentModel[slug], ...resolveMedia(slug) };
  }

  if (!current || !properties[current]) current = LarumLoader.getDefaultSlug();
}

/* Safe global error handler to prevent page crash */
window.addEventListener('error', function(e) {
  console.warn('Global error:', e.message);
});
window.addEventListener('unhandledrejection', function(e) {
  console.warn('Unhandled rejection:', e.reason);
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeArrival(); closeSpace(); closeFilm(); closeMenu(); closeEnquiry(); } });

/* ── Boot ──
   The experience cannot render before its property data exists, so
   index.html loads the data first and calls this. */

/* LPE-08: boot is async so it can eagerly load a URL-requested property
   that differs from the default before the first render. */
async function boot() {
  try {
    applyLoaderData();

    if (!current) {
      showLoadFailure();
      return;
    }

    /* A shared link decides which property and language open. */
    const wanted = readStateFromUrl();
    if (wanted.lang) lang = wanted.lang;

    /* If the URL requests a property other than the already-loaded default,
       fetch its payload now so the first render shows the right property. */
    if (wanted.slug && wanted.slug !== current) {
      const veil = swapVeil();
      veil.classList.add('on');
      const ok = await LarumLoader.loadProperty(wanted.slug);
      if (ok) {
        const s = wanted.slug;
        contentModel[s] = LarumLoader.getContent(s);
        knowledgeModel[s] = LarumLoader.getKnowledge(s);
        assetsModel[s] = LarumLoader.getAssets(s);
        properties[s] = { key: s, ...contentModel[s], ...resolveMedia(s) };
        current = s;
      }
      veil.classList.remove('on');
    } else if (wanted.slug) {
      current = wanted.slug;
    }

    render();
    initExperience();
    updateCalcType();
    calculatePurchase();
    syncUrl();

    /* ?chapter=sequence drops the visitor straight into a chapter. */
    if (wanted.chapter && document.getElementById(wanted.chapter)) {
      setTimeout(() => jumpTo(wanted.chapter), 400);
      LarumAnalytics.track('entry_path', { path: 'link:' + wanted.chapter });
    }
  } catch (e) {
    console.error('Boot error:', e);
    showLoadFailure(e.message);
  }
}

function showLoadFailure(detail) {
  const errors = LarumLoader.getErrors();
  console.error('Larum: no property data available.', errors);
  document.getElementById('app').innerHTML =
    `<div class="load-failure">
       <div class="mono">Larum Property Experience</div>
       <h1>The property data could not be loaded.</h1>
       <p>Serve this prototype over http:// (<code>python -m http.server 4173</code>),
          or run <code>node build-pack.js</code> to generate the offline pack.</p>
       ${errors.length ? `<ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>` : ''}
       ${detail ? `<p class="detail">${detail}</p>` : ''}
     </div>`;
}

/* ── Diagnostics ──
   Open the prototype with ?debug to print what is actually on screen.
   It reads state out of the live page, so a screenshot of it is enough
   to tell a stale cache from a real rendering fault. */

const LARUM_BUILD = 'build-6';

function debugPanel() {
  const ids = ['hero','identity','sequence','spatial','concierge'];
  const el = document.createElement('div');
  el.id = 'larumDebug';
  el.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;max-width:min(460px,92vw);' +
    'background:#000;color:#0f0;font:11px/1.5 ui-monospace,Menlo,monospace;padding:10px 12px;' +
    'white-space:pre;pointer-events:none;border-bottom-right-radius:6px';
  const paint = () => {
    const rows = ids.map(id => {
      const s = document.getElementById(id);
      if (!s) return `${id}: MISSING`;
      const r = s.getBoundingClientRect();
      const on = r.top < innerHeight && r.bottom > 0;
      return `${id.padEnd(10)} op=${(+getComputedStyle(s).opacity).toFixed(2)} ${on ? 'ON-SCREEN' : '        '} ${Math.round(r.top)}`;
    });
    const dna = document.querySelector('.dna-item');
    const veil = document.getElementById('swapVeil');
    el.textContent = [
      `${LARUM_BUILD}  ${innerWidth}x${innerHeight}  y=${Math.round(scrollY)}`,
      `property=${current} lang=${lang} source=${LarumLoader.getSource()}`,
      `hero img=${(properties[current]?.image || '').split('/').pop()}`,
      `dna-item opacity=${dna ? getComputedStyle(dna).opacity : 'n/a'}`,
      `veil=${veil ? (veil.classList.contains('on') ? 'ON (covering!)' : 'off') : 'none'}`,
      `errors=${LarumLoader.getErrors().length}`,
      ...rows
    ].join('\n');
  };
  paint();
  document.body.appendChild(el);
  addEventListener('scroll', paint, { passive: true });
  addEventListener('resize', paint, { passive: true });
  setInterval(paint, 500);
}

window.LarumApp = { boot, debugPanel, build: LARUM_BUILD };
