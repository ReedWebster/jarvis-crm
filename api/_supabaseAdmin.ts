import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn(
    '[LITEHOUSE] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. ' +
    'LinkedIn OAuth storage will not work until these are configured.',
  );
}

export const supabaseAdmin = url && serviceKey
  ? createClient(url, serviceKey)
  : null;

