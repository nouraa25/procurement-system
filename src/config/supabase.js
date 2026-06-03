import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// In dev, proxy through Vite to avoid WebContainer cross-origin fetch restrictions
const clientUrl = import.meta.env.DEV
  ? `${window.location.origin}/supabase-proxy`
  : (supabaseUrl || 'https://placeholder.supabase.co');

export const supabase = createClient(clientUrl, supabaseAnonKey || 'placeholder-key');
