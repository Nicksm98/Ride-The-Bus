import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log('Environment check:', {
    hasUrl: !!url,
    hasKey: !!key,
    urlPrefix: url?.substring(0, 20),
    availableEnvKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
  });
  
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }
  return createClient(url, key);
}