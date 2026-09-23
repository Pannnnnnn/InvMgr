import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ApiError, jsonError, ok } from '@/lib/http';
import { getSignedPhotoUrls } from '@/lib/storage';
import type { Item, Transaction, TransactionWithItem } from '@/lib/types';

/**
 * GET /api/transactions
 *   ?worker=      fuzzy match on worker_name
 *   ?item_id=     exact item filter
 *   ?status=      BORROWED | RETURNED
 *   ?from=&to=    ISO date range on borrowed_at
 *   ?limit=&offset=
 *
 * PRD 4.3: chronological audit log with worker photo (signed URL), name,
 * items, timestamp, status; searchable by date, worker name, or item type.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const worker = searchParams.get('worker')?.trim();
    const itemId = searchParams.get('item_id')?.trim();
    const status = searchParams.get('status')?.trim();
    const from = searchParams.get('from')?.trim();
    const to = searchParams.get('to')?.trim();
    const limit = clampInt(searchParams.get('limit'), 50, 1, 200);
    const offset = clampInt(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

    if (status && status !== 'BORROWED' && status !== 'RETURNED') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'status must be BORROWED or RETURNED.');
    }

    let query = supabaseAdmin()
      .from('transactions')
      .select('*', { count: 'exact' })
      .order('borrowed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (worker) query = query.ilike('worker_name', `%${worker}%`);
    if (itemId) query = query.eq('item_id', itemId);
    if (status) query = query.eq('status', status);
    if (from) query = query.gte('borrowed_at', from);
    if (to) query = query.lte('borrowed_at', to);

    const { data, error, count } = await query;
    if (error) throw new ApiError(500, 'DB_ERROR', error.message);

    const rows = (data ?? []) as Transaction[];
    const enriched = await attachItemAndSignedUrl(rows);

    return ok({ transactions: enriched, total: count ?? 0, limit, offset });
  } catch (err) {
    return jsonError(err);
  }
}

async function attachItemAndSignedUrl(rows: Transaction[]): Promise<TransactionWithItem[]> {
  if (rows.length === 0) return [];

  const itemIds = Array.from(new Set(rows.map((r) => r.item_id)));
  const { data: items } = await supabaseAdmin().from('items').select('id, sku, name, category').in('id', itemIds);
  const itemsById = new Map<string, Pick<Item, 'id' | 'sku' | 'name' | 'category'>>(
    (items ?? []).map((it: Pick<Item, 'id' | 'sku' | 'name' | 'category'>) => [it.id, it])
  );

  const photoPaths = Array.from(new Set(rows.map((r) => r.photo_url)));
  const signedUrls = await getSignedPhotoUrls(photoPaths);

  return rows.map((r) => ({
    ...r,
    item: itemsById.get(r.item_id) ?? null,
    photo_signed_url: signedUrls[r.photo_url] ?? null,
  }));
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
