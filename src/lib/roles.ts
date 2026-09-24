import type { Session } from '@supabase/supabase-js';

/**
 * Clearance model (2026-09-24 registration/approval update):
 *  - New users self-register via /register and land with no `clearance` in
 *    app_metadata (`status: 'pending'`) — they can sign in but every gated
 *    page/route treats them as unapproved until an owner approves them.
 *  - Clearance 1 = dev/owner: full manager-level access, plus the /admin
 *    approval panel.
 *  - Clearance 2 = manager: same inventory/transactions access as before,
 *    no /admin access.
 * Mirrors the server-side checks in src/lib/auth.ts (requireManager /
 * requireOwner) — this file is a client-side UX convenience only (hide/show
 * nav links, redirect messaging); the API routes are the real gate.
 */
export type Clearance = 1 | 2;

type AppMeta = { status?: 'pending' | 'approved' | 'rejected'; clearance?: Clearance };

function appMeta(session: Session | null): AppMeta {
  return (session?.user?.app_metadata as AppMeta | undefined) ?? {};
}

/** The user's clearance level, or null if unapproved/not signed in. */
export function getClearance(session: Session | null): Clearance | null {
  const meta = appMeta(session);
  if (meta.status !== 'approved') return null;
  return meta.clearance === 1 || meta.clearance === 2 ? meta.clearance : null;
}

/** True for clearance 1 (owner) or 2 (manager) — any approved staff account. */
export function isApproved(session: Session | null): boolean {
  return getClearance(session) !== null;
}

/** True for clearance 1 only — dev/owner, can access /admin. */
export function isOwner(session: Session | null): boolean {
  return getClearance(session) === 1;
}

/** True for a signed-in user who registered but hasn't been approved yet. */
export function isPending(session: Session | null): boolean {
  return !!session && appMeta(session).status !== 'approved';
}

/** Back-compat alias: clearance 1 and 2 both have manager-level access. */
export const isManager = isApproved;
