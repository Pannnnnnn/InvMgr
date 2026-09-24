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

/**
 * Manager-only routes (catalog writes, stock adjustments, the AI stock-
 * intake scan). Role is read from the user's `app_metadata.role` — set via
 * the Supabase dashboard (Authentication → Users → edit user → App
 * Metadata → `{"role": "manager"}`), NOT `user_metadata`, which the user
 * themselves can edit and so can't be trusted for authorization. Throws a
 * 401 if unauthenticated, 403 if authenticated but not a manager.
 */
export async function requireManager(req: NextRequest): Promise<string> {
  const user = await getUserOptional(req);
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Missing or invalid Authorization bearer token.');
  }
  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  if (role !== 'manager') {
    throw new ApiError(403, 'FORBIDDEN', 'This action requires a manager account.');
  }
  return user.id;
}
