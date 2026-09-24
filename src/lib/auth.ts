import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';
import { ApiError } from './http';

/**
 * Resolves the operator (Supabase Auth user) making this request from the
 * `Authorization: Bearer <access_token>` header set by the frontend after
 * Supabase Auth sign-in. Throws a 401 ApiError if missing/invalid.
 *
 * Routes that must never block the counter (see PRD 7 — fault tolerance)
 * should use `getOperatorIdOptional` instead and fall back to a null
 * operator_id rather than rejecting the checkout outright.
 */
export async function requireOperatorId(req: NextRequest): Promise<string> {
  const id = await getOperatorIdOptional(req);
  if (!id) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Missing or invalid Authorization bearer token.');
  }
  return id;
}

export async function getOperatorIdOptional(req: NextRequest): Promise<string | null> {
  const user = await getUserOptional(req);
  return user?.id ?? null;
}

async function getUserOptional(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

type AppMeta = { status?: string; clearance?: number };

function readAppMeta(user: { app_metadata?: unknown }): AppMeta {
  return (user.app_metadata as AppMeta | undefined) ?? {};
}

/**
 * Approved-staff routes (catalog writes, stock adjustments, the AI stock-
 * intake scan) — clearance 1 (owner) or 2 (manager), both count. Role lives
 * in `app_metadata` (`{"status":"approved","clearance":1|2}`), set only by
 * an owner via the /admin panel (or, for the very first owner account, the
 * Supabase dashboard — see README) — never `user_metadata`, which the user
 * themselves can edit and so can't be trusted for authorization. Throws a
 * 401 if unauthenticated, 403 if authenticated but not approved.
 */
export async function requireManager(req: NextRequest): Promise<string> {
  const user = await getUserOptional(req);
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Missing or invalid Authorization bearer token.');
  }
  const meta = readAppMeta(user);
  if (meta.status !== 'approved' || (meta.clearance !== 1 && meta.clearance !== 2)) {
    throw new ApiError(403, 'FORBIDDEN', 'This action requires an approved manager or owner account.');
  }
  return user.id;
}

/**
 * Owner-only routes — clearance 1 exclusively (approving/rejecting
 * signups, changing someone's clearance level). See requireManager() above
 * for the shared approved-staff check.
 */
export async function requireOwner(req: NextRequest): Promise<string> {
  const user = await getUserOptional(req);
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Missing or invalid Authorization bearer token.');
  }
  const meta = readAppMeta(user);
  if (meta.status !== 'approved' || meta.clearance !== 1) {
    throw new ApiError(403, 'FORBIDDEN', 'This action requires an owner (clearance 1) account.');
  }
  return user.id;
}
