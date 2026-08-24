import { createClient } from '@supabase/supabase-js';
import { hasPublicConfig, publicConfig } from './publicConfig.js';

export const hasSupabaseConfig = hasPublicConfig;

export const supabase = hasSupabaseConfig
  ? createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
