/* ── Larum Property Experience™ — Supabase Configuration ── */

const SUPABASE_URL = 'https://mtyemgfovvmjrsxevcgh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eWVtZ2ZvdnZtanJzeGV2Y2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMjgyMzUsImV4cCI6MjEwMTgwNDIzNX0.MT7Yy2rkEuVDR8jihtwkBw3bRlMGQT-DmaovuzLAIYo';

/* Supabase JS Client (loaded from CDN) */
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.supabaseClient = supabaseClient;
