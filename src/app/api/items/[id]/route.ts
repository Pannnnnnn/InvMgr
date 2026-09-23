import { NextRequest } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { ApiError, jsonError, ok } from '@/lib/http';
import { requireOperatorId } from '@/lib/auth';
import type { Item } from '@/lib/types';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data, error } = await supabaseAdmin().from('items').select('*').eq('id', params.id).single();
    if (error || !data) throw new ApiError(404, 'ITEM_NOT_FOUND', `No item with id ${params.id}.`);
    return ok({ item: data });
  } catch (err) {
    return jsonError(err);
  }
}

// .strict() on both branches matters here: z.object() silently strips
// unknown keys by default, so a plain (non-strict) fieldPatchSchema would
// happily "match" an { adjust: {...} } payload by stripping "adjust" down
// to an empty object, and the union would never fall through to
// adjustSchema. Strict mode makes each branch fail on the other's shape.
const fieldPatchSchema = z
  .object({
    sku: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    category: z.string().trim().min(1).nullable().optional(),
    aliases: z.array(z.string().min(1)).optional(),
  })
  .strict();

const adjustSchema = z.object({
  adjust: z.object({
    type: z.enum(['RESTOCK', 'BREAKAGE', 'LOSS', 'CORRECTION']),
    // RESTOCK/BREAKAGE/LOSS: a positive delta applied to the pool.
    // CORRECTION: the new absolute available_quantity (manual recount).
    quantity: z.number().int(),
    notes: z.string().max(500).optional(),
  }),
});

const patchSchema = z.union([fieldPatchSchema, adjustSchema]);

/**
 * PATCH /api/items/[id]
 * Two shapes, matching PRD 4.2 "Manual Overrides":
 *   { name, category, aliases, sku }                     — edit catalog metadata
 *   { adjust: { type, quantity, notes? } }                — restock/breakage/loss/correction
 * Kept as two independent write paths (rather than one merged payload) so a
 * stock adjustment can never accidentally slip in alongside an unrelated
 * metadata edit.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireOperatorId(req);

    const body = await req.json().catch(() => {
      throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
    });
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid item patch payload.', parsed.error.flatten());
    }

    if ('adjust' in parsed.data) {
      const item = await applyStockAdjustment(params.id, parsed.data.adjust);
      return ok({ item });
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'EMPTY_PATCH', 'Provide at least one field to update.');
    }

    const { data, error } = await supabaseAdmin()
      .from('items')
      .update(updates)
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new ApiError(404, 'ITEM_NOT_FOUND', `No item with id ${params.id}.`);
      if (error.code === '23505') throw new ApiError(409, 'DUPLICATE_SKU', 'That SKU is already in use.');
      throw new ApiError(500, 'DB_ERROR', error.message);
    }

    return ok({ item: data });
  } catch (err) {
    return jsonError(err);
  }
}

async function applyStockAdjustment(
  itemId: string,
  adjust: z.infer<typeof adjustSchema>['adjust']
): Promise<Item> {
  const { data: current, error: fetchErr } = await supabaseAdmin()
    .from('items')
    .select('*')
    .eq('id', itemId)
    .single();

  if (fetchErr || !current) throw new ApiError(404, 'ITEM_NOT_FOUND', `No item with id ${itemId}.`);

  let nextAvailable = current.available_quantity;
  let nextTotal = current.total_quantity;

  switch (adjust.type) {
    case 'RESTOCK':
      if (adjust.quantity <= 0) throw new ApiError(400, 'INVALID_QUANTITY', 'RESTOCK quantity must be positive.');
      nextTotal += adjust.quantity;
      nextAvailable += adjust.quantity;
      break;
    case 'BREAKAGE':
    case 'LOSS':
      if (adjust.quantity <= 0)
        throw new ApiError(400, 'INVALID_QUANTITY', `${adjust.type} quantity must be positive.`);
      if (adjust.quantity > current.available_quantity) {
        throw new ApiError(
          400,
          'INVALID_QUANTITY',
          `Cannot mark ${adjust.quantity} as ${adjust.type.toLowerCase()}; only ${current.available_quantity} are currently available (checked-out units can't be adjusted here).`
        );
      }
      nextTotal -= adjust.quantity;
      nextAvailable -= adjust.quantity;
      break;
    case 'CORRECTION':
      if (adjust.quantity < 0) throw new ApiError(400, 'INVALID_QUANTITY', 'CORRECTION quantity cannot be negative.');
      if (adjust.quantity > current.total_quantity) {
        throw new ApiError(
          400,
          'INVALID_QUANTITY',
          `CORRECTION available_quantity (${adjust.quantity}) cannot exceed total_quantity (${current.total_quantity}).`
        );
      }
      nextAvailable = adjust.quantity;
      break;
  }

  const { data: updated, error: updateErr } = await supabaseAdmin()
    .from('items')
    .update({ total_quantity: nextTotal, available_quantity: nextAvailable })
    .eq('id', itemId)
    .select('*')
    .single();

  if (updateErr || !updated) throw new ApiError(500, 'DB_ERROR', updateErr?.message ?? 'Failed to adjust stock.');
  return updated as Item;
}
