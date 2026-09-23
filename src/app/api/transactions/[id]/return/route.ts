import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ApiError, jsonError, ok } from '@/lib/http';

/**
 * POST /api/transactions/[id]/return
 * Marks a BORROWED transaction as RETURNED and restocks the item
 * atomically (see return_item() in 0002_rpc_functions.sql).
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data, error } = await supabaseAdmin().rpc('return_item', { p_transaction_id: params.id }).single();

    if (error) {
      if (error.message?.includes('TRANSACTION_NOT_RETURNABLE')) {
        throw new ApiError(
          409,
          'TRANSACTION_NOT_RETURNABLE',
          'Transaction is missing or has already been returned.'
        );
      }
      throw new ApiError(500, 'DB_ERROR', error.message);
    }

    return ok({ transaction: data });
  } catch (err) {
    return jsonError(err);
  }
}
