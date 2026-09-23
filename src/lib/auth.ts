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
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
