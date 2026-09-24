import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { ApiError, jsonError, ok } from '@/lib/http';
import { requireOwner } from '@/lib/auth';

const patchSchema = z.object({
  clearance: z.union([z.literal(1), z.literal(2)]),
});

/**
 * PATCH /api/admin/users/[id] — owner-only. Approves a pending signup (or
 * changes an already-approved user's level) by setting
 * `app_metadata.status = 'approved'` and `app_metadata.clearance` to 1
 * (dev/owner) or 2 (manager).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOwner(req);

    const body = await req.json().catch(() => {
      throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
    });
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'clearance must be 1 or 2.', parsed.error.flatten());
    }

    const { data, error } = await supabaseAdmin().auth.admin.updateUserById(params.id, {
      app_metadata: { status: 'approved', clearance: parsed.data.clearance },
    });
    if (error) throw new ApiError(500, 'DB_ERROR', error.message);

    return ok({ id: data.user.id, status: 'approved', clearance: parsed.data.clearance });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * DELETE /api/admin/users/[id] — owner-only. Rejects a pending signup (or
 * revokes an existing account) by deleting the Supabase Auth user outright
 * — the simplest correct behavior, since a rejected/revoked user has no
 * legitimate reason to keep a login.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ownerId = await requireOwner(req);
    if (ownerId === params.id) {
      throw new ApiError(400, 'CANNOT_SELF_DELETE', 'You cannot remove your own account.');
    }

    const { error } = await supabaseAdmin().auth.admin.deleteUser(params.id);
    if (error) throw new ApiError(500, 'DB_ERROR', error.message);

    return ok({ id: params.id, deleted: true });
  } catch (err) {
    return jsonError(err);
  }
}
