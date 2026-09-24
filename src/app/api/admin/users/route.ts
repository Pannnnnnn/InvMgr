import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ApiError, jsonError, ok } from '@/lib/http';
import { requireOwner } from '@/lib/auth';

type AppMeta = { status?: string; clearance?: number };

/**
 * GET /api/admin/users — owner-only. Lists every Supabase Auth user with
 * their approval status/clearance, for the /admin panel. Supabase Auth's
 * admin listUsers() is paginated (default 50/page); this app's user count
 * is small (a factory floor's managers/owners), so a single page of 200
 * covers it — revisit with real pagination if that stops being true.
 */
export async function GET(req: NextRequest) {
  try {
    await requireOwner(req);

    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new ApiError(500, 'DB_ERROR', error.message);

    const users = data.users
      .map((u) => {
        const meta = (u.app_metadata as AppMeta | undefined) ?? {};
        return {
          id: u.id,
          email: u.email ?? null,
          name: (u.user_metadata as { name?: string } | undefined)?.name ?? null,
          created_at: u.created_at,
          status: meta.status ?? 'pending',
          clearance: meta.clearance ?? null,
        };
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    return ok({ users });
  } catch (err) {
    return jsonError(err);
  }
}
