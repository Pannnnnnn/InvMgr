import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { ApiError, jsonError, ok } from '@/lib/http';

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

/**
 * POST /api/auth/register — public self-registration for the
 * inventory-management (owner/manager) side of the app. Floor checkout
 * (/checkout) stays account-free and is unaffected by this.
 *
 * Creates a real Supabase Auth user right away (so the email is claimed
 * and they can sign in), but with `app_metadata.status = 'pending'` —
 * every gated page/route (requireManager/requireOwner in src/lib/auth.ts)
 * treats a non-'approved' user as unauthorized until an owner (clearance 1)
 * approves them from /admin and assigns clearance 1 or 2.
 *
 * app_metadata (not user_metadata) is used because only the service-role
 * key can write it — a signed-in user can never approve themselves.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => {
      throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
    });
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid registration details.', parsed.error.flatten());
    }
    const { name, email, password } = parsed.data;

    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { name } : undefined,
      app_metadata: { status: 'pending' },
    });

    if (error) {
      const taken = /already.*registered|already.*exists/i.test(error.message);
      throw new ApiError(taken ? 409 : 400, taken ? 'EMAIL_TAKEN' : 'REGISTER_FAILED', error.message);
    }

    return ok({ id: data.user?.id, status: 'pending' }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
