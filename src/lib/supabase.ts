import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Server-only client using the service-role key: bypasses RLS. Every API
// route in this backend runs server-side (Next.js route handlers), so this
// is the client used for all DB/storage access. NEVER import this file or
// expose SUPABASE_SERVICE_ROLE_KEY in client/browser code.
let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}
