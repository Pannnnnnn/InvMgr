import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { ApiError, jsonError, ok } from '@/lib/http';
import { requireOperatorId } from '@/lib/auth';

/**
 * GET /api/items?search=&category=&limit=&offset=
 * Real-time inventory catalog view (PRD 4.2): name, SKU, category, available
 * vs total quantity. `search` does a fuzzy match against name + aliases.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();
    const category = searchParams.get('category')?.trim();
    const limit = clampInt(searchParams.get('limit'), 50, 1, 200);
    const offset = clampInt(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

    let query = supabaseAdmin()
      .from('items')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category) query = query.eq('category', category);
    if (search) {
      // Match on name or any alias (aliases stored as text[]).
      query = query.or(`name.ilike.%${search}%,aliases.cs.{${escapeForArrayLiteral(search)}}`);
    }

    const { data, error, count } = await query;
    if (error) throw new ApiError(500, 'DB_ERROR', error.message);

    return ok({ items: data ?? [], total: count ?? 0, limit, offset });
  } catch (err) {
    return jsonError(err);
  }
}

const createItemSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().trim().min(1).nullable().optional(),
  aliases: z.array(z.string().min(1)).default([]),
  total_quantity: z.number().int().min(0).default(1),
  available_quantity: z.number().int().min(0).optional(),
});

/**
 * POST /api/items — add a new catalog item.
 * Requires an authenticated operator (auth.users). Unlike checkout, this is
 * not on the counter's critical path, so it's fine to require auth here.
 */
export async function POST(req: NextRequest) {
  try {
    await requireOperatorId(req);

    const body = await req.json().catch(() => {
      throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
    });
    const parsed = createItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid item payload.', parsed.error.flatten());
    }

    const input = parsed.data;
    const available = input.available_quantity ?? input.total_quantity;
    if (available > input.total_quantity) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'available_quantity cannot exceed total_quantity.');
    }

    const { data, error } = await supabaseAdmin()
      .from('items')
      .insert({
        sku: input.sku,
        name: input.name,
        category: input.category ?? null,
        aliases: input.aliases,
        total_quantity: input.total_quantity,
        available_quantity: available,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ApiError(409, 'DUPLICATE_SKU', `An item with SKU "${input.sku}" already exists.`);
      }
      throw new ApiError(500, 'DB_ERROR', error.message);
    }

    return ok({ item: data }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function escapeForArrayLiteral(value: string): string {
  return value.replace(/[{}",]/g, '');
}
