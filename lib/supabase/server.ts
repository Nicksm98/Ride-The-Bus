import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const envDebug = {
    hasUrl: !!url,
    hasKey: !!key,
    urlPrefix: url?.substring(0, 20),
    availableEnvKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
    nodeEnv: process.env.NODE_ENV
  };
  
  console.log('Environment check:', envDebug);
  
  if (!url || !key) {
    throw new Error(`Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. Debug: ${JSON.stringify(envDebug)}`);
  }
  return createClient(url, key);
}