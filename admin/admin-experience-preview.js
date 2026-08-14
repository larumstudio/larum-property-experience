/* ── Larum Admin · Experience Preview ─────────────────────────
   Read-only preview of the visitor-facing property experience.
   Renders inside the workspace Experience tab as a 16:9 iframe
   pointing at index.html with the current slug + language.

   Zero writes. No store touch. Uses the already-loaded property.
   ───────────────────────────────────────────────────────────── */

import { esc } from './admin-core.js';

let containerRef = null;
let currentSlug = null;
let currentLang = 'en';

export function render(container, property) {
  containerRef = container;
  currentSlug = property.slug;
  currentLang = 'en';
  draw();
}

export function teardown() {
  containerRef = null;
  currentSlug = null;
  currentLang = 'en';
  delete window.__exLang;
}

function draw() {
  if (!containerRef || !currentSlug) return;
  const src = buildSrc();
  containerRef.innerHTML =
    '<div class="ex">' +
      '<div class="ex-toolbar">' +
        '<div class="ex-lang-toggle" role="tablist" aria-label="Preview language">' +
          '<button class="ex-lang' + (currentLang === 'en' ? ' ex-lang-active' : '') + '"' +
            ' role="tab" aria-selected="' + (currentLang === 'en' ? 'true' : 'false') + '"' +
            ' onclick="__exLang(\'en\')">EN</button>' +
          '<button class="ex-lang' + (currentLang === 'es' ? ' ex-lang-active' : '') + '"' +
            ' role="tab" aria-selected="' + (currentLang === 'es' ? 'true' : 'false') + '"' +
            ' onclick="__exLang(\'es\')">ES</button>' +
        '</div>' +
        '<a class="btn btn-outline" href="' + esc(src) + '" target="_blank" rel="noopener">Open in new tab ↗</a>' +
      '</div>' +
      '<div class="ex-frame">' +
        '<iframe src="' + esc(src) + '" title="Property preview: ' + esc(currentSlug) + '"' +
        ' loading="lazy" allow="autoplay; fullscreen"></iframe>' +
      '</div>' +
    '</div>';

  window.__exLang = setLang;
}

function setLang(lg) {
  if (lg !== 'en' && lg !== 'es') return;
  if (lg === currentLang) return;
  currentLang = lg;
  draw();
}

function buildSrc() {
  return 'index.html?property=' + encodeURIComponent(currentSlug) + '&lang=' + currentLang;
}
