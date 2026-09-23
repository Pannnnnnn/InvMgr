import { supabaseAdmin } from './supabase';
import { uploadWorkerPhoto, getSignedPhotoUrls } from './storage';
import { ApiError } from './http';
import type { Item, Transaction, TransactionWithItem } from './types';

export type CheckoutLineItem = { item_id: string; quantity: number };

/**
 * Shared commit path for both the AI-assisted checkout (/api/checkout) and
 * the 1-tap manual fallback (/api/transactions/manual) required by PRD 7
 * ("counter operations are never blocked if network or AI parsing errors
 * occur"). Uploads the photo once, then commits all line items atomically
 * via the checkout_batch RPC.
 */
export async function commitCheckout(params: {
  lineItems: CheckoutLineItem[];
  workerName: string | null;
  operatorId: string | null;
  notes?: string | null;
  imageBytes: Uint8Array;
  imageMimeType: string;
}): Promise<TransactionWithItem[]> {
  const { lineItems, workerName, operatorId, notes, imageBytes, imageMimeType } = params;

  if (lineItems.length === 0) {
    throw new ApiError(400, 'EMPTY_CHECKOUT', 'At least one resolved item is required to check out.');
  }

  const { path: photoPath } = await uploadWorkerPhoto({
    bytes: imageBytes,
    contentType: imageMimeType,
    filenameHint: workerName || 'checkout',
  });

  const { data, error } = await supabaseAdmin().rpc('checkout_batch', {
    p_items: lineItems.map((li) => ({ item_id: li.item_id, quantity: li.quantity })),
    p_worker_name: workerName,
    p_photo_url: photoPath,
    p_operator_id: operatorId,
    p_notes: notes ?? null,
  });

  if (error) {
    if (error.message?.includes('INSUFFICIENT_STOCK')) {
      throw new ApiError(409, 'INSUFFICIENT_STOCK', 'One or more items no longer have enough stock available.', {
        detail: error.message,
      });
    }
    throw new ApiError(502, 'CHECKOUT_FAILED', `Checkout could not be committed: ${error.message}`);
  }

  const transactions = (data ?? []) as Transaction[];
  return attachItemDetails(transactions);
}

async function attachItemDetails(rows: Transaction[]): Promise<TransactionWithItem[]> {
  if (rows.length === 0) return [];

  const itemIds = Array.from(new Set(rows.map((r) => r.item_id)));
  const { data: items } = await supabaseAdmin()
    .from('items')
    .select('id, sku, name, category')
    .in('id', itemIds);

  const itemsById = new Map<string, Pick<Item, 'id' | 'sku' | 'name' | 'category'>>(
    (items ?? []).map((it: Pick<Item, 'id' | 'sku' | 'name' | 'category'>) => [it.id, it])
  );
  const signedUrls = await getSignedPhotoUrls(Array.from(new Set(rows.map((r) => r.photo_url))));

  return rows.map((r) => ({
    ...r,
    item: itemsById.get(r.item_id) ?? null,
    photo_signed_url: signedUrls[r.photo_url] ?? null,
  }));
}
