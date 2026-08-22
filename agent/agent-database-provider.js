export function databaseProvider() {
  const client = window.supabaseClient;
  if (!client) throw new Error('Supabase client not available.');

  return Object.freeze({
    source: 'database',

    async getAgentBySlug(slug) {
      const { data, error } = await client
        .from('agents')
        .select('id, slug, name, status, role, agency, photo_url, bio, email, phone')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },

    async getPropertiesByAgentId(agentId) {
      const { data, error } = await client
        .from('properties')
        .select('id, slug, status, agent_id, name_en, name_es, location, reference, cover_image, property_type, price, currency, display_order')
        .eq('agent_id', agentId)
        .order('display_order', { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    },

    async getPageConfigurationByAgentId(agentId) {
      const { data, error } = await client
        .from('agent_page_configurations')
        .select('preset, modules')
        .eq('agent_id', agentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }
  });
}
