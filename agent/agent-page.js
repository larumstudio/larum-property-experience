import { loadAgentExperience } from './agent-data.js';
import { databaseProvider } from './agent-database-provider.js';
import { fixtureProvider } from './agent-fixtures.js';
import { DEFAULT_LANGUAGE, normaliseLanguage, t } from './agent-i18n.js';
import { renderAgentPage, renderPageState, initializeAgentUi } from './agent-ui.js';
import { resetAgentSeo, updateAgentSeo } from './agent-seo.js';
import { init as initAnalytics, trackEvent } from './agent-analytics.js';

const root = document.getElementById('agentRoot');
const liveRegion = document.getElementById('agentStatus');
const skipLink = document.querySelector('.agent-skip-link');

let language = DEFAULT_LANGUAGE;
let currentProfile = null;
let currentState = 'loading';
let teardownUi = null;
let loading = false;

async function boot(options = {}) {
  if (!root || loading) return;
  loading = true;
  teardownUi?.();
  teardownUi = null;

  const url = new URL(window.location.href);
  language = normaliseLanguage(url.searchParams.get('lang'));
  const slug = url.searchParams.get('agent');
  const scenario = url.searchParams.get('scenario') || 'default';

  applyDocumentLanguage();
  setLiveStatus(t(language, 'loading'));

  try {
    const useFixtures = scenario !== 'default' || !window.supabaseClient;
    const provider = useFixtures ? fixtureProvider({ scenario }) : databaseProvider();
    const profile = await loadAgentExperience({ slug, provider });
    currentProfile = profile;
    currentState = profile.state;

    if (profile.state === 'ready') {
      if (!useFixtures && slug) initAnalytics(slug, language);
      renderReady({ focusMain: Boolean(options.focusMain) });
    } else {
      renderState(profile.state, { focusMain: Boolean(options.focusMain) });
    }
  } catch (error) {
    currentProfile = null;
    currentState = 'error';
    renderState('error', { focusMain: true });
  } finally {
    loading = false;
  }
}

function renderReady(options = {}) {
  if (!currentProfile || currentProfile.state !== 'ready') return;

  root.innerHTML = renderAgentPage(currentProfile, language);
  updateAgentSeo(currentProfile, language);
  applyDocumentLanguage();
  teardownUi = initializeAgentUi(root, {
    onLanguageChange: changeLanguage,
    onRetry: () => boot({ focusMain: true })
  });
  setLiveStatus(t(language, 'loaded'));
  if (options.focusMain) focusMain();
  bindAnalyticsTracking();
}

function renderState(state, options = {}) {
  root.innerHTML = renderPageState(state, language);
  resetAgentSeo(language);
  applyDocumentLanguage();
  teardownUi = initializeAgentUi(root, {
    onLanguageChange: changeLanguage,
    onRetry: () => boot({ focusMain: true })
  });
  setLiveStatus(state === 'error' ? t(language, 'errorTitle') : t(language, 'stateReady'));
  if (options.focusMain) focusMain();
}

function changeLanguage(nextLanguage) {
  const normalized = normaliseLanguage(nextLanguage);
  if (normalized === language) return;

  const scrollPosition = window.scrollY;
  language = normalized;

  const url = new URL(window.location.href);
  url.searchParams.set('lang', language);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

  teardownUi?.();
  teardownUi = null;

  if (currentState === 'ready') renderReady();
  else renderState(currentState);

  requestAnimationFrame(() => window.scrollTo(0, scrollPosition));
}

function applyDocumentLanguage() {
  document.documentElement.lang = language;
  if (skipLink) skipLink.textContent = t(language, 'skipToContent');
}

function setLiveStatus(message) {
  if (liveRegion) liveRegion.textContent = message;
}

function focusMain() {
  requestAnimationFrame(() => document.getElementById('agentMain')?.focus({ preventScroll: true }));
}

function bindAnalyticsTracking() {
  if (!root) return;

  root.addEventListener('click', e => {
    const propertyCard = e.target.closest('.agent-property-card a');
    if (propertyCard) {
      const slug = propertyCard.getAttribute('href')?.match(/[?&]property=([^&]+)/)?.[1] || '';
      trackEvent('property_click', { property: slug });
      return;
    }
    const contactLink = e.target.closest('.agent-contact-link');
    if (contactLink) {
      const href = contactLink.getAttribute('href') || '';
      const type = href.startsWith('mailto:') ? 'email' : href.startsWith('tel:') ? 'phone' : 'other';
      trackEvent('contact_click', { type });
    }
  });

  if ('IntersectionObserver' in window) {
    const seen = new Set();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const section = entry.target.dataset.section;
        if (section && !seen.has(section)) {
          seen.add(section);
          trackEvent('section_view', { section });
        }
      });
    }, { threshold: 0.25 });
    root.querySelectorAll('[data-section]').forEach(el => observer.observe(el));
  }
}

window.addEventListener('popstate', () => boot({ focusMain: true }));
boot();
