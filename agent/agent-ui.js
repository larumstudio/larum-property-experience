import {
  buildPropertyExperienceUrl,
  getLocalized,
  phoneHref
} from './agent-data.js';
import { t, translatePropertyType } from './agent-i18n.js';

export const MODULE_REGISTRY = Object.freeze({
  hero: Object.freeze({
    required: true,
    navId: 'profile',
    navCopy: 'navProfile',
    defaultVariant: 'portrait-split',
    variants: Object.freeze(['portrait-split', 'quiet-monogram']),
    hasContent: profile => Boolean(profile.agent?.name),
    renderer: renderHero
  }),
  story: Object.freeze({
    required: false,
    navId: 'approach',
    navCopy: 'navApproach',
    defaultVariant: 'editorial-split',
    variants: Object.freeze(['editorial-split', 'compact']),
    hasContent: (profile, language) => Boolean(getLocalized(profile.agent?.bio, language)),
    renderer: renderApproach
  }),
  properties: Object.freeze({
    required: true,
    navId: 'properties',
    navCopy: 'navProperties',
    defaultVariant: 'asymmetric-grid',
    variants: Object.freeze(['asymmetric-grid', 'single-feature']),
    hasContent: () => true,
    renderer: renderProperties
  }),
  contact: Object.freeze({
    required: false,
    navId: 'contact',
    navCopy: 'navContact',
    defaultVariant: 'editorial-split',
    variants: Object.freeze(['editorial-split', 'compact']),
    hasContent: profile => Boolean(profile.agent?.email || profile.agent?.phone),
    renderer: renderContact
  }),
  footer: Object.freeze({
    required: true,
    navId: null,
    navCopy: null,
    defaultVariant: 'minimal',
    variants: Object.freeze(['minimal']),
    hasContent: () => true,
    renderer: ({ language, module }) => renderFooter(language, module.variant)
  })
});

validateModuleRegistry(MODULE_REGISTRY);

const REQUIRED_MODULES = Object.freeze(['hero', 'properties', 'footer']);

export function resolveModules(profile, language) {
  const configured = [...(profile.pageConfiguration?.modules || [])]
    .sort((a, b) => a.order - b.order);
  const resolved = [];
  const seen = new Set();

  for (const configuration of configured) {
    const definition = MODULE_REGISTRY[configuration.type];
    if (!definition || seen.has(configuration.type)) continue;
    seen.add(configuration.type);
    if (!configuration.enabled && !definition.required) continue;
    if (!definition.hasContent(profile, language)) continue;
    resolved.push(resolveModule(configuration.type, configuration));
  }

  for (const type of REQUIRED_MODULES) {
    if (!resolved.some(module => module.type === type)) {
      resolved.push(resolveModule(type, null));
    }
  }

  const hero = resolved.find(module => module.type === 'hero');
  const footer = resolved.find(module => module.type === 'footer');
  const middle = resolved.filter(module => module.type !== 'hero' && module.type !== 'footer');
  const propertyIndex = middle.findIndex(module => module.type === 'properties');

  if (propertyIndex > 1) {
    const [properties] = middle.splice(propertyIndex, 1);
    middle.splice(1, 0, properties);
  }

  return Object.freeze([hero, ...middle, footer].filter(Boolean));
}

export function renderAgentPage(profile, language) {
  const modules = resolveModules(profile, language);
  const mainModules = modules.filter(module => module.type !== 'footer');
  const footerModule = modules.find(module => module.type === 'footer');
  const preset = profile.pageConfiguration?.preset || 'essential';
  const context = { profile, language, modules: mainModules };

  return `
    <div class="agent-shell agent-preset--${escapeAttribute(preset)}" data-page-preset="${escapeAttribute(preset)}">
      ${renderHeader({ language, modules: mainModules })}

      <main id="agentMain" tabindex="-1">
        ${mainModules.map((module, index) => renderModule(module, {
          ...context,
          position: index + 1,
          total: mainModules.length,
          nextModule: mainModules[index + 1] || null
        })).join('')}
      </main>

      ${footerModule ? renderModule(footerModule, {
        ...context,
        position: mainModules.length + 1,
        total: mainModules.length,
        nextModule: null
      }) : ''}
    </div>`;
}

export function renderPageState(state, language) {
  const content = stateCopy(state, language);
  const showRetry = state === 'error';
  const footerModule = resolveModule('footer', null);

  return `
    <div class="agent-shell agent-shell--state">
      ${renderStateHeader(language)}
      <main id="agentMain" class="agent-state" tabindex="-1">
        <div class="agent-state__number" aria-hidden="true">${state === 'not-found' ? '404' : '—'}</div>
        <div class="agent-state__content">
          <p class="agent-eyebrow">${escapeHtml(content.eyebrow)}</p>
          <h1>${escapeHtml(content.title)}</h1>
          <p>${escapeHtml(content.body)}</p>
          ${showRetry ? `<button class="agent-text-link agent-state__retry" type="button" data-retry>${escapeHtml(t(language, 'retry'))}<span aria-hidden="true">↗</span></button>` : ''}
        </div>
      </main>
      ${renderModule(footerModule, { profile: null, language, modules: [], position: 0, total: 0, nextModule: null })}
    </div>`;
}

export function initializeAgentUi(root, options = {}) {
  const onLanguageChange = typeof options.onLanguageChange === 'function'
    ? options.onLanguageChange
    : () => {};
  const onRetry = typeof options.onRetry === 'function' ? options.onRetry : () => {};
  const controller = new AbortController();
  const { signal } = controller;

  bindLanguageControls(root, onLanguageChange, signal);
  bindMobileNavigation(root, signal);
  bindImageFallbacks(root, signal);
  bindRetry(root, onRetry, signal);
  const observers = observeSections(root);
  bindHeaderState(root, signal);

  return () => {
    controller.abort();
    observers.forEach(observer => observer.disconnect());
  };
}

export function validateModuleRegistry(registry) {
  for (const [type, definition] of Object.entries(registry)) {
    if (!definition || typeof definition.renderer !== 'function') {
      throw new Error(`Agent module "${type}" is registered without a valid renderer.`);
    }
  }
}

function resolveModule(type, configuration) {
  const definition = MODULE_REGISTRY[type];
  const requestedVariant = configuration?.variant || '';
  const variant = definition.variants.includes(requestedVariant)
    ? requestedVariant
    : definition.defaultVariant;

  return Object.freeze({
    type,
    variant,
    settings: configuration?.settings || Object.freeze({})
  });
}

function renderModule(module, context) {
  const definition = MODULE_REGISTRY[module?.type];
  if (!definition || typeof definition.renderer !== 'function') return '';
  return definition.renderer({ ...context, module });
}

function renderHeader({ language, modules }) {
  const navigationModules = modules.filter(module => MODULE_REGISTRY[module.type]?.navId);
  return `
    <header class="agent-header" data-agent-header>
      <a class="agent-brand" href="#profile" aria-label="Larum — ${escapeAttribute(t(language, 'navProfile'))}">
        <span>LARUM</span>
        <small>${escapeHtml(t(language, 'brandSubline'))}</small>
      </a>

      <button class="agent-menu-toggle" type="button" aria-expanded="false" aria-controls="agentNavigation" data-menu-toggle>
        <span class="agent-menu-toggle__icon" aria-hidden="true"><i></i><i></i></span>
        <span data-menu-label>${escapeHtml(t(language, 'menuOpen'))}</span>
      </button>

      <nav id="agentNavigation" class="agent-nav" aria-label="${escapeAttribute(t(language, 'navLabel'))}" data-agent-nav>
        <div class="agent-nav__links">
          ${navigationModules.map((module, index) => {
            const definition = MODULE_REGISTRY[module.type];
            return navLink(definition.navId, t(language, definition.navCopy), index === 0);
          }).join('')}
        </div>
        ${renderLanguageToggle(language)}
      </nav>
    </header>`;
}

function renderStateHeader(language) {
  return `
    <header class="agent-header agent-header--solid" data-agent-header>
      <a class="agent-brand" href="agent.html" aria-label="Larum">
        <span>LARUM</span>
        <small>${escapeHtml(t(language, 'brandSubline'))}</small>
      </a>
      ${renderLanguageToggle(language, true)}
    </header>`;
}

function renderLanguageToggle(language, compact = false) {
  return `
    <div class="agent-language${compact ? ' agent-language--compact' : ''}" role="group" aria-label="${escapeAttribute(t(language, 'languageLabel'))}">
      <button type="button" data-language="es" aria-pressed="${language === 'es'}"${language === 'es' ? ' class="is-active"' : ''}>ES</button>
      <span aria-hidden="true">/</span>
      <button type="button" data-language="en" aria-pressed="${language === 'en'}"${language === 'en' ? ' class="is-active"' : ''}>EN</button>
    </div>`;
}

function navLink(id, label, current = false) {
  return `<a href="#${id}" data-nav-link="${id}"${current ? ' aria-current="location"' : ''}>${escapeHtml(label)}</a>`;
}

function renderHero({ profile, language, module, position, total, nextModule, modules }) {
  const { agent } = profile;
  const identityMeta = [agent.role, agent.agency].filter(Boolean);
  const initials = getInitials(agent.name);
  const hasContact = modules.some(item => item.type === 'contact');
  const nextSection = MODULE_REGISTRY[nextModule?.type]?.navId || 'properties';

  return `
    <section id="profile" class="agent-hero agent-hero--${escapeAttribute(module.variant)}" aria-labelledby="agentName" data-section="profile" data-module="hero" data-variant="${escapeAttribute(module.variant)}">
      <div class="agent-hero__rail" aria-hidden="true">
        <span>${formatIndex(position)}</span><i></i><span>${formatIndex(total)}</span>
      </div>

      <div class="agent-hero__content agent-reveal">
        <p class="agent-eyebrow">${escapeHtml(t(language, 'agentProfile'))}</p>
        <h1 id="agentName">${renderName(agent.name)}</h1>
        ${identityMeta.length ? `<p class="agent-hero__meta">${identityMeta.map(escapeHtml).join('<span aria-hidden="true">·</span>')}</p>` : ''}
        <div class="agent-hero__actions">
          <a class="agent-action agent-action--primary" href="#properties">${escapeHtml(t(language, 'explorePortfolio'))}<span aria-hidden="true">↘</span></a>
          ${hasContact ? `<a class="agent-action" href="#contact">${escapeHtml(t(language, 'contactAgent'))}<span aria-hidden="true">↗</span></a>` : ''}
        </div>
      </div>

      <figure class="agent-portrait${agent.photoUrl ? '' : ' is-image-missing'}" data-image-frame>
        ${agent.photoUrl ? `<img src="${escapeAttribute(agent.photoUrl)}" alt="${escapeAttribute(agent.name)}" loading="eager" decoding="async" fetchpriority="high" data-fallback-image />` : ''}
        <div class="agent-portrait__fallback" aria-hidden="true"><span>${escapeHtml(initials)}</span></div>
        <figcaption>
          ${agent.role ? `<strong>${escapeHtml(agent.role)}</strong>` : ''}
          ${agent.agency ? `<span>${escapeHtml(agent.agency)}</span>` : ''}
        </figcaption>
      </figure>

      <a class="agent-scroll-cue" href="#${escapeAttribute(nextSection)}" aria-label="${escapeAttribute(t(language, 'scrollToExplore'))}">
        <span>${escapeHtml(t(language, 'scrollToExplore'))}</span><i aria-hidden="true"></i>
      </a>
    </section>`;
}

function renderApproach({ profile, language, module, position }) {
  const { agent } = profile;
  const bio = getLocalized(agent.bio, language);
  const paragraphs = bio.split(/\n{2,}/).filter(Boolean);
  return `
    <section id="approach" class="agent-approach agent-approach--${escapeAttribute(module.variant)}" aria-labelledby="approachTitle" data-section="approach" data-module="story" data-variant="${escapeAttribute(module.variant)}">
      <div class="agent-section-index agent-reveal" aria-hidden="true">${formatIndex(position)}</div>
      <div class="agent-approach__title agent-reveal">
        <p class="agent-eyebrow">${escapeHtml(t(language, 'approachEyebrow'))}</p>
        <h2 id="approachTitle">${escapeHtml(t(language, 'approachTitle'))}</h2>
      </div>
      <div class="agent-approach__copy agent-reveal">
        ${paragraphs.map((paragraph, index) => `<p${index === 0 ? ' class="agent-approach__lead"' : ''}>${escapeHtml(paragraph)}</p>`).join('')}
        ${agent.role || agent.agency ? `<aside>${[agent.role, agent.agency].filter(Boolean).map(escapeHtml).join(' · ')}</aside>` : ''}
      </div>
      <div class="agent-approach__monogram" aria-hidden="true">${escapeHtml(getInitials(agent.name))}</div>
    </section>`;
}

function renderProperties({ profile, language, module, position }) {
  const limit = Number.isInteger(module.settings.limit) ? module.settings.limit : profile.properties.length;
  const properties = profile.properties.slice(0, limit);
  const count = properties.length;
  const countLabel = `${count} ${t(language, count === 1 ? 'propertySingular' : 'propertyPlural')}`;

  return `
    <section id="properties" class="agent-properties agent-properties--${escapeAttribute(module.variant)} agent-properties--count-${Math.min(count, 5)}" aria-labelledby="propertiesTitle" data-section="properties" data-module="properties" data-variant="${escapeAttribute(module.variant)}" data-property-limit="${limit}">
      <header class="agent-properties__header agent-reveal">
        <div>
          <p class="agent-eyebrow">${formatIndex(position)} · ${escapeHtml(t(language, 'propertiesEyebrow'))}</p>
          <h2 id="propertiesTitle">${escapeHtml(t(language, 'propertiesTitle'))}</h2>
        </div>
        <span class="agent-properties__count">${escapeHtml(countLabel)}</span>
      </header>
      ${count
        ? `<div class="agent-property-grid">${properties.map((property, index) => renderPropertyCard(property, language, index, count)).join('')}</div>`
        : renderEmptyProperties(language)}
    </section>`;
}

function renderPropertyCard(property, language, index, count) {
  const name = propertyName(property, language);
  const href = buildPropertyExperienceUrl(property.slug, language);
  const price = formatPrice(property.price, property.currency, language);
  const type = translatePropertyType(language, property.propertyType);
  const cardClass = [
    'agent-property-card',
    index === 0 && count > 1 ? 'agent-property-card--feature' : '',
    property.coverImage ? '' : 'is-image-missing',
    'agent-reveal'
  ].filter(Boolean).join(' ');

  return `
    <article class="${cardClass}">
      <a href="${escapeAttribute(href)}" aria-label="${escapeAttribute(`${name} — ${t(language, 'exploreProperty')}`)}">
        <figure data-image-frame>
          ${property.coverImage ? `<img src="${escapeAttribute(property.coverImage)}" alt="${escapeAttribute(name)}" loading="lazy" decoding="async" data-fallback-image />` : ''}
          <div class="agent-property-card__fallback" aria-hidden="true">
            <i></i><span>${escapeHtml(t(language, 'imageUnavailable'))}</span>
          </div>
          <div class="agent-property-card__shade" aria-hidden="true"></div>
          ${property.location ? `<span class="agent-property-card__location">${escapeHtml(property.location)}</span>` : ''}
          <figcaption>
            <div>
              <h3>${escapeHtml(name)}</h3>
              <p class="agent-property-card__meta">
                ${property.reference ? `<span>${escapeHtml(property.reference)}</span>` : ''}
                ${type ? `<span>${escapeHtml(type)}</span>` : ''}
              </p>
            </div>
            ${price ? `<strong>${escapeHtml(price)}</strong>` : ''}
          </figcaption>
          <span class="agent-property-card__cta">${escapeHtml(t(language, 'exploreProperty'))}<b aria-hidden="true">↗</b></span>
        </figure>
      </a>
    </article>`;
}

function renderEmptyProperties(language) {
  return `
    <div class="agent-empty-portfolio agent-reveal">
      <span aria-hidden="true">◇</span>
      <div>
        <h3>${escapeHtml(t(language, 'emptyPropertiesTitle'))}</h3>
        <p>${escapeHtml(t(language, 'emptyPropertiesBody'))}</p>
      </div>
    </div>`;
}

function renderContact({ profile, language, module, position }) {
  const { agent } = profile;
  const emailLink = agent.email ? `mailto:${agent.email}` : '';
  const telephoneLink = phoneHref(agent.phone);

  return `
    <section id="contact" class="agent-contact agent-contact--${escapeAttribute(module.variant)}" aria-labelledby="contactTitle" data-section="contact" data-module="contact" data-variant="${escapeAttribute(module.variant)}">
      <div class="agent-section-index agent-reveal" aria-hidden="true">${formatIndex(position)}</div>
      <div class="agent-contact__heading agent-reveal">
        <p class="agent-eyebrow">${escapeHtml(t(language, 'contactEyebrow'))}</p>
        <h2 id="contactTitle">${escapeHtml(t(language, 'contactTitle'))}</h2>
      </div>
      <div class="agent-contact__details agent-reveal">
        <p>${escapeHtml(t(language, 'contactIntro'))}</p>
        <address>
          ${emailLink ? contactLink(emailLink, t(language, 'email'), agent.email) : ''}
          ${telephoneLink ? contactLink(telephoneLink, t(language, 'phone'), agent.phone) : ''}
        </address>
      </div>
    </section>`;
}

function contactLink(href, label, value) {
  return `
    <a class="agent-contact-link" href="${escapeAttribute(href)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <b aria-hidden="true">↗</b>
    </a>`;
}

function renderFooter(language, variant = 'minimal') {
  return `
    <footer class="agent-footer agent-footer--${escapeAttribute(variant)}" data-module="footer" data-variant="${escapeAttribute(variant)}">
      <a class="agent-brand agent-brand--footer" href="#agentMain"><span>LARUM</span><small>Studio</small></a>
      <p>${escapeHtml(t(language, 'footerLine'))}</p>
      <span>© ${new Date().getFullYear()} Larum Studio</span>
    </footer>`;
}

function stateCopy(state, language) {
  const prefix = state === 'missing-slug' ? 'missingSlug'
    : state === 'inactive' ? 'inactive'
      : state === 'error' ? 'error'
        : 'notFound';
  return {
    eyebrow: t(language, `${prefix}Eyebrow`),
    title: t(language, `${prefix}Title`),
    body: t(language, `${prefix}Body`)
  };
}

function bindLanguageControls(root, onLanguageChange, signal) {
  root.querySelectorAll('[data-language]').forEach(button => {
    button.addEventListener('click', () => onLanguageChange(button.dataset.language), { signal });
  });
}

function bindMobileNavigation(root, signal) {
  const toggle = root.querySelector('[data-menu-toggle]');
  const nav = root.querySelector('[data-agent-nav]');
  const header = root.querySelector('[data-agent-header]');
  if (!toggle || !nav || !header) return;

  const label = toggle.querySelector('[data-menu-label]');
  const language = document.documentElement.lang === 'es' ? 'es' : 'en';

  const setOpen = open => {
    header.classList.toggle('is-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', t(language, open ? 'menuClose' : 'menuOpen'));
    if (label) label.textContent = t(language, open ? 'menuClose' : 'menuOpen');
  };

  setOpen(false);
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'), { signal });
  nav.querySelectorAll('a, button').forEach(control => control.addEventListener('click', () => setOpen(false), { signal }));
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  }, { signal });
}

function bindImageFallbacks(root, signal) {
  root.querySelectorAll('[data-fallback-image]').forEach(image => {
    const fail = () => {
      const frame = image.closest('[data-image-frame]');
      frame?.classList.add('is-image-missing');
      image.remove();
    };
    image.addEventListener('error', fail, { once: true, signal });
    if (image.complete && image.naturalWidth === 0) fail();
  });
}

function bindRetry(root, onRetry, signal) {
  root.querySelector('[data-retry]')?.addEventListener('click', onRetry, { signal });
}

function observeSections(root) {
  const sections = [...root.querySelectorAll('[data-section]')];
  const navLinks = [...root.querySelectorAll('[data-nav-link]')];
  const reveals = [...root.querySelectorAll('.agent-reveal')];

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveals.forEach(element => element.classList.add('is-revealed'));
    return [];
  }

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
  reveals.forEach(element => revealObserver.observe(element));

  if (!sections.length || !navLinks.length) return [revealObserver];
  const sectionObserver = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach(link => {
      if (link.dataset.navLink === visible.target.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { threshold: [0.1, 0.35], rootMargin: '-25% 0px -55% 0px' });
  sections.forEach(section => sectionObserver.observe(section));
  return [revealObserver, sectionObserver];
}

function bindHeaderState(root, signal) {
  const header = root.querySelector('[data-agent-header]');
  if (!header || header.classList.contains('agent-header--solid')) return;
  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
  update();
  window.addEventListener('scroll', update, { passive: true, signal });
}

function propertyName(property, language) {
  return getLocalized(property.name, language)
    || property.reference
    || property.location
    || humanizeSlug(property.slug);
}

function formatPrice(price, currency, language) {
  if (!Number.isFinite(price) || !currency) return '';
  try {
    return new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(price);
  } catch (error) {
    return '';
  }
}

function formatIndex(value) {
  return String(Number(value) || 0).padStart(2, '0');
}

function humanizeSlug(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length < 2) return escapeHtml(name);
  const last = parts.pop();
  return `${escapeHtml(parts.join(' '))}<br><em>${escapeHtml(last)}</em>`;
}

function getInitials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
