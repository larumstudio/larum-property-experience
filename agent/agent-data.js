const ACTIVE_AGENT_STATUS = 'active';
const PUBLIC_PROPERTY_STATUS = 'published';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

export async function loadAgentExperience({ slug, provider }) {
  const requestedSlug = cleanText(slug);
  const safeSlug = cleanSlug(requestedSlug);

  if (!requestedSlug) {
    return Object.freeze({ state: 'missing-slug', agent: null, properties: [], source: provider?.source || null });
  }
  if (!safeSlug) {
    return Object.freeze({ state: 'not-found', agent: null, properties: [], source: provider?.source || null });
  }

  assertProvider(provider);

  const rawAgent = await provider.getAgentBySlug(safeSlug);
  if (!rawAgent) {
    return Object.freeze({ state: 'not-found', agent: null, properties: [], source: provider.source || null });
  }

  const agent = normaliseAgent(rawAgent, provider.source);
  if (!agent) {
    throw new Error('Agent provider returned an invalid presentation record.');
  }

  if (agent.status !== ACTIVE_AGENT_STATUS) {
    return Object.freeze({ state: 'inactive', agent, properties: [], source: agent.source });
  }

  const [rawProperties, rawPageConfiguration] = await Promise.all([
    provider.getPropertiesByAgentId(agent.id),
    provider.getPageConfigurationByAgentId(agent.id)
  ]);

  const properties = (Array.isArray(rawProperties) ? rawProperties : [])
    .map(item => normaliseProperty(item))
    .filter(Boolean)
    .filter(item => item.agentId === agent.id && item.status === PUBLIC_PROPERTY_STATUS)
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));

  return Object.freeze({
    state: 'ready',
    agent,
    properties: Object.freeze(properties),
    pageConfiguration: normalisePageConfiguration(rawPageConfiguration),
    source: agent.source
  });
}

export function normaliseAgent(raw, providerSource = null) {
  if (!raw || typeof raw !== 'object') return null;

  const id = cleanText(raw.id);
  const slug = cleanSlug(raw.slug);
  const name = cleanText(raw.name);
  const status = cleanText(raw.status).toLowerCase();

  if (!id || !slug || !name || !status) return null;

  return Object.freeze({
    id,
    slug,
    name,
    status,
    role: cleanText(raw.role),
    agency: cleanText(raw.agency),
    photoUrl: safeWebUrl(raw.photoUrl ?? raw.photo_url),
    bio: Object.freeze(normaliseLocalized(raw.bio)),
    email: safeEmail(raw.email),
    phone: safePhone(raw.phone),
    source: cleanText(providerSource || raw.source || 'unknown').toLowerCase()
  });
}

export function normaliseProperty(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = cleanText(raw.id);
  const slug = cleanSlug(raw.slug);
  const agentId = cleanText(raw.agentId ?? raw.agent_id);
  const status = cleanText(raw.status).toLowerCase();

  if (!id || !slug || !agentId || !status) return null;

  const rawPrice = Number(raw.price);
  const rawOrder = Number(raw.order ?? raw.display_order);
  const currency = cleanText(raw.currency).toUpperCase();

  return Object.freeze({
    id,
    slug,
    agentId,
    name: Object.freeze({
      es: cleanText(raw.name?.es ?? raw.name_es),
      en: cleanText(raw.name?.en ?? raw.name_en)
    }),
    location: cleanText(raw.location),
    reference: cleanText(raw.reference),
    coverImage: safeWebUrl(raw.coverImage ?? raw.cover_image),
    propertyType: cleanText(raw.propertyType ?? raw.property_type),
    price: Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : null,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
    status,
    order: Number.isFinite(rawOrder) ? rawOrder : Number.MAX_SAFE_INTEGER
  });
}

export function normalisePageConfiguration(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const modules = Array.isArray(source.modules) ? source.modules : [];
  const normalizedModules = modules
    .map((module, index) => normaliseModuleConfiguration(module, index))
    .filter(Boolean);

  return Object.freeze({
    preset: cleanSlug(source.preset) || 'essential',
    modules: Object.freeze(normalizedModules)
  });
}

export function getLocalized(localized, language, fallbackLanguage) {
  if (!localized || typeof localized !== 'object') return '';
  const primary = language === 'es' ? 'es' : 'en';
  const fallback = fallbackLanguage || (primary === 'es' ? 'en' : 'es');
  return cleanText(localized[primary]) || cleanText(localized[fallback]);
}

export function buildPropertyExperienceUrl(slug, language) {
  const safeSlug = cleanSlug(slug);
  if (!safeSlug) return '';
  const lang = language === 'es' ? 'es' : 'en';
  return `/?property=${encodeURIComponent(safeSlug)}&lang=${lang}`;
}

export function safeWebUrl(value) {
  const input = cleanText(value);
  if (!input) return null;

  if (/^(?:\.\/|\.\.\/|\/)(?!\/)/.test(input)) return input;

  try {
    const parsed = new URL(input);
    return WEB_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch (error) {
    return null;
  }
}

export function safeEmail(value) {
  const email = cleanText(value).toLowerCase();
  if (!email || email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function safePhone(value) {
  const phone = cleanText(value);
  if (!phone || !/^[+\d][\d\s().-]{5,30}$/.test(phone)) return null;
  return phone;
}

export function phoneHref(phone) {
  const safe = safePhone(phone);
  if (!safe) return '';
  const normalized = safe.replace(/(?!^\+)\D/g, '');
  return normalized ? `tel:${normalized}` : '';
}

export function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normaliseLocalized(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const fallback = cleanText(value);
    return { es: fallback, en: fallback };
  }
  return {
    es: cleanText(value.es),
    en: cleanText(value.en)
  };
}

function cleanSlug(value) {
  const slug = cleanText(value).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : '';
}

function normaliseModuleConfiguration(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const type = cleanSlug(raw.type);
  if (!type) return null;

  const rawLimit = Number(raw.settings?.limit);
  const settings = {};
  if (Number.isInteger(rawLimit) && rawLimit > 0) {
    settings.limit = Math.min(rawLimit, 12);
  }

  return Object.freeze({
    type,
    enabled: raw.enabled !== false,
    variant: cleanSlug(raw.variant),
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
    settings: Object.freeze(settings)
  });
}

function assertProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new Error('Agent data provider is required.');
  }
  const methods = [
    'getAgentBySlug',
    'getPropertiesByAgentId',
    'getPageConfigurationByAgentId'
  ];
  if (methods.some(method => typeof provider[method] !== 'function')) {
    throw new Error('Agent data provider does not implement the required interface.');
  }
}
