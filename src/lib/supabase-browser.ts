'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Browser-side client using the public anon key only — safe to ship to the
// client because RLS is enabled on every table (see supabase/migrations).
// Used solely for manager sign-in/sign-out; all data reads/writes go
// through our own API routes (src/app/api/**), which use the service-role
// key server-side.

const REMEMBER_PREF_KEY = 'factorylens.remember';

/**
 * "Keep me signed in" support: Supabase's client needs a single storage
 * object at construction time, but we want the choice between localStorage
 * (persists across browser restarts) and sessionStorage (cleared on close)
 * to be a per-login decision made on the login page. This adapter defers
 * that choice to read-time by checking a small preference flag — itself
 * always in localStorage since it has to survive whichever storage the
 * session ends up in.
 */
function getActiveStorage(): Storage {
  const remember = window.localStorage.getItem(REMEMBER_PREF_KEY) === '1';
  return remember ? window.localStorage : window.sessionStorage;
}

export function setRememberPreference(remember: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REMEMBER_PREF_KEY, remember ? '1' : '0');
}

const dynamicStorage = {
  getItem: (key: string) => getActiveStorage().getItem(key),
  setItem: (key: string, value: string) => getActiveStorage().setItem(key, value),
  removeItem: (key: string) => getActiveStorage().removeItem(key),
};

let _client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Check .env.local.'
      );
    }
    _client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storage: dynamicStorage },
    });
  }
  return _client;
}
