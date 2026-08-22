import { getLocalized } from './agent-data.js';

const JSON_LD_ID = 'agentStructuredData';
const DEFAULT_TITLE = 'Larum Agent Profile Experience';
const DEFAULT_DESCRIPTION = 'Larum Agent Profile Experience.';

export function updateAgentSeo(profile, language) {
  const { agent } = profile;
  const roleLine = [agent.role, agent.agency].filter(Boolean).join(' · ');
  const title = [agent.name, roleLine, 'Larum'].filter(Boolean).join(' — ');
  const bio = getLocalized(agent.bio, language).replace(/\s+/g, ' ');
  const description = truncate(bio || [agent.name, roleLine].filter(Boolean).join(', '), 158) || DEFAULT_DESCRIPTION;
  const canonical = buildCanonical(agent.slug, language);

  document.title = title || DEFAULT_TITLE;
  setMeta('name', 'description', description);
  setMeta('property', 'og:type', 'profile');
  setMeta('property', 'og:title', title || DEFAULT_TITLE);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', canonical);
  setMeta('property', 'og:image', agent.photoUrl || '');
  setMeta('name', 'twitter:card', agent.photoUrl ? 'summary_large_image' : 'summary');
  setMeta('name', 'twitter:title', title || DEFAULT_TITLE);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', agent.photoUrl || '');
  setCanonical(canonical);

  if (profile.source === 'database') addPersonStructuredData(profile, language, canonical, description);
  else removeStructuredData();
}

export function resetAgentSeo(language = 'en') {
  document.title = DEFAULT_TITLE;
  document.documentElement.lang = language === 'es' ? 'es' : 'en';
  setMeta('name', 'description', DEFAULT_DESCRIPTION);
  setMeta('property', 'og:title', DEFAULT_TITLE);
  setMeta('property', 'og:description', DEFAULT_DESCRIPTION);
  setMeta('property', 'og:url', currentDocumentUrl());
  setMeta('property', 'og:image', '');
  setMeta('name', 'twitter:title', DEFAULT_TITLE);
  setMeta('name', 'twitter:description', DEFAULT_DESCRIPTION);
  setMeta('name', 'twitter:image', '');
  setCanonical(currentDocumentUrl());
  removeStructuredData();
}

export function buildCanonical(slug, language) {
  const url = new URL('/agent.html', window.location.origin);
  url.searchParams.set('agent', slug);
  url.searchParams.set('lang', language === 'es' ? 'es' : 'en');
  return url.href;
}

function addPersonStructuredData(profile, language, canonical, description) {
  const { agent } = profile;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: agent.name,
    url: canonical,
    description
  };

  if (agent.role) data.jobTitle = agent.role;
  if (agent.agency) data.worksFor = { '@type': 'Organization', name: agent.agency };
  if (agent.photoUrl) data.image = agent.photoUrl;
  if (agent.email) data.email = `mailto:${agent.email}`;
  if (agent.phone) data.telephone = agent.phone;

  let script = document.getElementById(JSON_LD_ID);
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = JSON_LD_ID;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
  document.documentElement.lang = language === 'es' ? 'es' : 'en';
}

function removeStructuredData() {
  document.getElementById(JSON_LD_ID)?.remove();
}

function setMeta(attribute, key, value) {
  let element = [...document.head.querySelectorAll('meta')]
    .find(meta => meta.getAttribute(attribute) === key);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  if (value) element.setAttribute('content', value);
  else element.removeAttribute('content');
}

function setCanonical(value) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = value;
}

function currentDocumentUrl() {
  const url = new URL(window.location.href);
  url.hash = '';
  return url.href;
}

function truncate(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
