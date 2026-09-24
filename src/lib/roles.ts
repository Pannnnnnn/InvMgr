import type { Session } from '@supabase/supabase-js';

/**
 * Mirrors the server-side check in src/lib/auth.ts's requireManager(): role
 * lives in app_metadata (admin-writable only — set via the Supabase
 * dashboard, Authentication → Users → edit user → App Metadata →
 * {"role": "manager"}), never user_metadata, which the signed-in user can
 * edit themselves and so can't be trusted for authorization.
 *
 * This client-side check is a UX convenience only (hide/show manager UI) —
 * the API routes are the real gate.
 */
export function isManager(session: Session | null): boolean {
  const role = (session?.user?.app_metadata as { role?: string } | undefined)?.role;
  return role === 'manager';
}
