/* Development data only.
   These records deliberately mirror the relational production shape:
   agents and properties are separate collections joined by agent_id.
   Names, contact details, copy and portfolio entries are fictional. */

export const FIXTURE_AGENTS = Object.freeze([
  Object.freeze({
    id: 'fixture-agent-elena',
    slug: 'elena-rios',
    name: 'Elena Ríos',
    status: 'active',
    role: 'Property Advisor',
    agency: 'Larum Preview',
    photo_url: 'https://images.pexels.com/photos/13523528/pexels-photo-13523528.jpeg?auto=compress&cs=tinysrgb&w=1600',
    bio: Object.freeze({
      en: 'A focused, measured approach to residential property—beginning with close listening and continuing through a clear, carefully presented selection.\n\nEach conversation is shaped around what matters to the client, while every home is allowed to communicate through its architecture, atmosphere and context.',
      es: 'Un enfoque sereno y preciso sobre la propiedad residencial, que comienza con una escucha atenta y continúa con una selección clara y cuidadosamente presentada.\n\nCada conversación se articula en torno a lo que importa al cliente, mientras cada vivienda se expresa a través de su arquitectura, su atmósfera y su contexto.'
    }),
    email: 'elena.rios@example.com',
    phone: '+1 202 555 0147',
    source: 'fixture'
  }),
  Object.freeze({
    id: 'fixture-agent-julian',
    slug: 'julian-hart',
    name: 'Julian Hart',
    status: 'active',
    role: 'Residential Property Advisor',
    agency: 'Larum Preview',
    photo_url: null,
    bio: Object.freeze({
      en: 'A concise profile fixture used to verify a restrained single-property experience and controlled language fallback.',
      es: ''
    }),
    email: null,
    phone: '+1 202 555 0182',
    source: 'fixture'
  })
]);

export const FIXTURE_PROPERTIES = Object.freeze([
  Object.freeze({
    id: 'fixture-property-01',
    slug: 'madrid',
    agent_id: 'fixture-agent-elena',
    name_es: 'The Light of Goya',
    name_en: 'The Light of Goya',
    location: 'Madrid · Goya',
    reference: 'M1558',
    cover_image: './assets/hero-madrid.jpg',
    property_type: 'resale',
    price: 3796000,
    currency: 'EUR',
    status: 'published',
    display_order: 1
  }),
  Object.freeze({
    id: 'fixture-property-02',
    slug: 'marbella',
    agent_id: 'fixture-agent-elena',
    name_es: 'The Private Resort',
    name_en: 'The Private Resort',
    location: 'Nueva Andalucía · Marbella',
    reference: 'NVG-H11',
    cover_image: './assets/hero-marbella.jpg',
    property_type: 'new',
    price: 3990000,
    currency: 'EUR',
    status: 'published',
    display_order: 2
  }),
  Object.freeze({
    id: 'fixture-property-draft',
    slug: 'unpublished-fixture',
    agent_id: 'fixture-agent-elena',
    name_es: 'No debe mostrarse',
    name_en: 'Must not be shown',
    location: 'Development only',
    reference: 'DRAFT',
    cover_image: null,
    property_type: 'resale',
    price: 1,
    currency: 'EUR',
    status: 'draft',
    display_order: 99
  })
]);

export const FIXTURE_PAGE_CONFIGURATIONS = Object.freeze([
  Object.freeze({
    agent_id: 'fixture-agent-elena',
    preset: 'signature',
    modules: Object.freeze([
      Object.freeze({ type: 'hero', enabled: true, variant: 'portrait-split' }),
      Object.freeze({ type: 'story', enabled: true, variant: 'editorial-split' }),
      Object.freeze({ type: 'properties', enabled: true, variant: 'asymmetric-grid', settings: Object.freeze({ limit: 2 }) }),
      Object.freeze({ type: 'contact', enabled: true, variant: 'editorial-split' }),
      Object.freeze({ type: 'footer', enabled: true, variant: 'minimal' })
    ])
  }),
  Object.freeze({
    agent_id: 'fixture-agent-julian',
    preset: 'essential',
    modules: Object.freeze([
      Object.freeze({ type: 'hero', enabled: true, variant: 'quiet-monogram' }),
      Object.freeze({ type: 'properties', enabled: true, variant: 'single-feature', settings: Object.freeze({ limit: 1 }) }),
      Object.freeze({ type: 'story', enabled: true, variant: 'compact' }),
      Object.freeze({ type: 'contact', enabled: true, variant: 'compact' }),
      Object.freeze({ type: 'footer', enabled: true, variant: 'minimal' })
    ])
  })
]);

const FIXTURE_SCENARIOS = new Set([
  'default',
  'empty',
  'single',
  'missing-photo',
  'missing-bio',
  'missing-email',
  'missing-phone',
  'missing-contact',
  'missing-cover',
  'error'
]);

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function applyAgentScenario(agent, scenario) {
  const output = clone(agent);
  if (scenario === 'missing-photo') output.photo_url = null;
  if (scenario === 'missing-bio') output.bio = { en: '', es: '' };
  if (scenario === 'missing-email' || scenario === 'missing-contact') output.email = null;
  if (scenario === 'missing-phone' || scenario === 'missing-contact') output.phone = null;
  return output;
}

function applyPropertyScenario(properties, scenario) {
  let output = clone(properties);
  if (scenario === 'empty') return [];
  if (scenario === 'single') output = output.slice(0, 1);
  if (scenario === 'missing-cover' && output[0]) output[0].cover_image = null;
  return output;
}

export function fixtureProvider(options = {}) {
  const requestedScenario = String(options.scenario || 'default').trim();
  const scenario = FIXTURE_SCENARIOS.has(requestedScenario) ? requestedScenario : 'default';

  return Object.freeze({
    source: 'fixture',

    async getAgentBySlug(slug) {
      if (scenario === 'error') throw new Error('Fixture provider error');
      const agent = FIXTURE_AGENTS.find(item => item.slug === slug);
      return agent ? applyAgentScenario(agent, scenario) : null;
    },

    async getPropertiesByAgentId(agentId) {
      if (scenario === 'error') throw new Error('Fixture provider error');
      const properties = FIXTURE_PROPERTIES.filter(item => item.agent_id === agentId);
      return applyPropertyScenario(properties, scenario);
    },

    async getPageConfigurationByAgentId(agentId) {
      if (scenario === 'error') throw new Error('Fixture provider error');
      const configuration = FIXTURE_PAGE_CONFIGURATIONS.find(item => item.agent_id === agentId);
      return configuration ? clone(configuration) : null;
    }
  });
}

