import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { ApiError, jsonError, ok } from '@/lib/http';
import { requireManager } from '@/lib/auth';
import { suggestSku } from '@/lib/slugify';

/**
 * GET /api/items?search=&category=&limit=&offset=&includeInactive=
 * Real-time inventory catalog view (PRD 4.2): name, SKU, category, available
 * vs total quantity. `search` does a fuzzy match against name + aliases.
 * Archived items (is_active = false, see 0006_item_archive.sql) are hidden
 * by default — pass includeInactive=true (used by the inventory management
 * page, never the checkout item picker) to also list them.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();
    const category = searchParams.get('category')?.trim();
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const limit = clampInt(searchParams.get('limit'), 50, 1, 200);
    const offset = clampInt(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

    let query = supabaseAdmin()
      .from('items')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (!includeInactive) query = query.eq('is_active', true);
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
  // SKU is an internal catalog identifier (still unique/not-null in the DB
  // per the PRD schema), but managers found typing one for every item
  // pointless friction. It's now optional here and auto-generated
  // server-side from the item name when omitted — see createWithAutoSku().
  sku: z.string().min(1).optional(),
  name: z.string().min(1),
  category: z.string().trim().min(1).nullable().optional(),
  aliases: z.array(z.string().min(1)).default([]),
  total_quantity: z.number().int().min(0).default(1),
  available_quantity: z.number().int().min(0).optional(),
});

/**
 * POST /api/items — add a new catalog item. Manager-only.
 */
export async function POST(req: NextRequest) {
  try {
    await requireManager(req);

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

    const data = await createWithAutoSku({
      sku: input.sku,
      name: input.name,
      category: input.category ?? null,
      aliases: input.aliases,
      total_quantity: input.total_quantity,
      available_quantity: available,
    });

    return ok({ item: data }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Inserts an item, generating a fresh auto-SKU (name-based slug + random
 * suffix, see src/lib/slugify.ts) on every attempt that a caller didn't
 * supply one. Retries a few times on a SKU collision (23505) — vanishingly
 * unlikely with the random suffix, but the DB's UNIQUE constraint is the
 * real guarantee, not the odds.
 */
async function createWithAutoSku(input: {
  sku?: string;
  name: string;
  category: string | null;
  aliases: string[];
  total_quantity: number;
  available_quantity: number;
}) {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const sku = input.sku ?? suggestSku(input.name);
    const { data, error } = await supabaseAdmin()
      .from('items')
      .insert({
        sku,
        name: input.name,
        category: input.category,
        aliases: input.aliases,
        total_quantity: input.total_quantity,
        available_quantity: input.available_quantity,
        // Explicit, not left to the column default: a brand-new item must
        // never come back archived. (Reported bug: newly added items were
        // showing up archived immediately — this removes any dependency on
        // the DB column default actually being set correctly.)
        is_active: true,
      })
      .select('*')
      .single();

    if (!error) return data;

    if (error.code === '23505') {
      if (input.sku) {
        // The caller explicitly requested this SKU — don't silently retry
        // with a different one, surface the conflict instead.
        throw new ApiError(409, 'DUPLICATE_SKU', `An item with SKU "${input.sku}" already exists.`);
      }
      continue; // auto-generated SKU collided; try again with a new one
    }

    throw new ApiError(500, 'DB_ERROR', error.message);
  }

  throw new ApiError(500, 'DB_ERROR', 'Could not generate a unique SKU after several attempts.');
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function escapeForArrayLiteral(value: string): string {
  return value.replace(/[{}",]/g, '');
}
